import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ─── 翻译字典 ───

export interface I18nStrings {
    // App
    appTitle: string;
    idle: string;
    pass: string;
    explorerTitle: string;
    outputTitle: string;
    fails: string;
    repairs: string;
    statusVersion: string;
    repairMapTab: string;

    // ControlPanel
    modeLabel: string;
    evalLabel: string;
    bankDesc: string;
    chipDesc: string;
    failGen: string;
    execution: string;
    chipConfig: string;
    poissonSparse: string;
    poissonDispersion: string;
    rowColPct: string;
    preview: string;
    advancedParams: string;
    addressSpace: string;
    solverParams: string;
    lcrParams: string;
    ccrParams: string;
    solving: string;
    evalChips: (n: number) => string;
    solve: string;

    // ResultPanel
    noResults: string;
    noResultsHint: string;
    runsHeader: string;
    chipsHeader: string;
    detailHeader: string;
    infeasible: string;
    feasible: string;
    avgTime: string;
    chipPass: string;
    avgSparse: string;
    // detail labels
    seed: string;
    totalFails: string;
    totalUsed: string;
    solvedBy: string;
    greedyTime: string;
    mipTime: string;
    rowRepairs: string;
    colRepairs: string;
    chip: string;
    bank: string;

    // RepairMap
    awaitingSolve: string;
    infeasibleNoViz: string;
    assignments: string;
    legendRow: string;
    legendLcr: string;
    legendCcr: string;
    legendFail: string;

    // Empty state landing
    landingTitle: string;
    landingDesc: string;
}

const EN: I18nStrings = {
    appTitle: 'DRAM Repair Solver',
    idle: 'idle',
    pass: 'pass',
    explorerTitle: 'Explorer: Solver Config',
    outputTitle: 'Output: Results',
    fails: 'fails',
    repairs: 'repairs',
    statusVersion: 'DRAM Repair Solver v1.0',
    repairMapTab: 'repair_map.canvas',

    modeLabel: '// mode',
    evalLabel: '// eval level',
    bankDesc: 'bank — fixed fail count',
    chipDesc: 'chip — Poisson sampling',
    failGen: '// fail generation',
    execution: '// execution',
    chipConfig: '// chip config',
    poissonSparse: '// Poisson sparse',
    poissonDispersion: '// dispersion (φ=0: Poisson, φ>0: overdispersed)',
    rowColPct: '// row/col as % of sparse',
    preview: '// preview',
    advancedParams: '// advanced params',
    addressSpace: '// address space',
    solverParams: '// solver params',
    lcrParams: '// lcr params',
    ccrParams: '// ccr params',
    solving: 'solving...',
    evalChips: (n) => `▶ eval ${n} chips`,
    solve: '▶ solve()',

    noResults: '// no results yet',
    noResultsHint: '// configure params and click solve()',
    runsHeader: 'Runs',
    chipsHeader: 'Chips',
    detailHeader: 'Detail',
    infeasible: 'infeasible',
    feasible: 'feasible',
    avgTime: 'avg_time',
    chipPass: 'chip_pass',
    avgSparse: 'avg_sparse',
    seed: 'seed',
    totalFails: 'total_fails',
    totalUsed: 'total_used',
    solvedBy: 'solved_by',
    greedyTime: 'greedy_t',
    mipTime: 'mip_t',
    rowRepairs: 'row_repairs',
    colRepairs: 'col_repairs',
    chip: 'Chip',
    bank: 'Bank',

    awaitingSolve: '// awaiting solve()',
    infeasibleNoViz: '// infeasible — no visualization',
    assignments: 'assignments',
    legendRow: 'row',
    legendLcr: 'lcr',
    legendCcr: 'ccr',
    legendFail: 'fail',

    landingTitle: 'DRAM Redundancy Repair Solver',
    landingDesc: 'Configure parameters on the left panel, then click Solve to visualize repair results.',
};

const ZH: I18nStrings = {
    appTitle: 'DRAM 修复求解器',
    idle: '空闲',
    pass: '通过',
    explorerTitle: '浏览器: 求解配置',
    outputTitle: '输出: 结果',
    fails: '故障',
    repairs: '修复',
    statusVersion: 'DRAM 修复求解器 v1.0',
    repairMapTab: '修复分布图',

    modeLabel: '// 模式',
    evalLabel: '// 评估层级',
    bankDesc: 'bank — 固定故障数',
    chipDesc: 'chip — 泊松采样',
    failGen: '// 故障生成',
    execution: '// 执行',
    chipConfig: '// 芯片配置',
    poissonSparse: '// 泊松稀疏故障',
    poissonDispersion: '// 发散参数 (φ=0:泊松, φ>0:负二项/发散加大)',
    rowColPct: '// row/col 占 sparse 百分比',
    preview: '// 预览',
    advancedParams: '// 高级参数',
    addressSpace: '// 地址空间',
    solverParams: '// 求解器参数',
    lcrParams: '// LCR 参数',
    ccrParams: '// CCR 参数',
    solving: '求解中...',
    evalChips: (n) => `▶ 评估 ${n} 芯片`,
    solve: '▶ 求解()',

    noResults: '// 暂无结果',
    noResultsHint: '// 配置参数后点击求解',
    runsHeader: '运行列表',
    chipsHeader: '芯片列表',
    detailHeader: '详情',
    infeasible: '不可行',
    feasible: '可行',
    avgTime: '平均耗时',
    chipPass: '芯片通过',
    avgSparse: '平均稀疏',
    seed: '种子',
    totalFails: '总故障',
    totalUsed: '已使用',
    solvedBy: '求解方式',
    greedyTime: '贪心耗时',
    mipTime: 'MIP耗时',
    rowRepairs: '行修复',
    colRepairs: '列修复',
    chip: '芯片',
    bank: 'Bank',

    awaitingSolve: '// 等待求解...',
    infeasibleNoViz: '// 不可行 — 无法可视化',
    assignments: '分配数',
    legendRow: '行修复',
    legendLcr: 'LCR列修复',
    legendCcr: 'CCR列修复',
    legendFail: '故障点',

    landingTitle: 'DRAM 冗余修复求解器',
    landingDesc: '在左侧面板配置参数，然后点击求解按钮查看修复结果。',
};

const LANGS: Record<string, I18nStrings> = { EN, '中文': ZH };

// ─── Context ───

interface I18nContextValue {
    t: I18nStrings;
    lang: string;
    setLang: (lang: string) => void;
    langNames: string[];
}

const I18nContext = createContext<I18nContextValue>({
    t: EN,
    lang: 'EN',
    setLang: () => { },
    langNames: Object.keys(LANGS),
});

export function useI18n() {
    return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState('EN');

    const setLang = useCallback((l: string) => {
        if (LANGS[l]) setLangState(l);
    }, []);

    const t = LANGS[lang] ?? EN;

    return (
        <I18nContext.Provider value={{ t, lang, setLang, langNames: Object.keys(LANGS) }}>
            {children}
        </I18nContext.Provider>
    );
}
