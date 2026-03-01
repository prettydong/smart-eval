import { useState, useEffect } from 'react';
import {
    Box, Button, FormControl, InputLabel, MenuItem, Select,
    TextField, Typography, Stack, CircularProgress, Collapse,
} from '@mui/material';
import type { SolveRequest } from '../api/solver';
import { useAppTheme } from '../themes';
import { useI18n } from '../i18n';

interface ControlPanelProps {
    onSolve: (req: SolveRequest) => void;
    loading: boolean;
}

const getFieldSx = (th: any) => ({
    mb: 0.5,
    '& .MuiInputLabel-root': { fontSize: '0.9rem', color: th.textMuted },
    '& .MuiOutlinedInput-root': {
        color: th.text,
        '& fieldset': { borderColor: th.border },
        '&:hover fieldset': { borderColor: th.textMuted },
        '&.Mui-focused fieldset': { borderColor: th.cyan },
    },
});

// 整数输入框（修复前导零 bug）
const F = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => {
    const { theme: th } = useAppTheme();
    const [text, setText] = useState(String(value));

    // 外部 value 变化时同步（例如重置）
    useEffect(() => { setText(String(value)); }, [value]);

    return (
        <TextField label={label} type="text" size="small" fullWidth
            value={text}
            onChange={(e) => {
                const raw = e.target.value;
                // 允许输入过程中为空或纯数字
                if (raw === '' || /^\d+$/.test(raw)) {
                    // 去除前导零："0123" → "123"，但保留 "0"
                    const clean = raw === '' ? '' : String(parseInt(raw, 10));
                    setText(clean);
                    onChange(clean === '' ? 0 : parseInt(clean, 10));
                }
            }}
            onBlur={() => {
                // 失焦时如果空则补全 0
                if (text === '') { setText('0'); onChange(0); }
            }}
            slotProps={{ htmlInput: { min: 0, style: { padding: '4px 8px', fontSize: '0.95rem' } } }}
            sx={getFieldSx(th)} />
    );
};

// 浮点输入框（修复前导零）
const Ff = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => {
    const { theme: th } = useAppTheme();
    const [text, setText] = useState(String(value));

    useEffect(() => { setText(String(value)); }, [value]);

    return (
        <TextField label={label} type="text" size="small" fullWidth
            value={text}
            onChange={(e) => {
                const raw = e.target.value;
                // 允许输入浮点数（小数点 + 数字）
                if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                    // 去除前导零："01.2" → "1.2"，但 "0.2" 保留
                    let clean = raw;
                    if (/^0\d/.test(raw)) clean = raw.replace(/^0+/, '') || '0';
                    setText(clean);
                    const num = parseFloat(clean);
                    if (!isNaN(num)) onChange(num);
                }
            }}
            onBlur={() => {
                const num = parseFloat(text);
                if (isNaN(num)) { setText('0'); onChange(0); }
                else { setText(String(num)); onChange(num); }
            }}
            slotProps={{ htmlInput: { min: 0, step: 0.5, style: { padding: '4px 8px', fontSize: '0.95rem' } } }}
            sx={getFieldSx(th)} />
    );
};

const S = ({ text }: { text: string }) => {
    const { theme: th } = useAppTheme();
    return <Typography sx={{ fontSize: '0.85rem', color: th.textMuted, mb: 0.5, mt: 1 }}>{text}</Typography>;
};

