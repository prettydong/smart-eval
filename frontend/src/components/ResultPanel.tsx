import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box, Stack, Typography, LinearProgress, List, ListItemButton, ListItemText, Collapse,
} from '@mui/material';
import type { SolveResponse, BankSolveResponse, ChipSolveResponse, RunResult } from '../api/solver';
import { useAppTheme, type AppTheme } from '../themes';
import { useI18n, type I18nStrings } from '../i18n';

function isChipResp(r: SolveResponse): r is ChipSolveResponse {
    return r.evalMode === 'chip';
}

const hiddenScrollSx = {
    overflow: 'auto',
    scrollbarWidth: 'none' as const,
    '&::-webkit-scrollbar': { display: 'none' },
};

interface ResultPanelProps {
    data: SolveResponse | null;
    selectedRun: number;
    onSelectRun: (idx: number) => void;
    selectedChip: number;
    selectedBank: number;
    onSelectChipBank: (chip: number, bank: number) => void;
    scrollToChip?: number;  // 外部触发：展开并滚动到该 chip
}

export default function ResultPanel(props: ResultPanelProps) {
    const { theme: th } = useAppTheme();
    const { t: i } = useI18n();
    const { data } = props;

    if (!data) {
        return (
            <Box sx={{ p: 1, color: th.textMuted, flex: 1 }}>
                <Typography sx={{ fontSize: '0.9rem', fontStyle: 'italic' }}>{i.noResults}</Typography>
                <Typography sx={{ fontSize: '0.9rem', fontStyle: 'italic', mt: 0.5 }}>{i.noResultsHint}</Typography>
            </Box>
        );
    }

    if (isChipResp(data)) return <ChipPanel {...props} data={data} th={th} i={i} />;
    return <BankPanel {...props} data={data as BankSolveResponse} th={th} i={i} />;
}

// ─── Bank ───

function BankPanel({ data, selectedRun, onSelectRun, th, i }: {
    data: BankSolveResponse; selectedRun: number; onSelectRun: (i: number) => void;
    th: AppTheme; i: I18nStrings;
} & Partial<ResultPanelProps>) {
    const fc = data.runs.filter(r => r.feasible).length;
    const fr = (fc / data.runs.length) * 100;
    const at = data.runs.reduce((s, r) => s + r.solveTime, 0) / data.runs.length;
    const run = data.runs[selectedRun];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Box sx={{ flexShrink: 0, p: 1, borderBottom: `1px solid ${th.border}` }}>
                <Stack spacing={0.3}>
                    <SL th={th} label="mode" value={data.mode} color={th.pink} />
                    <SL th={th} label="eval" value={`bank ×${data.runs.length}`} color={th.orange} />
                    <SL th={th} label={i.feasible} value={`${fc}/${data.runs.length} (${fr.toFixed(1)}%)`} color={rc(fr, th)} />
                    <SL th={th} label={i.avgTime} value={`${(at * 1000).toFixed(2)}ms`} color={th.cyan} />
                </Stack>
                <FB value={fr} th={th} />
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, ...hiddenScrollSx }}>
                <SH text={i.runsHeader} th={th} />
                <List dense disablePadding>
                    {data.runs.map((r, idx) => (
                        <RunItem key={idx} run={r} label={`#${r.run}`} selected={selectedRun === idx}
                            onClick={() => onSelectRun(idx)} th={th} i={i} />
                    ))}
                </List>
            </Box>

            {run && (
                <Box sx={{ flexShrink: 0 }}><RunDetail run={run} label={`Run #${run.run}`} th={th} i={i} /></Box>
            )}
        </Box>
    );
}

// ─── Chip ───

