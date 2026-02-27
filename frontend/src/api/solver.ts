import axios from 'axios';

const api = axios.create({
    baseURL: '/api/v1',
    timeout: 600_000,
    headers: { 'Content-Type': 'application/json' },
});

// ─── 请求类型 ───

export interface SolveRequest {
    mode: 'lcr' | 'ccr';
    evalMode?: 'bank' | 'chip';

    // Bank 模式
    sparse?: number;
    rowfail?: number;
    colfail?: number;
    bankCnt?: number;

    // Chip 模式
    chipCnt?: number;
    lambdaSparse?: number;
    sparseDispersion?: number;   // overdispersion φ, Var=μ+μ²φ; 0=纯泊松
    rowPct?: number;
    colPct?: number;

    // 通用
    seed?: number;
    maxrow?: number;
    maxcol?: number;
    rowcap?: number;
    sectioncnt?: number;
    colseg?: number;
    sectionGroupSize?: number;
    subsectionSize?: number;
    subsectionsPerGroup?: number;
    cpsPerRegion?: number;
    lcrCap?: number;
    ccrGroupsPerSection?: number;
    ccrCap?: number;
    timeout?: number;
}

// ─── 响应类型 ───

export interface Assignment {
    row: number;
    col: number;
    group: string;
}

export interface RunResult {
    run: number;
    seed: number;
    totalFails: number;
    feasible: boolean;
    solveTime: number;
    greedyTime: number;
    mipTime: number;
    solvedBy: string;
    objectiveValue?: number;
    totalUsed?: number;
    groupUsage?: Record<string, number>;
    rowRepairs?: Record<string, number[]>;
    colRepairs?: Record<string, number[]>;
    colStrategies?: Record<string, string[]>;
    assignments?: Assignment[];
    solverStatus?: string;
}

// Bank 模式响应
export interface BankSolveResponse {
    mode: string;
    evalMode?: undefined | 'bank';
    baseSeed: number;
    runcnt: number;
    config: Record<string, number>;
    runs: RunResult[];
}

// Chip 模式响应
export interface ChipResult {
    chip: number;
    sampledSparse: number;
    sampledRowFail: number;
    sampledColFail: number;
    chipFeasible: boolean;
    banks: RunResult[];
}

export interface ChipSolveResponse {
    mode: string;
    evalMode: 'chip';
    baseSeed: number;
    chipCnt: number;
    bankCnt: number;
    config: Record<string, number>;
    chipParams: {
        lambdaSparse: number;
        sparseDispersion: number;
        rowPct: number;
        colPct: number;
    };
    chips: ChipResult[];
    summary: {
        totalChips: number;
        feasibleChips: number;
        feasibleRate: number;
        avgSparse: number;
    };
}

export type SolveResponse = BankSolveResponse | ChipSolveResponse;

export function isChipResponse(r: SolveResponse): r is ChipSolveResponse {
    return r.evalMode === 'chip';
}

export interface HealthResponse {
    status: string;
    service: string;
    time: string;
}

// ─── API 方法 ───

export async function solve(req: SolveRequest): Promise<SolveResponse> {
    const { data } = await api.post<SolveResponse>('/solve', req);
    return data;
}

export async function healthCheck(): Promise<HealthResponse> {
    const { data } = await api.get<HealthResponse>('/health');
    return data;
}

export default api;
