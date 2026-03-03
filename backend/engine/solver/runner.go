package solver

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os/exec"
	"runtime"
	"strconv"
	"sync"
	"time"
)

// ─── 请求参数结构 ───

type SolveRequest struct {
	// 模式: "lcr" 或 "ccr" (必选)
	Mode string `json:"mode" binding:"required,oneof=lcr ccr"`

	// 评估模式: "bank"(固定fail数) 或 "chip"(泊松采样)
	EvalMode string `json:"evalMode"`

	// ─── Bank 模式参数 ───
	Sparse  int  `json:"sparse"`
	RowFail int  `json:"rowfail"`
	ColFail int  `json:"colfail"`
	BankCnt *int `json:"bankCnt,omitempty"` // bank模式=run次数, chip模式=每chip的bank数

	// ─── Chip 模式参数 ───
	ChipCnt          *int     `json:"chipCnt,omitempty" binding:"omitempty,gte=1"` // chip 数量 (默认100, 最小1)
	LambdaSparse     *float64 `json:"lambdaSparse,omitempty"`     // 分布均值: sparse fail 均值 μ
	SparseDispersion *float64 `json:"sparseDispersion,omitempty"` // overdispersion φ: Var=μ+μ²φ, φ=0 退化纯泊松
	RowPct           *float64 `json:"rowPct,omitempty"`           // row fail = sparse * rowPct / 100
	ColPct           *float64 `json:"colPct,omitempty"`           // col fail = sparse * colPct / 100

	// ─── 通用参数 ───
	Seed *uint32 `json:"seed,omitempty"`

	// 地址空间
	MaxRow *int `json:"maxrow,omitempty"`
	MaxCol *int `json:"maxcol,omitempty"`

	// 求解器参数
	RowCap              *int    `json:"rowcap,omitempty"`
	SectionCnt          *int    `json:"sectioncnt,omitempty"`
	ColSeg              *int    `json:"colseg,omitempty"`
	SectionGroupSize    *uint32 `json:"sectionGroupSize,omitempty"`
	SubsectionSize      *uint32 `json:"subsectionSize,omitempty"`
	SubsectionsPerGroup *uint32 `json:"subsectionsPerGroup,omitempty"`

	// LCR 专用
	CpsPerRegion *int `json:"cpsPerRegion,omitempty"`
	LcrCap       *int `json:"lcrCap,omitempty"`

	// CCR 专用
	CcrGroupsPerSection *int `json:"ccrGroupsPerSection,omitempty"`
	CcrCap              *int `json:"ccrCap,omitempty"`

	// 超时
	Timeout *int `json:"timeout,omitempty"`
}

// ─── Runner ───

type Runner struct {
	binaryPath string
	maxWorkers int // 最大并行子进程数
}

func NewRunner(binaryPath string) *Runner {
	maxWorkers := runtime.NumCPU() / 2
	if maxWorkers < 1 {
		maxWorkers = 1
	}
	return &Runner{
		binaryPath: binaryPath,
		maxWorkers: maxWorkers,
	}
}

