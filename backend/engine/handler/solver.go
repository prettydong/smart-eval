package handler

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"cxmt-ra-smart-eval/engine/solver"

	"github.com/gin-gonic/gin"
)

type SolverHandler struct {
	runner *solver.Runner
}

func NewSolverHandler(runner *solver.Runner) *SolverHandler {
	return &SolverHandler{runner: runner}
}

// Solve 处理 POST /api/v1/solve
//
// 支持两种模式:
//   - evalMode="bank" (默认): 固定 fail 数, 跑 bankCnt 次
//   - evalMode="chip": 泊松采样 fail 数, 跑 chipCnt 个 chip
func (h *SolverHandler) Solve(c *gin.Context) {
	var req solver.SolveRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid_request",
			"message": err.Error(),
			"hint":    "Required: mode (lcr|ccr). Bank mode: sparse, rowfail, colfail. Chip mode: chipCnt, lambdaRow, lambdaCol.",
		})
		return
	}

	startTime := time.Now()

	var result []byte
	var err error

	if req.EvalMode == "chip" {
		chipCnt := 100
		if req.ChipCnt != nil {
			chipCnt = *req.ChipCnt
		}
		log.Printf("📥 Chip-level solve: mode=%s chipCnt=%d λ_sparse=%v rowPct=%v colPct=%v",
			req.Mode, chipCnt, ptrFloat64Str(req.LambdaSparse), ptrFloat64Str(req.RowPct), ptrFloat64Str(req.ColPct))

		result, err = h.runner.RunChipLevel(c.Request.Context(), &req)
	} else {
		// Bank 模式 (默认)
		log.Printf("📥 Bank-level solve: mode=%s sparse=%d rowfail=%d colfail=%d bankCnt=%v",
			req.Mode, req.Sparse, req.RowFail, req.ColFail, ptrIntStr(req.BankCnt))

		result, err = h.runner.Run(c.Request.Context(), &req)
	}

	if err != nil {
		log.Printf("❌ Solver error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "solver_error",
			"message": err.Error(),
		})
		return
	}

	elapsed := time.Since(startTime)
	log.Printf("✅ Solve completed in %v", elapsed)

	c.Data(http.StatusOK, "application/json; charset=utf-8", result)
}

func (h *SolverHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "dram-repair-solver",
		"time":    time.Now().Format(time.RFC3339),
	})
}

func ptrIntStr(p *int) string {
	if p == nil {
		return "1(default)"
	}
	return fmt.Sprintf("%d", *p)
}

func ptrFloat64Str(p *float64) string {
	if p == nil {
		return "default"
	}
	return fmt.Sprintf("%.1f", *p)
}
