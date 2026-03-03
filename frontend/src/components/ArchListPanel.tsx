import { useState } from 'react';
import { Box, Typography, IconButton, InputBase } from '@mui/material';
import type { ArchState } from './useArchState';
import { useAppTheme } from '../themes';

interface Props { arch: ArchState; }

export default function ArchListPanel({ arch }: Props) {
    const { theme: th } = useAppTheme();
    const { configs, selected, handleSelect, handleNew } = arch;
    const [query, setQuery] = useState('');

    const filtered = configs.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* search + "+" header */}
            <Box sx={{
                px: 1, py: 0.5, bgcolor: th.bgDark, borderBottom: `1px solid ${th.border}`,
                display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0,
            }}>
                <InputBase
                    placeholder="search configs..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    sx={{
                        flex: 1, fontSize: '0.85rem', color: th.text,
                        '& input': { padding: 0 },
                        '& input::placeholder': { color: th.textMuted, opacity: 1 },
                    }}
                />
                <IconButton size="small" onClick={handleNew}
                    sx={{ width: 20, height: 20, color: th.green, flexShrink: 0, '&:hover': { bgcolor: th.bgHover } }}>
                    <Typography sx={{ fontSize: '1.1rem', lineHeight: 1 }}>+</Typography>
                </IconButton>
            </Box>

            {/* list */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
                {filtered.length === 0 && (
                    <Typography sx={{ fontSize: '0.85rem', color: th.textMuted, p: 1.5 }}>
                        {query ? '// no match' : '// no configs yet'}
                    </Typography>
                )}
                {filtered.map(c => (
                    <Box key={c.name} onClick={() => handleSelect(c.name)}
                        sx={{
                            px: 1.5, py: 0.75, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 1,
                            bgcolor: selected === c.name ? th.bgSelected : 'transparent',
                            borderLeft: selected === c.name ? `2px solid ${th.green}` : '2px solid transparent',
                            '&:hover': { bgcolor: th.bgHover },
                        }}>
                        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: selected === c.name ? th.green : th.textMuted, flexShrink: 0 }} />
                        <Typography sx={{ fontSize: '0.9rem', color: th.text, flex: 1 }}>{c.name}</Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: th.textMuted }}>{c.mode}</Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