// Run 执行 C++ solver (bank 模式) —— 并行拆分
func (r *Runner) Run(ctx context.Context, req *SolveRequest) (json.RawMessage, error) {
	bankCnt := 1
	if req.BankCnt != nil && *req.BankCnt > 0 {
		bankCnt = *req.BankCnt
	}

	timeout := 300 * time.Second
	if req.Timeout != nil && *req.Timeout > 0 {
		timeout = time.Duration(*req.Timeout) * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 如果 bankCnt <= 1 或只有 1 个 worker，不拆分，直接调用
	if bankCnt <= 1 || r.maxWorkers <= 1 {
		args := buildArgs(req)
		return r.execSolver(ctx, args)
	}

	// ─── 并行拆分：把 bankCnt 拆成多个子任务 ───
	var baseSeed uint32
	if req.Seed != nil {
		baseSeed = *req.Seed
	} else {
		baseSeed = uint32(time.Now().UnixNano() & 0xFFFFFFFF)
	}

	// 将 bankCnt 均匀分配到最多 maxWorkers 个子任务
	numWorkers := r.maxWorkers
	if numWorkers > bankCnt {
		numWorkers = bankCnt
	}

	// 计算每个 worker 的 bank 数量
	chunks := make([]int, numWorkers)
	base := bankCnt / numWorkers
	remainder := bankCnt % numWorkers
	for i := 0; i < numWorkers; i++ {
		chunks[i] = base
		if i < remainder {
			chunks[i]++
		}
	}

	type workerResult struct {
		idx  int
		resp CppResponse
		err  error
	}

	results := make(chan workerResult, numWorkers)
	sem := make(chan struct{}, numWorkers)

	for i := 0; i < numWorkers; i++ {
		sem <- struct{}{}
		go func(workerIdx int) {
			defer func() { <-sem }()

			// 为每个 worker 计算独立的 seed
			workerSeed := baseSeed + uint32(workerIdx)*10000
			workerBankCnt := chunks[workerIdx]

			// 复制请求
			oneReq := *req
			oneReq.Seed = &workerSeed
			oneReq.BankCnt = &workerBankCnt

			args := buildArgs(&oneReq)
			raw, err := r.execSolver(ctx, args)
			if err != nil {
				results <- workerResult{idx: workerIdx, err: err}
				return
			}

			var cppResp CppResponse
			if err := json.Unmarshal(raw, &cppResp); err != nil {
				results <- workerResult{idx: workerIdx, err: fmt.Errorf("worker %d: invalid JSON: %v", workerIdx, err)}
				return
			}

			results <- workerResult{idx: workerIdx, resp: cppResp}
		}(i)
	}

	// 收集结果
	allResults := make([]workerResult, numWorkers)
	for i := 0; i < numWorkers; i++ {
		wr := <-results
		if wr.err != nil {
			return nil, fmt.Errorf("parallel bank worker %d failed: %v", wr.idx, wr.err)
		}
		allResults[wr.idx] = wr
	}

	// 合并结果：按 worker 顺序拼接所有 runs, 重新编号
	var mergedRuns []json.RawMessage
	var firstConfig json.RawMessage
	runOffset := 0
	for _, wr := range allResults {
		if firstConfig == nil && wr.resp.Config != nil {
			firstConfig = wr.resp.Config
		}
		for _, bankRaw := range wr.resp.Runs {
			// 更新 run 编号
			var bankObj map[string]interface{}
			if err := json.Unmarshal(bankRaw, &bankObj); err == nil {
				bankObj["run"] = runOffset
				runOffset++
				if rewritten, err := json.Marshal(bankObj); err == nil {
					mergedRuns = append(mergedRuns, json.RawMessage(rewritten))
					continue
				}
			}
			mergedRuns = append(mergedRuns, bankRaw)
			runOffset++
		}
	}

	// 构建合并后的响应
	merged := map[string]interface{}{
		"mode":     req.Mode,
		"baseSeed": baseSeed,
		"runcnt":   len(mergedRuns),
		"config":   json.RawMessage(firstConfig),
		"runs":     mergedRuns,
	}
	result, err := json.Marshal(merged)
	if err != nil {
		return nil, fmt.Errorf("marshal merged result error: %v", err)
	}
	return json.RawMessage(result), nil
}

// ─── Chip Level 模式（并行版）───

type CppResponse struct {
	Mode     string            `json:"mode"`
	BaseSeed int               `json:"baseSeed"`
	RunCnt   int               `json:"runcnt"`
	Config   json.RawMessage   `json:"config"`
	Runs     []json.RawMessage `json:"runs"`
}

// RunChipLevel: 每个 chip 泊松采样 sparse, 按百分比算 row/col, 跑 bankCnt 个 bank
// 使用 goroutine 并行处理多个 chip，最多 maxWorkers 个并发子进程
func (r *Runner) RunChipLevel(ctx context.Context, req *SolveRequest) (json.RawMessage, error) {
	chipCnt := 100
	if req.ChipCnt != nil && *req.ChipCnt > 0 {
		chipCnt = *req.ChipCnt
	}
	bankCnt := 4
	if req.BankCnt != nil && *req.BankCnt > 0 {
		bankCnt = *req.BankCnt
	}
	lambdaSparse := 100.0
	if req.LambdaSparse != nil {
		lambdaSparse = *req.LambdaSparse
	}
	sparseDispersion := 0.0 // φ=0 → 纯泊松
	if req.SparseDispersion != nil && *req.SparseDispersion >= 0 {
		sparseDispersion = *req.SparseDispersion
	}
	rowPct := 10.0
	if req.RowPct != nil {
		rowPct = *req.RowPct
	}
	colPct := 10.0
	if req.ColPct != nil {
		colPct = *req.ColPct
	}

	var baseSeed int64
	if req.Seed != nil {
		baseSeed = int64(*req.Seed)
	} else {
		baseSeed = time.Now().UnixNano()
	}
	rng := rand.New(rand.NewSource(baseSeed))

	timeout := 600 * time.Second
	if req.Timeout != nil && *req.Timeout > 0 {
		timeout = time.Duration(*req.Timeout) * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// 预先为每个 chip 生成采样参数（需在单线程中使用 rng）
	type chipInput struct {
		idx      int
		sparse   int
		rowfail  int
		colfail  int
		chipSeed uint32
	}
	inputs := make([]chipInput, chipCnt)
	for i := 0; i < chipCnt; i++ {
		sparse := negativeBinomialSample(lambdaSparse, sparseDispersion, rng)
		rowfail := int(math.Round(float64(sparse) * rowPct / 100.0))
		colfail := int(math.Round(float64(sparse) * colPct / 100.0))
		chipSeed := uint32(rng.Int31())
		inputs[i] = chipInput{idx: i, sparse: sparse, rowfail: rowfail, colfail: colfail, chipSeed: chipSeed}
	}

	// 并行执行
	type chipResult struct {
		idx          int
		chip         map[string]interface{}
		config       json.RawMessage
		chipFeasible bool
		sparse       int
		err          error
	}

	results := make([]chipResult, chipCnt)
	sem := make(chan struct{}, r.maxWorkers) // 信号量限制并发
	var wg sync.WaitGroup

	for i := 0; i < chipCnt; i++ {
		wg.Add(1)
		go func(input chipInput) {
			defer wg.Done()

			sem <- struct{}{}        // 获取信号量
			defer func() { <-sem }() // 释放信号量

			if ctx.Err() != nil {
				results[input.idx] = chipResult{idx: input.idx, err: fmt.Errorf("cancelled")}
				return
			}

			// 构建请求
			oneReq := *req
			oneReq.Sparse = input.sparse
			oneReq.RowFail = input.rowfail
			oneReq.ColFail = input.colfail
			runcntVal := bankCnt
			oneReq.BankCnt = &runcntVal
			oneReq.Seed = &input.chipSeed

			rawResult, err := r.runOnce(ctx, &oneReq)
			if err != nil {
				results[input.idx] = chipResult{idx: input.idx, err: fmt.Errorf("chip %d failed: %v", input.idx, err)}
				return
			}

			var cppResp CppResponse
			if err := json.Unmarshal(rawResult, &cppResp); err != nil {
				results[input.idx] = chipResult{idx: input.idx, err: fmt.Errorf("chip %d: invalid response: %v", input.idx, err)}
				return
			}

			// 判断 chip 可行性
			chipFeasible := true
			for _, bankRaw := range cppResp.Runs {
				var bankObj map[string]interface{}
				if err := json.Unmarshal(bankRaw, &bankObj); err == nil {
					if f, ok := bankObj["feasible"].(bool); ok && !f {
						chipFeasible = false
					}
				}
			}

			chip := map[string]interface{}{
				"chip":           input.idx,
				"sampledSparse":  input.sparse,
				"sampledRowFail": input.rowfail,
				"sampledColFail": input.colfail,
				"chipFeasible":   chipFeasible,
				"banks":          cppResp.Runs,
			}

			results[input.idx] = chipResult{
				idx:          input.idx,
				chip:         chip,
				config:       cppResp.Config,
				chipFeasible: chipFeasible,
				sparse:       input.sparse,
			}
		}(inputs[i])
	}

	wg.Wait()

	// 汇总结果（按 chip 顺序）
	var chips []interface{}
	var firstConfig json.RawMessage
	feasibleChips := 0
	totalSparse := 0

	for _, cr := range results {
		if cr.err != nil {
			return nil, cr.err
		}
		if firstConfig == nil && cr.config != nil {
			firstConfig = cr.config
		}
		chips = append(chips, cr.chip)
		totalSparse += cr.sparse
		if cr.chipFeasible {
			feasibleChips++
		}
	}

	avgSparse := 0.0
	if chipCnt > 0 {
		avgSparse = float64(totalSparse) / float64(chipCnt)
	}

	response := map[string]interface{}{
		"mode":     req.Mode,
		"evalMode": "chip",
		"baseSeed": baseSeed,
		"chipCnt":  chipCnt,
		"bankCnt":  bankCnt,
		"config":   json.RawMessage(firstConfig),
		"chipParams": map[string]interface{}{
			"lambdaSparse":     lambdaSparse,
			"sparseDispersion": sparseDispersion,
			"rowPct":           rowPct,
			"colPct":           colPct,
		},
		"chips": chips,
		"summary": map[string]interface{}{
			"totalChips":    chipCnt,
			"feasibleChips": feasibleChips,
			"feasibleRate":  float64(feasibleChips) / float64(chipCnt),
			"avgSparse":     avgSparse,
		},
	}

	result, err := json.Marshal(response)
	if err != nil {
		return nil, fmt.Errorf("marshal error: %v", err)
	}
	return json.RawMessage(result), nil
}

func (r *Runner) runOnce(ctx context.Context, req *SolveRequest) (json.RawMessage, error) {
	args := buildArgs(req)
	return r.execSolver(ctx, args)
}

// execSolver 执行 C++ solver 子进程
func (r *Runner) execSolver(ctx context.Context, args []string) (json.RawMessage, error) {
	cmd := exec.CommandContext(ctx, r.binaryPath, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("solver timed out")
		}
		return nil, fmt.Errorf("solver failed: %v\nstderr: %s", err, stderr.String())
	}

	raw := stdout.Bytes()
	if !json.Valid(raw) {
		return nil, fmt.Errorf("invalid JSON: %s\nstderr: %s", string(raw), stderr.String())
	}
	return json.RawMessage(raw), nil
}

// ─── 负二项 / 泊松 采样 ───
//
// 参数:
//
//	mu  — 均值 (λ_sparse)
//	phi — overdispersion φ, Var = μ + μ²φ
//	      φ=0 退化为标准泊松; φ>0 方差更大(更发散)
//
// 实现: 负二项 = Gamma-Poisson 混合
//
//	r = 1/φ,  p = r/(r+μ)  →  NB(r, p)
//	先从 Gamma(r, μ/r) 采样出 λ', 再泊松采样
func negativeBinomialSample(mu, phi float64, rng *rand.Rand) int {
	if mu <= 0 {
		return 0
	}
	// phi ≈ 0: 纯泊松
	if phi < 1e-9 {
		return poissonSample(mu, rng)
	}
	// r = 1/phi (shape), scale = mu*phi (= mu/r)
	r := 1.0 / phi
	// Gamma 采样: shape=r, scale=mu*phi
	lambdaPrime := gammaRand(r, mu*phi, rng)
	if lambdaPrime <= 0 {
		return 0
	}
	return poissonSample(lambdaPrime, rng)
}

// gammaRand 使用 Marsaglia-Tsang 方法采样 Gamma(shape, scale)
func gammaRand(shape, scale float64, rng *rand.Rand) float64 {
	if shape <= 0 || scale <= 0 {
		return 0
	}
	if shape < 1.0 {
		// Boost: Gamma(shape) = Gamma(shape+1) * U^(1/shape)
		return gammaRand(shape+1, scale, rng) * math.Pow(rng.Float64(), 1.0/shape)
	}
	d := shape - 1.0/3.0
	c := 1.0 / math.Sqrt(9.0*d)
	for {
		x := rng.NormFloat64()
		v := 1.0 + c*x
		if v <= 0 {
			continue
		}
		v = v * v * v
		u := rng.Float64()
		if u < 1.0-0.0331*(x*x)*(x*x) {
			return d * v * scale
		}
		if math.Log(u) < 0.5*x*x+d*(1.0-v+math.Log(v)) {
			return d * v * scale
		}
	}
}

// poissonSample 标准泊松采样
func poissonSample(lambda float64, rng *rand.Rand) int {
	if lambda <= 0 {
		return 0
	}
	if lambda > 30 {
		val := lambda + math.Sqrt(lambda)*rng.NormFloat64()
		if val < 0 {
			return 0
		}
		return int(math.Round(val))
	}
	L := math.Exp(-lambda)
	k := 0
	p := 1.0
	for {
		k++
		p *= rng.Float64()
		if p < L {
			break
		}
	}
	return k - 1
}

// ─── 参数构建 ───

func buildArgs(req *SolveRequest) []string {
	args := []string{}

	switch req.Mode {
	case "lcr":
		args = append(args, "-lcr")
	case "ccr":
		args = append(args, "-ccr")
	}

	args = append(args, "-sparse", strconv.Itoa(req.Sparse))
	args = append(args, "-rowfail", strconv.Itoa(req.RowFail))
	args = append(args, "-colfail", strconv.Itoa(req.ColFail))

	appendIntArg(&args, "-maxrow", req.MaxRow)
	appendIntArg(&args, "-maxcol", req.MaxCol)
	appendIntArg(&args, "-rowcap", req.RowCap)
	appendIntArg(&args, "-sectioncnt", req.SectionCnt)
	appendIntArg(&args, "-colseg", req.ColSeg)
	appendUint32Arg(&args, "-sectionGroupSize", req.SectionGroupSize)
	appendUint32Arg(&args, "-subsectionSize", req.SubsectionSize)
	appendUint32Arg(&args, "-subsectionsPerGroup", req.SubsectionsPerGroup)

	appendIntArg(&args, "-cpsPerRegion", req.CpsPerRegion)
	appendIntArg(&args, "-lcrCap", req.LcrCap)

	appendIntArg(&args, "-ccrGroupsPerSection", req.CcrGroupsPerSection)
	appendIntArg(&args, "-ccrCap", req.CcrCap)

	appendIntArg(&args, "-runcnt", req.BankCnt)
	appendUint32Arg(&args, "-seed", req.Seed)

	return args
}

func appendIntArg(args *[]string, flag string, val *int) {
	if val != nil {
		*args = append(*args, flag, strconv.Itoa(*val))
	}
}

func appendUint32Arg(args *[]string, flag string, val *uint32) {
	if val != nil {
		*args = append(*args, flag, strconv.FormatUint(uint64(*val), 10))
	}
}
