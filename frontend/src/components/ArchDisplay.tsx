import { useMemo, useRef, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { ProductConfig } from '../api/config';
import { useAppTheme } from '../themes';

interface Props { config: ProductConfig | null; }

const PAD = 30;

export default function ArchDisplay({ config }: Props) {
    const { theme: th } = useAppTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 800, h: 600 });

    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(([e]) => {
            setSize({ w: e.contentRect.width, h: e.contentRect.height });
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    const svg = useMemo(() => {
        if (!config) return null;
        const isLcr = config.mode === 'lcr';
        const W = size.w;
        const H = size.h;

        // ─── Architecture params (derived, matching C++ solver) ───
        const sectionCnt = config.sectioncnt || 48;
        const colSeg = config.colseg || 2;
        const bigSectionCnt = Math.floor(sectionCnt / colSeg);

        const cpCount = Math.floor((config.maxcol || 1024) / 64);
        const cpsPerRegion = config.cpsPerRegion || 2;
        const regionCnt = isLcr ? Math.ceil(cpCount / cpsPerRegion) : 0;
        const ccrGrpPerSec = config.ccrGroupsPerSection || 8;

        // How many col groups (columns of the grid)
        const colDivisions = isLcr ? regionCnt : ccrGrpPerSec;

        const rowCap = config.rowcap || 128;
        const colCap = isLcr ? (config.lcrCap || 2) : (config.ccrCap || 2);

        const totalColGroups = bigSectionCnt * colDivisions;

        // ─── Layout geometry ───
        const bankX = PAD + 30;
        const bankY = PAD + 14;
        const bankW = W - bankX - PAD - 50;
        const bankH = H - bankY - PAD - 40;
        if (bankW < 100 || bankH < 80) return null;

        const rowStripH = Math.max(14, Math.min(22, bankH * 0.035));
        const mainTop = bankY + rowStripH;
        const mainH = bankH - rowStripH;
        const bsH = mainH / bigSectionCnt;   // big section height
        const secH = bsH / colSeg;            // physical section height
        const grpW = bankW / colDivisions;    // col group width

        // Colors
        const rowColor = '#66d9ef';
        const colColor = isLcr ? '#ae81ff' : '#a6e22e';
        const dimColor = th.textSubtle;
        const txtColor = th.textMuted;

        const els: React.ReactElement[] = [];

        // ─── Title ───
        els.push(
            <text key="title" x={W / 2} y={20} textAnchor="middle"
                fill={th.text} fontSize={13} fontFamily="monospace" fontWeight={600}>
                {config.name} — {config.mode.toUpperCase()} Bank Architecture
            </text>
        );

        // ─── Bank outline ───
        els.push(
            <rect key="bank" x={bankX} y={bankY} width={bankW} height={bankH}
                fill={th.bgDark} stroke={dimColor} strokeWidth={1.5} rx={2} />
        );

        // ─── Row repair strip (top) ───
        // Row repair = horizontal lines spanning full bank width
        els.push(
            <rect key="row-strip" x={bankX + 0.5} y={bankY + 0.5}
                width={bankW - 1} height={rowStripH}
                fill={`${rowColor}15`} stroke={rowColor} strokeWidth={0.5} />
        );
        // Draw a few horizontal dashes to visually convey "horizontal repair lines"
        const rowLineCount = Math.min(4, Math.floor(rowStripH / 3));
        for (let r = 0; r < rowLineCount; r++) {
            const ry = bankY + 2 + r * ((rowStripH - 2) / rowLineCount);
            els.push(
                <line key={`rr-line-${r}`} x1={bankX + 4} y1={ry} x2={bankX + bankW - 4} y2={ry}
                    stroke={rowColor} strokeWidth={0.5} opacity={0.4} />
            );
        }
        els.push(
            <text key="row-label" x={bankX + bankW / 2} y={bankY + rowStripH / 2 + 4}
                textAnchor="middle" fill={rowColor} fontSize={9} fontFamily="monospace" fontWeight={500}>
                ROW REPAIR ← → (cap={rowCap})
            </text>
        );

        // ─── Big section horizontal dividers ───
        for (let bs = 0; bs < bigSectionCnt; bs++) {
            const by = mainTop + bs * bsH;
            if (bs > 0) {
                els.push(
                    <line key={`bs-${bs}`} x1={bankX} y1={by} x2={bankX + bankW} y2={by}
                        stroke={dimColor} strokeWidth={1} />
                );
            }
            // Physical section lines within big section
            for (let s = 1; s < colSeg; s++) {
                const sy = by + s * secH;
                els.push(
                    <line key={`sec-${bs}-${s}`} x1={bankX} y1={sy} x2={bankX + bankW} y2={sy}
                        stroke={th.border} strokeWidth={0.3} strokeDasharray="2,3" />
                );
            }
        }

        // ─── Col group vertical dividers ───
        for (let c = 1; c < colDivisions; c++) {
            const cx = bankX + c * grpW;
            els.push(
                <line key={`col-div-${c}`} x1={cx} y1={mainTop} x2={cx} y2={bankY + bankH}
                    stroke={`${colColor}44`} strokeWidth={0.5} strokeDasharray="3,2" />
            );
        }

        // ─── Col repair resources: VERTICAL bars within each (bigSection × colGroup) cell ───
        // Each bar = 1 available col repair line (vertical, spanning the big section height)
        for (let bs = 0; bs < bigSectionCnt; bs++) {
            const cellTop = mainTop + bs * bsH;
            const cellBot = cellTop + bsH;

            for (let c = 0; c < colDivisions; c++) {
                const cellLeft = bankX + c * grpW;

                // Alternate background
                if ((bs + c) % 2 === 0) {
                    els.push(
                        <rect key={`shade-${bs}-${c}`}
                            x={cellLeft + 0.5} y={cellTop + 0.5}
                            width={grpW - 1} height={bsH - 1}
                            fill={`${colColor}06`} />
                    );
                }

                // Draw `colCap` vertical bars evenly spaced — these represent
                // the available column repair lines (each bar repairs one column)
                const barW = Math.max(1.5, Math.min(4, grpW / (colCap * 3)));
                const totalBarsW = colCap * barW + (colCap - 1) * barW;
                const barStartX = cellLeft + (grpW - totalBarsW) / 2;
                const barPadY = Math.max(2, bsH * 0.08);

                for (let p = 0; p < colCap; p++) {
                    const bx = barStartX + p * (barW * 2);
                    els.push(
                        <line key={`cr-${bs}-${c}-${p}`}
                            x1={bx} y1={cellTop + barPadY}
                            x2={bx} y2={cellBot - barPadY}
                            stroke={colColor} strokeWidth={barW}
                            opacity={0.35} strokeLinecap="round" />
                    );
                }
            }
        }

        // ─── Dimension labels ───
        // Left: rows
        els.push(<line key="dim-r-v" x1={bankX - 14} y1={bankY} x2={bankX - 14} y2={bankY + bankH} stroke={dimColor} strokeWidth={0.5} />);
        els.push(<line key="dim-r-t" x1={bankX - 18} y1={bankY} x2={bankX - 10} y2={bankY} stroke={dimColor} strokeWidth={0.5} />);
        els.push(<line key="dim-r-b" x1={bankX - 18} y1={bankY + bankH} x2={bankX - 10} y2={bankY + bankH} stroke={dimColor} strokeWidth={0.5} />);
        els.push(
            <text key="dim-r-txt" x={bankX - 22} y={bankY + bankH / 2}
                textAnchor="middle" fill={dimColor} fontSize={9} fontFamily="monospace"
                transform={`rotate(-90, ${bankX - 22}, ${bankY + bankH / 2})`}>
                {config.maxrow} rows ↕
            </text>
        );
        // Top: cols
        els.push(
            <text key="dim-c-txt" x={bankX + bankW / 2} y={bankY - 8}
                textAnchor="middle" fill={dimColor} fontSize={9} fontFamily="monospace">
                {config.maxcol} cols ↔
            </text>
        );

        // ─── Right side bracket: big section ───
        if (bigSectionCnt > 0) {
            const bx = bankX + bankW + 6;
            els.push(<line key="bk-t" x1={bx} y1={mainTop} x2={bx + 6} y2={mainTop} stroke={colColor} strokeWidth={0.5} />);
            els.push(<line key="bk-v" x1={bx + 6} y1={mainTop} x2={bx + 6} y2={mainTop + bsH} stroke={colColor} strokeWidth={0.5} />);
            els.push(<line key="bk-b" x1={bx} y1={mainTop + bsH} x2={bx + 6} y2={mainTop + bsH} stroke={colColor} strokeWidth={0.5} />);
            els.push(
                <text key="bk-l1" x={bx + 12} y={mainTop + bsH / 2 - 2}
                    fill={colColor} fontSize={8} fontFamily="monospace">1 Big Section</text>
            );
            els.push(
                <text key="bk-l2" x={bx + 12} y={mainTop + bsH / 2 + 8}
                    fill={txtColor} fontSize={7} fontFamily="monospace">= {colSeg} sections</text>
            );
            // total
            els.push(
                <text key="bs-total" x={bankX + bankW + 30} y={bankY + bankH / 2}
                    textAnchor="middle" fill={txtColor} fontSize={8} fontFamily="monospace"
                    transform={`rotate(90, ${bankX + bankW + 30}, ${bankY + bankH / 2})`}>
                    {bigSectionCnt} big sections ({sectionCnt} sections)
                </text>
            );
        }

        // ─── Bottom col group labels ───
        for (let c = 0; c < colDivisions; c++) {
            const cx = bankX + c * grpW + grpW / 2;
            els.push(
                <text key={`cg-${c}`} x={cx} y={bankY + bankH + 12}
                    textAnchor="middle" fill={txtColor} fontSize={7} fontFamily="monospace">
                    {isLcr ? `R${c}` : `G${c}`}
                </text>
            );
        }
        els.push(
            <text key="cg-desc" x={bankX + bankW / 2} y={bankY + bankH + 24}
                textAnchor="middle" fill={colColor} fontSize={9} fontFamily="monospace">
                {isLcr
                    ? `${regionCnt} LCR Regions (${cpsPerRegion} CPs/region, cap=${colCap})`
                    : `${ccrGrpPerSec} CCR Groups/BigSec (cap=${colCap})`}
            </text>
        );

        // ─── Legend ───
        const legY = bankY + bankH + 38;
        // Row legend: horizontal line
        els.push(<line key="lg-rr" x1={bankX} y1={legY + 4} x2={bankX + 20} y2={legY + 4} stroke={rowColor} strokeWidth={2} />);
        els.push(
            <text key="lg-rt" x={bankX + 26} y={legY + 7} fill={txtColor} fontSize={8} fontFamily="monospace">
                Row repair = horizontal line (1 group, cap={rowCap})
            </text>
        );
        // Col legend: vertical line
        const lg2x = bankX + bankW / 2;
        els.push(<line key="lg-cr" x1={lg2x} y1={legY - 2} x2={lg2x} y2={legY + 10} stroke={colColor} strokeWidth={2} />);
        els.push(
            <text key="lg-ct" x={lg2x + 8} y={legY + 7} fill={txtColor} fontSize={8} fontFamily="monospace">
                {isLcr ? 'LCR' : 'CCR'} = vertical line ({totalColGroups} groups, cap={colCap} each)
            </text>
        );

        return els;
    }, [config, size, th]);

    if (!config) {
        return (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: th.bg }}>
                <Typography sx={{ fontSize: '0.85rem', color: th.textMuted }}>// select a config to view architecture</Typography>
            </Box>
        );
    }

    return (
        <Box ref={containerRef} sx={{ width: '100%', height: '100%', bgcolor: th.bg, overflow: 'hidden' }}>
            <svg width={size.w} height={size.h} style={{ display: 'block' }}>{svg}</svg>
        </Box>
    );
}