function ChipPanel({ data, selectedChip, selectedBank, onSelectChipBank, scrollToChip, th, i }: {
    data: ChipSolveResponse; selectedChip: number; selectedBank: number;
    onSelectChipBank: (c: number, b: number) => void;
    scrollToChip?: number;
    th: AppTheme; i: I18nStrings;
} & Partial<ResultPanelProps>) {
    const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
    const chipRowRefs = useRef<Map<number, HTMLElement>>(new Map());
    const scrollBoxRef = useRef<HTMLDivElement>(null);

    const toggle = (idx: number) => {
        setExpanded(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
    };

    // 外部触发：展开 chip 并 scroll 到其行
    useEffect(() => {
        if (scrollToChip == null) return;
        // 展开该 chip，同时折叠其他所有
        setExpanded(new Set([scrollToChip]));
        // 等 DOM 更新后再滚动
        requestAnimationFrame(() => {
            const el = chipRowRefs.current.get(scrollToChip);
            const box = scrollBoxRef.current;
            if (el && box) {
                const elTop = el.offsetTop - box.offsetTop;
                box.scrollTo({ top: elTop - 8, behavior: 'smooth' });
            }
        });
    }, [scrollToChip]);

    const setChipRef = useCallback((chipId: number, el: HTMLElement | null) => {
        if (el) chipRowRefs.current.set(chipId, el);
        else chipRowRefs.current.delete(chipId);
    }, []);

    const s = data.summary;
    const fr = s.feasibleRate * 100;
    const cChip = data.chips[selectedChip];
    const cBank = cChip?.banks[selectedBank];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Box sx={{ flexShrink: 0, p: 1, borderBottom: `1px solid ${th.border}` }}>
                <Stack spacing={0.3}>
                    <SL th={th} label="mode" value={data.mode} color={th.pink} />
                    <SL th={th} label="eval" value={`chip ×${data.chipCnt}, bank ×${data.bankCnt}`} color={th.orange} />
                    <SL th={th} label={i.chipPass} value={`${s.feasibleChips}/${s.totalChips} (${fr.toFixed(1)}%)`} color={rc(fr, th)} />
                    <SL th={th} label="λ_sparse" value={`${data.chipParams.lambdaSparse}`} color={th.yellow} />
                    <SL th={th} label="row/col%" value={`${data.chipParams.rowPct}% / ${data.chipParams.colPct}%`} color={th.yellow} />
                    <SL th={th} label={i.avgSparse} value={`${s.avgSparse.toFixed(1)}`} color={th.cyan} />
                </Stack>
                <FB value={fr} th={th} />
            </Box>

            <Box ref={scrollBoxRef} sx={{ flex: 1, minHeight: 0, ...hiddenScrollSx }}>
                <SH text={i.chipsHeader} th={th} />
                {data.chips.map((chip) => {
                    const exp = expanded.has(chip.chip);
                    const isSel = selectedChip === chip.chip;
                    return (
                        <Box key={chip.chip} ref={(el) => setChipRef(chip.chip, el as HTMLElement | null)}>
                            <Box onClick={() => toggle(chip.chip)} sx={{
                                display: 'flex', alignItems: 'center', px: 1, py: 0.3, cursor: 'pointer',
                                borderBottom: `1px solid ${th.border}`, bgcolor: isSel ? th.bgSelected : 'transparent',
                                '&:hover': { bgcolor: th.bgHover }, gap: 0.5,
                            }}>
                                <Typography sx={{ fontSize: '0.8rem', color: th.textMuted, width: 12 }}>{exp ? '▾' : '▸'}</Typography>
                                <Typography sx={{ fontSize: '0.8rem', color: chip.chipFeasible ? th.green : th.pink, width: 12 }}>{chip.chipFeasible ? '✓' : '✗'}</Typography>
                                <Typography sx={{ fontSize: '0.85rem', color: th.text, flex: 1 }}>Chip #{chip.chip}</Typography>
                                <Typography sx={{ fontSize: '0.75rem', color: th.textMuted }}>s:{chip.sampledSparse} r:{chip.sampledRowFail} c:{chip.sampledColFail}</Typography>
                            </Box>
                            <Collapse in={exp}>
                                {chip.banks.map((bank, bIdx) => (
                                    <Box key={bIdx} onClick={() => onSelectChipBank(chip.chip, bIdx)} sx={{
                                        display: 'flex', alignItems: 'center', pl: 3.5, pr: 1, py: 0.2, cursor: 'pointer',
                                        borderBottom: `1px solid ${th.borderSubtle}`, bgcolor: isSel && selectedBank === bIdx ? th.bgSelected : 'transparent',
                                        '&:hover': { bgcolor: th.bgHover }, gap: 0.5,
                                    }}>
                                        <Typography sx={{ fontSize: '0.75rem', color: th.textMuted }}>{bIdx < chip.banks.length - 1 ? '├' : '└'}</Typography>
                                        <Typography sx={{ fontSize: '0.75rem', color: bank.feasible ? th.green : th.pink, width: 10 }}>{bank.feasible ? '✓' : '✗'}</Typography>
                                        <Typography sx={{ fontSize: '0.8rem', color: th.text }}>Bank #{bIdx}</Typography>
                                        <Box sx={{ flex: 1 }} />
                                        <Typography sx={{ fontSize: '0.7rem', color: th.textMuted }}>
                                            {bank.feasible ? `${bank.totalFails}→${bank.totalUsed} ${(bank.solveTime * 1000).toFixed(1)}ms` : `${bank.totalFails} ${i.infeasible}`}
                                        </Typography>
                                    </Box>
                                ))}
                            </Collapse>
                        </Box>
                    );
                })}
            </Box>

            {cBank && (
                <Box sx={{ flexShrink: 0 }}><RunDetail run={cBank} label={`${i.chip} #${selectedChip} / ${i.bank} #${selectedBank}`} th={th} i={i} /></Box>
            )}
        </Box>
    );
}

