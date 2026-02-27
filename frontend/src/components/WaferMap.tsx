import { useRef, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import type { ChipSolveResponse, ChipResult } from '../api/solver';
import { useAppTheme, type AppTheme } from '../themes';

interface WaferMapProps {
    data: ChipSolveResponse;
    visible: boolean;
    onChipClick?: (chipIdx: number) => void;
}

// ─── Hex color → [r, g, b] ───
function hex2rgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ─── Build grid cells within wafer circle, sorted center→edge ───
interface Cell { gx: number; gy: number; dist: number; }

function buildGrid(R: number): Cell[] {
    const out: Cell[] = [];
    for (let gy = -R; gy <= R; gy++) {
        for (let gx = -R; gx <= R; gx++) {
            const d = Math.sqrt(gx * gx + gy * gy);
            if (d <= R + 0.01) out.push({ gx, gy, dist: d });
        }
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
}

// ─── Find minimum grid radius that holds ≥ n chips ───
function gridRadius(n: number): number {
    for (let R = 1; R <= 60; R++) {
        if (buildGrid(R).length >= n) return R;
    }
    return 60;
}

// ─── Three-zone color (flat): bottom 60%→green, 60-90%→orange, top 10%→pink ───
function chipColor(fail: number, p60: number, p90: number, th: AppTheme): { fill: string; border: string } {
    if (fail >= p90) {
        // top 10% — pink, solid
        const [r, g, b] = hex2rgb(th.pink);
        const local = Math.min(1, (p90 > 0 ? (fail - p90) / Math.max(1, p90 * 0.3) : 0));
        const a = 0.72 + local * 0.18;  // 0.72 – 0.90
        return {
            fill: `rgba(${r},${g},${b},${a.toFixed(2)})`,
            border: `rgba(${r},${g},${b},${Math.min(1, a + 0.1).toFixed(2)})`,
        };
    } else if (fail >= p60) {
        // 60-90% — orange
        const [r, g, b] = hex2rgb(th.orange);
        const local = (fail - p60) / Math.max(1, p90 - p60);
        const a = 0.55 + local * 0.18;  // 0.55 – 0.73
        return {
            fill: `rgba(${r},${g},${b},${a.toFixed(2)})`,
            border: `rgba(${r},${g},${b},${Math.min(1, a + 0.15).toFixed(2)})`,
        };
    } else {
        // bottom 60% — green
        const [r, g, b] = hex2rgb(th.green);
        const local = p60 > 0 ? fail / p60 : 0;
        const a = 0.30 + local * 0.22;  // 0.30 – 0.52
        return {
            fill: `rgba(${r},${g},${b},${a.toFixed(2)})`,
            border: `rgba(${r},${g},${b},${Math.min(1, a + 0.15).toFixed(2)})`,
        };
    }
}

export default function WaferMap({ data, visible, onChipClick }: WaferMapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const chipRects = useRef<{ x: number; y: number; sz: number; chip: ChipResult }[]>([]);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const { theme: th } = useAppTheme();

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const W = container.clientWidth;
        const H = container.clientHeight;
        if (W === 0 || H === 0) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        // ── Background ──
        ctx.fillStyle = th.bg;
        ctx.fillRect(0, 0, W, H);

        const chips = data.chips;
        const n = chips.length;
        if (n === 0) return;

        // ── Percentile thresholds ──
        const sorted = [...chips].map(c => c.sampledSparse).sort((a, b) => a - b);
        const p60 = sorted[Math.floor(n * 0.6)] ?? sorted[sorted.length - 1];
        const p90 = sorted[Math.floor(n * 0.9)] ?? sorted[sorted.length - 1];

        // ── Grid layout ──
        const R = gridRadius(n);
        const cells = buildGrid(R).slice(0, n);

        // Chips sorted ascending fail → inner cells
        const idx = [...chips.keys()].sort((a, b) => chips[a].sampledSparse - chips[b].sampledSparse);

        // ── Sizing: wafer 与 chip 之间留 ~1 chip 的边距 ──
        // cellStep 按 maxDist + 0.5(半chip) + 0.8(边距) 来分配
        const maxDist = cells[cells.length - 1]?.dist ?? 1;
        const waferR = Math.min(W, H) * 0.435;
        const cx = W / 2, cy = H / 2;
        const cellStep = waferR / (maxDist + 0.5 + 0.8);  // +0.8 → ~1 chip 宽边距
        const sz = cellStep * 0.82;

        chipRects.current = [];

        // ── Wafer substrate background ──
        const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, waferR);
        bgGrad.addColorStop(0, 'rgba(255,255,255,0.028)');
        bgGrad.addColorStop(0.7, 'rgba(255,255,255,0.012)');
        bgGrad.addColorStop(1, 'rgba(255,255,255,0.003)');
        ctx.beginPath(); ctx.arc(cx, cy, waferR, 0, Math.PI * 2);
        ctx.fillStyle = bgGrad; ctx.fill();

        // Wafer edge
        ctx.beginPath(); ctx.arc(cx, cy, waferR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1.2; ctx.stroke();

        // Scribe lines (clipped inside wafer)
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, waferR - 1, 0, Math.PI * 2); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 0.4;
        for (let g = -R - 1; g <= R + 1; g++) {
            const px = cx + g * cellStep + cellStep / 2;
            ctx.beginPath(); ctx.moveTo(px, cy - waferR); ctx.lineTo(px, cy + waferR); ctx.stroke();
        }
        for (let g = -R - 1; g <= R + 1; g++) {
            const py = cy + g * cellStep + cellStep / 2;
            ctx.beginPath(); ctx.moveTo(cx - waferR, py); ctx.lineTo(cx + waferR, py); ctx.stroke();
        }
        ctx.restore();

        // ── Draw chips ──
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const chip = chips[idx[i]];

            const px = cx + cell.gx * cellStep - sz / 2;
            const py = cy + cell.gy * cellStep - sz / 2;

            const { fill, border } = chipColor(chip.sampledSparse, p60, p90, th);

            // Chip body — flat solid fill
            ctx.fillStyle = fill;
            ctx.fillRect(px, py, sz, sz);

            // Border
            ctx.strokeStyle = border;
            ctx.lineWidth = 0.7;
            ctx.strokeRect(px, py, sz, sz);

            // Infeasible: thin × mark （欢迎页风格）
            if (!chip.chipFeasible) {
                const [r, g, b] = hex2rgb(th.pink);
                const mx = px + sz / 2, my = py + sz / 2;
                // 叉叉大小随 chip 尺寸，最小 3px 最大 sz*0.25
                const d = Math.max(3, Math.min(sz * 0.25, 8));
                ctx.save();
                ctx.strokeStyle = `rgba(${r},${g},${b},0.85)`;
                ctx.lineWidth = 1.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(mx - d, my - d); ctx.lineTo(mx + d, my + d);
                ctx.moveTo(mx + d, my - d); ctx.lineTo(mx - d, my + d);
                ctx.stroke();
                ctx.restore();
            }

            chipRects.current.push({ x: px, y: py, sz, chip });
        }

        // ── Stats overlay (top-left) ──
        const feasible = chips.filter(c => c.chipFeasible).length;
        const phi = data.chipParams.sparseDispersion ?? 0;
        const lines: [string, string][] = [
            [`chips: ${n}`, th.textSubtle],
            [`pass:  ${feasible}/${n} (${((feasible / n) * 100).toFixed(1)}%)`, feasible === n ? th.green : th.orange],
            [`μ:     ${data.summary.avgSparse.toFixed(1)}`, th.cyan],
            [`φ:     ${phi.toFixed(2)}  ${phi < 0.01 ? '(Poisson)' : '(NegBin)'}`, th.purple],
        ];
        ctx.font = `11px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'left';
        lines.forEach(([txt, color], i) => {
            ctx.fillStyle = color;
            ctx.fillText(txt, 14, 20 + i * 16);
        });

        // ── Compact legend (bottom-left) ──
        const legY = H - 20;
        const legItems: [string, string, string][] = [
            [th.green, '▪', `bottom 60%`],
            [th.orange, '▪', `60–90%`],
            [th.pink, '▪', `top 10%`],
        ];
        ctx.font = '10px monospace';
        let lx = 14;
        legItems.forEach(([color, mark, label]) => {
            ctx.fillStyle = color; ctx.fillText(mark, lx, legY);
            ctx.fillStyle = th.textMuted; ctx.fillText(label, lx + 12, legY);
            lx += ctx.measureText(mark + label).width + 24;
        });

    }, [data, th]);

    // Initial draw + theme changes
    useEffect(() => { draw(); }, [draw]);

    // Resize observer — always active (canvas is always mounted)
    useEffect(() => {
        const obs = new ResizeObserver(() => { if (visible) draw(); });
        if (containerRef.current) obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, [draw, visible]);

    // Re-draw when tab becomes visible
    useEffect(() => { if (visible) draw(); }, [visible, draw]);

    // ── Mouse hover for tooltip ──
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const tip = tooltipRef.current;
        if (!canvas || !tip) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        let found: typeof chipRects.current[0] | null = null;
        for (const c of chipRects.current) {
            if (mx >= c.x && mx <= c.x + c.sz && my >= c.y && my <= c.y + c.sz) {
                found = c; break;
            }
        }
        if (found) {
            const chip = found.chip;
            tip.style.display = 'block';
            tip.style.left = `${e.clientX + 14}px`;
            tip.style.top = `${e.clientY - 10}px`;
            tip.innerHTML = `
                <div style="color:#66d9ef;font-weight:600">chip #${chip.chip}</div>
                <div style="color:#c0bfb0">sparse: ${chip.sampledSparse}</div>
                <div style="color:#908b6e">row: ${chip.sampledRowFail} · col: ${chip.sampledColFail}</div>
                <div style="color:${chip.chipFeasible ? '#a6e22e' : '#f92672'};font-weight:600">${chip.chipFeasible ? '✓ feasible' : '✗ infeasible'}</div>
                <div style="color:#908b6e">banks: ${chip.banks.length}</div>
            `;
        } else {
            tip.style.display = 'none';
        }
    }, []);

    const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!onChipClick) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        for (const c of chipRects.current) {
            if (mx >= c.x && mx <= c.x + c.sz && my >= c.y && my <= c.y + c.sz) {
                onChipClick(c.chip.chip);
                break;
            }
        }
    }, [onChipClick]);

    const handleMouseLeave = useCallback(() => {
        const tip = tooltipRef.current;
        if (tip) tip.style.display = 'none';
    }, []);

    return (
        <Box ref={containerRef} sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: th.bg, overflow: 'hidden' }}>
            <canvas
                ref={canvasRef}
                style={{ display: 'block', width: '100%', height: '100%', cursor: onChipClick ? 'pointer' : 'crosshair' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
            />
            {/* Tooltip: pure DOM, no React state → zero re-render */}
            <div
                ref={tooltipRef}
                style={{
                    display: 'none',
                    position: 'fixed',
                    background: 'rgba(30,31,28,0.94)',
                    border: '1px solid #3e3d32',
                    padding: '6px 10px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '11px',
                    lineHeight: '18px',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    backdropFilter: 'blur(6px)',
                }}
            />
        </Box>
    );
}