export default function ControlPanel({ onSolve, loading }: ControlPanelProps) {
    const { theme: th } = useAppTheme();
    const { t: i } = useI18n();

    const [mode, setMode] = useState<'lcr' | 'ccr'>('lcr');
    const [evalMode, setEvalMode] = useState<'bank' | 'chip'>('bank');

    const [sparse, setSparse] = useState(100);
    const [rowfail, setRowfail] = useState(0);
    const [colfail, setColfail] = useState(0);
    const [bankCnt, setBankCnt] = useState(1);

    const [chipCnt, setChipCnt] = useState(100);
    const [chipBankCnt, setChipBankCnt] = useState(4);
    const [lambdaSparse, setLambdaSparse] = useState(100);
    const [sparseDispersion, setSparseDispersion] = useState(0); // φ=0: 纯泊松
    const [rowPct, setRowPct] = useState(10);
    const [colPct, setColPct] = useState(10);

    const [maxrow, setMaxrow] = useState(16384);
    const [maxcol, setMaxcol] = useState(1024);
    const [rowcap, setRowcap] = useState(128);
    const [sectioncnt, setSectioncnt] = useState(48);
    const [colseg, setColseg] = useState(2);
    const [sectionGroupSize, setSectionGroupSize] = useState(2048);
    const [subsectionSize, setSubsectionSize] = useState(344);
    const [subsectionsPerGroup, setSubsectionsPerGroup] = useState(6);

    const [cpsPerRegion, setCpsPerRegion] = useState(2);
    const [lcrCap, setLcrCap] = useState(2);
    const [ccrGroupsPerSection, setCcrGroupsPerSection] = useState(8);
    const [ccrCap, setCcrCap] = useState(2);

    const [seed, setSeed] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);

    const handleSubmit = () => {
        const req: SolveRequest = {
            mode, evalMode, maxrow, maxcol, rowcap, sectioncnt, colseg,
            sectionGroupSize, subsectionSize, subsectionsPerGroup,
        };
        if (evalMode === 'bank') {
            req.sparse = sparse; req.rowfail = rowfail; req.colfail = colfail; req.bankCnt = bankCnt;
        } else {
            req.chipCnt = Math.max(1, chipCnt); req.bankCnt = chipBankCnt;
            req.lambdaSparse = lambdaSparse;
            req.sparseDispersion = sparseDispersion;
            req.rowPct = rowPct; req.colPct = colPct;
        }
        if (mode === 'lcr') { req.cpsPerRegion = cpsPerRegion; req.lcrCap = lcrCap; }
        else { req.ccrGroupsPerSection = ccrGroupsPerSection; req.ccrCap = ccrCap; }
        if (seed !== '') req.seed = parseInt(seed, 10);
        onSolve(req);
    };



    // 下拉菜单样式
    const menuProps = {
        PaperProps: {
            sx: {
                bgcolor: th.bg,
                border: `1px solid ${th.border}`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                '& .MuiMenuItem-root': {
                    color: th.text,
                    fontSize: '0.95rem',
                    '&:hover': { bgcolor: th.bgHover },
                    '&.Mui-selected': { bgcolor: th.bgSelected, '&:hover': { bgcolor: th.bgSelected } },
                },
            },
        },
    };

    const selectSx = {
        height: 28, fontSize: '0.95rem', color: th.text,
        '& fieldset': { borderColor: th.border },
        '&:hover fieldset': { borderColor: th.textMuted },
        '& .MuiSelect-icon': { color: th.textMuted },
    };

    const labelSx = { color: th.textMuted, fontSize: '0.9rem', '&.Mui-focused': { color: th.cyan } };

    return (
        <Box sx={{ p: 1 }}>
            <S text={i.modeLabel} />
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel sx={labelSx}>mode</InputLabel>
                <Select value={mode} label="mode" onChange={(e) => setMode(e.target.value as 'lcr' | 'ccr')}
                    sx={selectSx} MenuProps={menuProps}>
                    <MenuItem value="lcr">lcr — Local Column</MenuItem>
                    <MenuItem value="ccr">ccr — Common Column</MenuItem>
                </Select>
            </FormControl>

            <S text={i.evalLabel} />
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel sx={labelSx}>eval</InputLabel>
                <Select value={evalMode} label="eval" onChange={(e) => setEvalMode(e.target.value as 'bank' | 'chip')}
                    sx={selectSx} MenuProps={menuProps}>
                    <MenuItem value="bank">{i.bankDesc}</MenuItem>
                    <MenuItem value="chip">{i.chipDesc}</MenuItem>
                </Select>
            </FormControl>

            {evalMode === 'bank' && (
                <>
                    <S text={i.failGen} />
                    <F label="sparse" value={sparse} onChange={setSparse} />
                    <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                        <F label="rowfail" value={rowfail} onChange={setRowfail} />
                        <F label="colfail" value={colfail} onChange={setColfail} />
                    </Stack>
                    <S text={i.execution} />
                    <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                        <F label="bankCnt" value={bankCnt} onChange={setBankCnt} />
                        <F label="seed" value={seed === '' ? 0 : parseInt(seed)} onChange={(v) => setSeed(v === 0 ? '' : String(v))} />
                    </Stack>
                </>
            )}

            {evalMode === 'chip' && (
                <>
                    <S text={i.chipConfig} />
                    <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                        <F label="chipCnt" value={chipCnt} onChange={setChipCnt} />
                        <F label="bankCnt" value={chipBankCnt} onChange={setChipBankCnt} />
                    </Stack>
                    <S text={i.poissonSparse} />
                    <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                        <Ff label="λ_sparse (均值)" value={lambdaSparse} onChange={setLambdaSparse} />
                        <Ff label="disp φ" value={sparseDispersion} onChange={setSparseDispersion} />
                    </Stack>
                    <S text={i.poissonDispersion} />
                    <S text={i.rowColPct} />
                    <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                        <Ff label="rowPct%" value={rowPct} onChange={setRowPct} />
                        <Ff label="colPct%" value={colPct} onChange={setColPct} />
                    </Stack>
                    <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                        <F label="seed" value={seed === '' ? 0 : parseInt(seed)} onChange={(v) => setSeed(v === 0 ? '' : String(v))} />
                    </Stack>
                    <Box sx={{ px: 0.5, py: 0.3, bgcolor: th.bgDark, mt: 0.5 }}>
                        <Typography sx={{ fontSize: '0.8rem', color: th.textMuted }}>
                            {i.preview}: μ={lambdaSparse}, σ²={sparseDispersion > 0 ? (lambdaSparse + lambdaSparse * lambdaSparse * sparseDispersion).toFixed(1) : lambdaSparse.toFixed(1)}, row≈{Math.round(lambdaSparse * rowPct / 100)}, col≈{Math.round(lambdaSparse * colPct / 100)}
                        </Typography>
                    </Box>
                </>
            )}

            <Box onClick={() => setShowAdvanced(!showAdvanced)}
                sx={{
                    cursor: 'pointer', mt: 1, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5,
                    '&:hover': { bgcolor: th.bgHover }, px: 0.5, py: 0.2, userSelect: 'none'
                }}>
                <Typography sx={{ fontSize: '0.85rem', color: th.orange }}>
                    {showAdvanced ? '▾' : '▸'} {i.advancedParams}
                </Typography>
            </Box>

            <Collapse in={showAdvanced}>
                <S text={i.addressSpace} />
                <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                    <F label="maxrow" value={maxrow} onChange={setMaxrow} />
                    <F label="maxcol" value={maxcol} onChange={setMaxcol} />
                </Stack>
                <S text={i.solverParams} />
                <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                    <F label="rowcap" value={rowcap} onChange={setRowcap} />
                    <F label="sectioncnt" value={sectioncnt} onChange={setSectioncnt} />
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                    <F label="colseg" value={colseg} onChange={setColseg} />
                    <F label="secGrpSize" value={sectionGroupSize} onChange={setSectionGroupSize} />
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                    <F label="subSecSize" value={subsectionSize} onChange={setSubsectionSize} />
                    <F label="subPerGrp" value={subsectionsPerGroup} onChange={setSubsectionsPerGroup} />
                </Stack>
                {mode === 'lcr' ? (
                    <>
                        <S text={i.lcrParams} />
                        <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                            <F label="cpsPerRegion" value={cpsPerRegion} onChange={setCpsPerRegion} />
                            <F label="lcrCap" value={lcrCap} onChange={setLcrCap} />
                        </Stack>
                    </>
                ) : (
                    <>
                        <S text={i.ccrParams} />
                        <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                            <F label="ccrGrpPerSec" value={ccrGroupsPerSection} onChange={setCcrGroupsPerSection} />
                            <F label="ccrCap" value={ccrCap} onChange={setCcrCap} />
                        </Stack>
                    </>
                )}
            </Collapse>

            <Button variant="contained" fullWidth onClick={handleSubmit} disabled={loading}
                startIcon={loading ? <CircularProgress size={14} color="inherit" /> : null}
                sx={{
                    mt: 1, bgcolor: th.statusBar, color: loading ? th.textMuted : th.green,
                    border: `1px solid ${th.border}`,
                    '&:hover': { bgcolor: th.bgSelected, border: `1px solid ${th.textMuted}` },
                    fontSize: '0.95rem', py: 0.5,
                }}>
                {loading ? i.solving : evalMode === 'chip' ? i.evalChips(chipCnt) : i.solve}
            </Button>
        </Box>
    );
}