// ─── Shared ───

function RunItem({ run, label, selected, onClick, th, i }: {
    run: RunResult; label: string; selected: boolean; onClick: () => void; th: AppTheme; i: I18nStrings;
}) {
    return (
        <ListItemButton selected={selected} onClick={onClick} sx={{
            py: 0.3, px: 1, borderBottom: `1px solid ${th.border}`,
            '&.Mui-selected': { bgcolor: th.bgSelected, '&:hover': { bgcolor: th.bgSelected } },
            '&:hover': { bgcolor: th.bgHover },
        }}>
            <Typography sx={{ width: 14, fontSize: '0.9rem', color: run.feasible ? th.green : th.pink, mr: 0.5 }}>
                {run.feasible ? '✓' : '✗'}
            </Typography>
            <ListItemText primary={label}
                secondary={run.feasible
                    ? `${run.totalFails}→${run.totalUsed} | ${(run.solveTime * 1000).toFixed(1)}ms | ${run.solvedBy}`
                    : `${run.totalFails} ${i.fails} — ${i.infeasible}`}
                slotProps={{
                    primary: { sx: { fontSize: '0.9rem', color: th.text } },
                    secondary: { sx: { fontSize: '0.8rem', color: th.textMuted } },
                }} />
        </ListItemButton>
    );
}

function RunDetail({ run, label, th, i }: { run: RunResult; label: string; th: AppTheme; i: I18nStrings }) {
    return (
        <Box sx={{ borderTop: `1px solid ${th.border}` }}>
            <SH text={`${i.detailHeader}: ${label}`} th={th} />
            <Box sx={{ p: 1 }}>
                <Stack spacing={0.3}>
                    <SL th={th} label={i.seed} value={`${run.seed}`} color={th.purple} />
                    <SL th={th} label={i.totalFails} value={`${run.totalFails}`} color={th.pink} />
                    {run.feasible ? (
                        <SL th={th} label={i.totalUsed} value={`${run.totalUsed}`} color={th.green} />
                    ) : (
                        <SL th={th} label="status" value={run.solverStatus ?? i.infeasible} color={th.pink} />
                    )}
                    <SL th={th} label={i.solvedBy} value={run.solvedBy} color={run.solvedBy === 'QuickSolve' ? th.green : th.orange} />
                    <SL th={th} label={i.greedyTime} value={`${(run.greedyTime * 1000).toFixed(3)}ms`} color={th.cyan} />
                    <SL th={th} label={i.mipTime} value={`${(run.mipTime * 1000).toFixed(3)}ms`} color={th.cyan} />
                    <SL th={th} label="solve" value={`${(run.solveTime * 1000).toFixed(2)}ms`} color={th.cyan} />
                    {run.feasible && run.rowRepairs && Object.keys(run.rowRepairs).length > 0 && (
                        <SL th={th} label={i.rowRepairs} value={`${Object.keys(run.rowRepairs).length}`} color={th.cyan} />
                    )}
                    {run.feasible && run.colRepairs && (
                        <SL th={th} label={i.colRepairs} value={`${Object.keys(run.colRepairs).length}`} color={th.purple} />
                    )}
                </Stack>
            </Box>
        </Box>
    );
}

function SH({ text, th }: { text: string; th: AppTheme }) {
    return (
        <Box sx={{ px: 1, py: 0.5, bgcolor: th.bgDark, borderBottom: `1px solid ${th.border}` }}>
            <Typography sx={{ fontSize: '0.8rem', color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{text}</Typography>
        </Box>
    );
}

function SL({ label, value, color, th }: { label: string; value: string; color: string; th: AppTheme }) {
    return (
        <Stack direction="row" spacing={0.5} sx={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
            <Typography component="span" sx={{ fontSize: 'inherit', color: th.textMuted }}>{label}:</Typography>
            <Typography component="span" sx={{ fontSize: 'inherit', color }}>{value}</Typography>
        </Stack>
    );
}

function FB({ value, th }: { value: number; th: AppTheme }) {
    return (
        <LinearProgress variant="determinate" value={value} sx={{
            mt: 1, height: 3, bgcolor: th.border, borderRadius: 0,
            '& .MuiLinearProgress-bar': { bgcolor: rc(value, th), borderRadius: 0 },
        }} />
    );
}

function rc(rate: number, th: AppTheme) {
    return rate >= 90 ? th.green : rate >= 50 ? th.orange : th.pink;
}
