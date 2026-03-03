import {
    Box, Button, Typography, Stack, TextField, FormControl,
    InputLabel, Select, MenuItem, Divider,
} from '@mui/material';
import type { ArchState } from './useArchState';
import { useAppTheme } from '../themes';
import type { ProductConfig } from '../api/config';

interface Props { arch: ArchState; }

const SLabel = ({ text }: { text: string }) => {
    const { theme: th } = useAppTheme();
    return <Typography sx={{ fontSize: '0.8rem', color: th.textMuted, mt: 1, mb: 0.5 }}>{text}</Typography>;
};

const F = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => {
    const { theme: th } = useAppTheme();
    return (
        <TextField label={label} type="number" size="small" fullWidth
            value={value} onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
            slotProps={{ htmlInput: { min: 0, style: { padding: '4px 8px', fontSize: '0.9rem' } } }}
            sx={{
                '& .MuiInputLabel-root': { fontSize: '0.85rem', color: th.textMuted },
                '& .MuiOutlinedInput-root': {
                    color: th.text,
                    '& fieldset': { borderColor: th.border },
                    '&:hover fieldset': { borderColor: th.textMuted },
                    '&.Mui-focused fieldset': { borderColor: th.cyan },
                },
            }} />
    );
};

export default function ArchPanel({ arch }: Props) {
    const { theme: th } = useAppTheme();
    const { form, setForm, isNew, selected, saving, msg, handleSave, handleDelete } = arch;

    const upd = (key: keyof ProductConfig) => (v: number) =>
        setForm(f => ({ ...f, [key]: v }));

    const selectSx = {
        height: 28, fontSize: '0.9rem', color: th.text,
        '& fieldset': { borderColor: th.border },
        '&:hover fieldset': { borderColor: th.textMuted },
        '& .MuiSelect-icon': { color: th.textMuted },
    };
    const labelSx = { color: th.textMuted, fontSize: '0.85rem', '&.Mui-focused': { color: th.cyan } };
    const menuProps = {
        PaperProps: {
            sx: {
                bgcolor: th.bg, border: `1px solid ${th.border}`,
                '& .MuiMenuItem-root': { color: th.text, fontSize: '0.9rem', '&:hover': { bgcolor: th.bgHover } },
            },
        },
    };

    if (!selected && !isNew) {
        return (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                <Typography sx={{ fontSize: '0.85rem', color: th.textMuted, textAlign: 'center' }}>
                    // select a config from the right panel{'\n'}or click + to create
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ overflow: 'auto', p: 1, flex: 1 }}>
            <SLabel text="// name" />
            <TextField size="small" fullWidth placeholder="config name"
                value={form.name}
                disabled={!isNew}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: '0.9rem' } } }}
                sx={{
                    mb: 1,
                    '& .MuiOutlinedInput-root': {
                        color: th.text,
                        '& fieldset': { borderColor: isNew ? th.orange : th.border },
                        '&:hover fieldset': { borderColor: th.textMuted },
                        '&.Mui-focused fieldset': { borderColor: th.cyan },
                        '&.Mui-disabled input': { WebkitTextFillColor: th.textSubtle },
                    },
                }} />

            <SLabel text="// mode" />
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel sx={labelSx}>mode</InputLabel>
                <Select value={form.mode} label="mode"
                    onChange={(e) => setForm(f => ({ ...f, mode: e.target.value as 'lcr' | 'ccr' }))}
                    sx={selectSx} MenuProps={menuProps}>
                    <MenuItem value="lcr">lcr</MenuItem>
                    <MenuItem value="ccr">ccr</MenuItem>
                </Select>
            </FormControl>

            <SLabel text="// address space" />
            <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                <F label="maxrow" value={form.maxrow} onChange={upd('maxrow')} />
                <F label="maxcol" value={form.maxcol} onChange={upd('maxcol')} />
            </Stack>

            <SLabel text="// solver params" />
            <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                <F label="rowcap" value={form.rowcap} onChange={upd('rowcap')} />
                <F label="sectioncnt" value={form.sectioncnt} onChange={upd('sectioncnt')} />
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                <F label="colseg" value={form.colseg} onChange={upd('colseg')} />
                <F label="secGrpSize" value={form.sectionGroupSize} onChange={upd('sectionGroupSize')} />
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                <F label="subSecSize" value={form.subsectionSize} onChange={upd('subsectionSize')} />
                <F label="subPerGrp" value={form.subsectionsPerGroup} onChange={upd('subsectionsPerGroup')} />
            </Stack>

            {form.mode === 'lcr' ? (
                <>
                    <SLabel text="// lcr params" />
                    <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                        <F label="cpsPerRegion" value={form.cpsPerRegion} onChange={upd('cpsPerRegion')} />
                        <F label="lcrCap" value={form.lcrCap} onChange={upd('lcrCap')} />
                    </Stack>
                </>
            ) : (
                <>
                    <SLabel text="// ccr params" />
                    <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                        <F label="ccrGrpPerSec" value={form.ccrGroupsPerSection} onChange={upd('ccrGroupsPerSection')} />
                        <F label="ccrCap" value={form.ccrCap} onChange={upd('ccrCap')} />
                    </Stack>
                </>
            )}

            <Divider sx={{ borderColor: th.border, my: 1 }} />

            {msg && (
                <Typography sx={{ fontSize: '0.8rem', color: msg.ok ? th.green : th.pink, mb: 0.5 }}>
                    {msg.text}
                </Typography>
            )}

            <Stack direction="row" spacing={0.5}>
                <Button fullWidth variant="contained" disabled={saving} onClick={handleSave}
                    sx={{
                        bgcolor: th.statusBar, color: th.green, border: `1px solid ${th.border}`,
                        fontSize: '0.85rem', py: 0.3,
                        '&:hover': { bgcolor: th.bgSelected, border: `1px solid ${th.green}` },
                    }}>
                    {saving ? 'saving...' : 'save()'}
                </Button>
                {selected && !isNew && (
                    <Button variant="outlined" onClick={handleDelete}
                        sx={{
                            color: th.pink, borderColor: th.border, fontSize: '0.85rem', py: 0.3, minWidth: 60,
                            '&:hover': { borderColor: th.pink, bgcolor: `${th.pink}11` },
                        }}>
                        del
                    </Button>
                )}
            </Stack>
        </Box>
    );
}
