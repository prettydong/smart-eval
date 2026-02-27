import { useRef, useEffect, useCallback, useState } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { RunResult } from '../api/solver';
import { useAppTheme, type AppTheme } from '../themes';
import { useI18n } from '../i18n';

interface RepairMapProps {
    run: RunResult | null;
    maxRow?: number;
    maxCol?: number;
    config?: Record<string, number> | null;
}

type PixiColors = AppTheme['pixi'];

// ─── Big Section Utilities ───

/** Replicate C++ getBigSectionIdx_ */
function getBigSectionIdx(
    rowAddr: number,
    sectionGroupSize: number,
    subsectionSize: number,
    subsectionsPerGroup: number,
    colSeg: number,
): number {
    const sectionGroupIdx = Math.floor(rowAddr / sectionGroupSize);
    const subInGrpOffset =
        Math.floor((rowAddr % sectionGroupSize) / subsectionSize) +
        sectionGroupIdx * subsectionsPerGroup;
    return Math.floor(subInGrpOffset / colSeg);
}

/** Compute row boundaries for each big section by scanning row addresses */
function computeBigSectionBounds(
    maxRow: number,
    sectionGroupSize: number,
    subsectionSize: number,
    subsectionsPerGroup: number,
    colSeg: number,
): Map<number, [number, number]> {
    const bounds = new Map<number, [number, number]>();

    // We iterate through row addresses to find where big section boundaries are.
    // Optimization: instead of scanning every row, step by subsectionSize
    let prevIdx = -1;
    let currentStart = 0;

    for (let row = 0; row < maxRow; row += subsectionSize) {
        const idx = getBigSectionIdx(row, sectionGroupSize, subsectionSize, subsectionsPerGroup, colSeg);
        if (idx !== prevIdx) {
            if (prevIdx >= 0) {
                bounds.set(prevIdx, [currentStart, row - 1]);
            }
            currentStart = row;
            prevIdx = idx;
        }
    }
    // Close last section
    if (prevIdx >= 0) {
        bounds.set(prevIdx, [currentStart, maxRow - 1]);
    }

    return bounds;
}

export default function RepairMap({
    run,
    maxRow = 16384,
    maxCol = 1024,
    config = null,
}: RepairMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const [showRow, setShowRow] = useState(true);
    const [showCol, setShowCol] = useState(true);
    const [swapped, setSwapped] = useState(false);

    const { theme: currentTheme } = useAppTheme();
    const { t: i } = useI18n();
    const pixiColors = currentTheme.pixi;

    const drawMap = useCallback(async (runData: RunResult, rowVisible: boolean, colVisible: boolean, axisSwapped: boolean, COLORS: PixiColors) => {
        const container = containerRef.current;
        if (!container) return;

        if (appRef.current) {
            appRef.current.destroy(true);
            appRef.current = null;
        }

        const width = container.clientWidth;
        const height = container.clientHeight;

        const app = new Application();
        await app.init({
            width,
            height,
            backgroundColor: COLORS.bg,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

        container.innerHTML = '';
        container.appendChild(app.canvas as HTMLCanvasElement);
        appRef.current = app;

        // ─── Layout ───
        const padL = 55, padR = 10, padT = 10, padB = 35;
        const plotW = width - padL - padR;
        const plotH = height - padT - padB;

        // Axis mapping: when swapped, X=row, Y=col
        const xMax = axisSwapped ? maxRow : maxCol;
        const yMax = axisSwapped ? maxCol : maxRow;
        const toScreenX = (v: number) => padL + (v / xMax) * plotW;
        const toScreenY = (v: number) => padT + (v / yMax) * plotH;
        const mapX = (col: number, row: number) => axisSwapped ? toScreenX(row) : toScreenX(col);
        const mapY = (col: number, row: number) => axisSwapped ? toScreenY(col) : toScreenY(row);
        const xLabel = axisSwapped ? 'row' : 'col';
        const yLabel = axisSwapped ? 'col' : 'row';

        const g = new Graphics();

        // Viewport container for zoom/pan
        const viewport = new Container();
        app.stage.addChild(viewport);
        viewport.addChild(g);

        // ─── Config for big sections ───
        const sectionGroupSize = config?.sectionGroupSize ?? 2048;
        const subsectionSize = config?.subsectionSize ?? 344;
        const subsectionsPerGroup = config?.subsectionsPerGroup ?? 6;
        const colSeg = config?.colseg ?? 2;

        // Compute big section boundaries
        const sectionBounds = computeBigSectionBounds(
            maxRow, sectionGroupSize, subsectionSize, subsectionsPerGroup, colSeg,
        );

        // ─── Draw big section boundaries ───
        // In normal mode: horizontal lines at section row boundaries
        // In swapped mode: section boundaries don't apply to the primary axis
        if (!axisSwapped) {
            for (const [, [, endRow]] of sectionBounds) {
                const y = toScreenY(endRow);
                g.setStrokeStyle({ width: 0.5, color: COLORS.sectionBorder, alpha: 0.4 });
                g.moveTo(padL, y);
                g.lineTo(padL + plotW, y);
                g.stroke();
            }
        }

        // ─── Grid ───
        const gridCountX = 8;
        const gridCountY = 8;
        for (let i = 0; i <= gridCountX; i++) {
            const x = padL + (plotW / gridCountX) * i;
            g.setStrokeStyle({ width: 0.5, color: COLORS.grid, alpha: 0.3 });
            g.moveTo(x, padT);
            g.lineTo(x, padT + plotH);
            g.stroke();
        }
        for (let i = 0; i <= gridCountY; i++) {
            const y = padT + (plotH / gridCountY) * i;
            g.setStrokeStyle({ width: 0.5, color: COLORS.grid, alpha: 0.3 });
            g.moveTo(padL, y);
            g.lineTo(padL + plotW, y);
            g.stroke();
        }

        // ─── Border ───
        g.setStrokeStyle({ width: 1, color: COLORS.grid, alpha: 0.8 });
        g.rect(padL, padT, plotW, plotH);
        g.stroke();

        // ─── Labels ───
        const labelStyle = new TextStyle({
            fontSize: 12,
            fill: COLORS.text,
            fontFamily: 'JetBrains Mono, Consolas, monospace',
        });

        for (let i = 0; i <= gridCountX; i++) {
            const val = Math.round((xMax / gridCountX) * i);
            const t = new Text({ text: `${val}`, style: labelStyle });
            t.x = padL + (plotW / gridCountX) * i;
            t.y = padT + plotH + 4;
            t.anchor.set(0.5, 0);
            viewport.addChild(t);
        }
        for (let i = 0; i <= gridCountY; i++) {
            const val = Math.round((yMax / gridCountY) * i);
            const t = new Text({ text: `${val}`, style: labelStyle });
            t.x = padL - 4;
            t.y = padT + (plotH / gridCountY) * i;
            t.anchor.set(1, 0.5);
            viewport.addChild(t);
        }

        // Axis titles
        const titleStyle = new TextStyle({
            fontSize: 13,
            fill: COLORS.textBright,
            fontFamily: 'JetBrains Mono, Consolas, monospace',
        });
        const xTitle = new Text({ text: xLabel, style: titleStyle });
        xTitle.x = width / 2;
        xTitle.y = height - 4;
        xTitle.anchor.set(0.5, 1);
        viewport.addChild(xTitle);

        const yTitle = new Text({ text: yLabel, style: titleStyle });
        yTitle.x = 6;
        yTitle.y = height / 2;
        yTitle.anchor.set(0.5, 0.5);
        yTitle.rotation = -Math.PI / 2;
        viewport.addChild(yTitle);

        const assignments = runData.assignments ?? [];
        if (assignments.length === 0) return;

        // ─── Row repair lines — only when feasible ───
        if (runData.feasible && rowVisible && runData.rowRepairs) {
            const rl = new Graphics();
            viewport.addChild(rl);
            for (const rowStr of Object.keys(runData.rowRepairs)) {
                const rowAddr = parseInt(rowStr);
                rl.setStrokeStyle({ width: 1, color: COLORS.rowRepair, alpha: 0.25 });
                if (axisSwapped) {
                    // Row repair = vertical line at x=row
                    const x = toScreenX(rowAddr);
                    rl.moveTo(x, padT);
                    rl.lineTo(x, padT + plotH);
                } else {
                    // Row repair = horizontal line at y=row
                    const y = toScreenY(rowAddr);
                    rl.moveTo(padL, y);
                    rl.lineTo(padL + plotW, y);
                }
                rl.stroke();
            }
        }

        // ─── Col repair lines — only when feasible ───
        if (runData.feasible && colVisible) {
            const colBigSections = new Map<number, Map<number, { color: number }>>();

            for (const a of assignments) {
                const grp = a.group;
                if (grp.startsWith('Row') || grp === 'GlobalRow' || grp === 'RowRepair') continue;

                const isLCR = grp.startsWith('LCR');
                const color = isLCR ? COLORS.lcrRepair : COLORS.ccrRepair;

                const bsIdx = getBigSectionIdx(
                    a.row, sectionGroupSize, subsectionSize, subsectionsPerGroup, colSeg,
                );

                if (!colBigSections.has(a.col)) {
                    colBigSections.set(a.col, new Map());
                }
                colBigSections.get(a.col)!.set(bsIdx, { color });
            }

            const cl = new Graphics();
            viewport.addChild(cl);

            for (const [col, sections] of colBigSections) {
                for (const [bsIdx, { color }] of sections) {
                    const bounds = sectionBounds.get(bsIdx);
                    if (!bounds) continue;

                    const [startRow, endRow] = bounds;

                    cl.setStrokeStyle({ width: 1.5, color, alpha: 0.35 });
                    if (axisSwapped) {
                        // Col repair segment = horizontal line at y=col, spanning x=[startRow, endRow]
                        const y = toScreenY(col);
                        const x1 = toScreenX(startRow);
                        const x2 = toScreenX(endRow);
                        cl.moveTo(x1, y);
                        cl.lineTo(x2, y);
                        cl.stroke();
                        // Caps
                        cl.setStrokeStyle({ width: 1, color, alpha: 0.5 });
                        cl.moveTo(x1, y - 3);
                        cl.lineTo(x1, y + 3);
                        cl.stroke();
                        cl.moveTo(x2, y - 3);
                        cl.lineTo(x2, y + 3);
                        cl.stroke();
                    } else {
                        // Col repair segment = vertical line at x=col, spanning y=[startRow, endRow]
                        const x = toScreenX(col);
                        const y1 = toScreenY(startRow);
                        const y2 = toScreenY(endRow);
                        cl.moveTo(x, y1);
                        cl.lineTo(x, y2);
                        cl.stroke();
                        // Caps
                        cl.setStrokeStyle({ width: 1, color, alpha: 0.5 });
                        cl.moveTo(x - 3, y1);
                        cl.lineTo(x + 3, y1);
                        cl.stroke();
                        cl.moveTo(x - 3, y2);
                        cl.lineTo(x + 3, y2);
                        cl.stroke();
                    }
                }
            }
        }

        // ─── Assignment + raw fail dots ───
        const dots = new Graphics();
        viewport.addChild(dots);
        for (const a of assignments) {
            const x = mapX(a.col, a.row);
            const y = mapY(a.col, a.row);

            const isRowGroup = a.group.startsWith('Row') || a.group === 'GlobalRow' || a.group === 'RowRepair';
            const isColGroup = a.group.startsWith('LCR') || a.group.startsWith('CCR');
            const isRawFail = a.group === 'Fail';

            // Skip assignment dots based on toggle (raw fails always shown)
            if (!isRawFail && isRowGroup && !rowVisible) continue;
            if (!isRawFail && isColGroup && !colVisible) continue;

            let color = COLORS.fail;
            let size = 1.5;

            if (isRawFail) {
                // Infeasible: raw fail point — use pink, slightly larger
                color = COLORS.fail;
                size = 1.8;
            } else if (isRowGroup) {
                color = COLORS.rowRepair;
                size = 2;
            } else if (a.group.startsWith('LCR')) {
                color = COLORS.lcrRepair;
                size = 1.8;
            } else if (a.group.startsWith('CCR')) {
                color = COLORS.ccrRepair;
                size = 1.8;
            }

            dots.circle(x, y, size);
            dots.fill({ color, alpha: isRawFail ? 0.75 : 0.9 });
        }

        // ─── Coordinate label (fixed on stage, not viewport) ───
        const coordLabel = new Text({
            text: '',
            style: new TextStyle({
                fontSize: 12,
                fill: COLORS.textBright,
                fontFamily: 'JetBrains Mono, Consolas, monospace',
            }),
        });
        coordLabel.alpha = 0;
        app.stage.addChild(coordLabel);

        // Inverse mapping: screen → data coords (accounting for zoom/pan)
        const screenToData = (sx: number, sy: number) => {
            // Convert screen to viewport-local coords
            const lx = (sx - viewport.position.x) / viewport.scale.x;
            const ly = (sy - viewport.position.y) / viewport.scale.y;
            // Convert to data coords
            const dataX = ((lx - padL) / plotW) * xMax;
            const dataY = ((ly - padT) / plotH) * yMax;
            return { dataX, dataY };
        };

        // ─── Highlight layer (for clicked repair lines) ───
        const highlightLayer = new Graphics();
        viewport.addChild(highlightLayer);

        // Build spatial index for click detection
        interface DotInfo { sx: number; sy: number; row: number; col: number; group: string }
        const dotIndex: DotInfo[] = [];
        for (const a of assignments) {
            dotIndex.push({
                sx: mapX(a.col, a.row),
                sy: mapY(a.col, a.row),
                row: a.row,
                col: a.col,
                group: a.group,
            });
        }

        // ─── Zoom & Pan ───
        const canvas = app.canvas as HTMLCanvasElement;
        const MIN_SCALE = 0.5;
        const MAX_SCALE = 20;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const oldScale = viewport.scale.x;
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * factor));

            viewport.position.x = mx - (mx - viewport.position.x) * (newScale / oldScale);
            viewport.position.y = my - (my - viewport.position.y) * (newScale / oldScale);
            viewport.scale.set(newScale);
        };

        let dragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let vpStartX = 0;
        let vpStartY = 0;
        let didDrag = false;

        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            dragging = true;
            didDrag = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            vpStartX = viewport.position.x;
            vpStartY = viewport.position.y;
            canvas.style.cursor = 'grabbing';
        };

        const onMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            // Convert mouse to viewport-local coords for nearest-dot search
            const lx = (mx - viewport.position.x) / viewport.scale.x;
            const ly = (my - viewport.position.y) / viewport.scale.y;

            // Find nearest dot to show exact data coordinates
            const snapThreshold = 15 / viewport.scale.x; // 15 CSS px in viewport space
            let nearestDot: typeof dotIndex[0] | null = null;
            let nearestDist = Infinity;
            for (const d of dotIndex) {
                const dist = Math.hypot(d.sx - lx, d.sy - ly);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestDot = d;
                }
            }

            if (nearestDot && nearestDist < snapThreshold) {
                // Show exact data coords from the actual assignment
                coordLabel.text = `row: ${nearestDot.row}  col: ${nearestDot.col}  [${nearestDot.group}]`;
            } else {
                // Fallback: reverse-map pixel to data coords
                const { dataX, dataY } = screenToData(mx, my);
                if (axisSwapped) {
                    coordLabel.text = `row: ${Math.round(dataX)}  col: ${Math.round(dataY)}`;
                } else {
                    coordLabel.text = `row: ${Math.round(dataY)}  col: ${Math.round(dataX)}`;
                }
            }
            coordLabel.x = mx + 12;
            coordLabel.y = my - 8;
            // Only show when within plot area (roughly)
            const inPlot = mx > 30 && mx < width - 5 && my > 5 && my < height - 20;
            coordLabel.alpha = inPlot ? 0.85 : 0;

            if (!dragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
            viewport.position.x = vpStartX + dx;
            viewport.position.y = vpStartY + dy;
        };

        const onMouseUp = (e: MouseEvent) => {
            const wasDragging = dragging;
            dragging = false;
            canvas.style.cursor = 'grab';

            // Click detection (not drag)
            if (wasDragging && !didDrag) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                // Convert click to viewport-local coords
                const lx = (mx - viewport.position.x) / viewport.scale.x;
                const ly = (my - viewport.position.y) / viewport.scale.y;

                // Find nearest dot (in viewport-local space)
                let bestDist = Infinity;
                let bestDot: DotInfo | null = null;
                for (const d of dotIndex) {
                    const dist = Math.hypot(d.sx - lx, d.sy - ly);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestDot = d;
                    }
                }

                // Threshold: 8px in viewport-local space
                const threshold = 8;
                highlightLayer.clear();

                if (bestDot && bestDist < threshold) {
                    const d = bestDot;
                    const isRowGrp = d.group.startsWith('Row') || d.group === 'GlobalRow' || d.group === 'RowRepair';
                    const isLCR = d.group.startsWith('LCR');
                    const isCCR = d.group.startsWith('CCR');
                    const color = isRowGrp ? COLORS.rowRepair : isLCR ? COLORS.lcrRepair : isCCR ? COLORS.ccrRepair : COLORS.fail;

                    if (isRowGrp) {
                        // Highlight the row repair line
                        if (axisSwapped) {
                            const x = toScreenX(d.row);
                            highlightLayer.setStrokeStyle({ width: 3, color, alpha: 0.7 });
                            highlightLayer.moveTo(x, padT);
                            highlightLayer.lineTo(x, padT + plotH);
                        } else {
                            const y = toScreenY(d.row);
                            highlightLayer.setStrokeStyle({ width: 3, color, alpha: 0.7 });
                            highlightLayer.moveTo(padL, y);
                            highlightLayer.lineTo(padL + plotW, y);
                        }
                        highlightLayer.stroke();
                    } else if (isLCR || isCCR) {
                        // Highlight the col repair segment
                        const bsIdx = getBigSectionIdx(
                            d.row, sectionGroupSize, subsectionSize, subsectionsPerGroup, colSeg,
                        );
                        const bounds = sectionBounds.get(bsIdx);
                        if (bounds) {
                            const [startRow, endRow] = bounds;
                            highlightLayer.setStrokeStyle({ width: 3, color, alpha: 0.7 });
                            if (axisSwapped) {
                                const y = toScreenY(d.col);
                                highlightLayer.moveTo(toScreenX(startRow), y);
                                highlightLayer.lineTo(toScreenX(endRow), y);
                            } else {
                                const x = toScreenX(d.col);
                                highlightLayer.moveTo(x, toScreenY(startRow));
                                highlightLayer.lineTo(x, toScreenY(endRow));
                            }
                            highlightLayer.stroke();
                        }
                    }
                }
            }
        };

        const onMouseLeave = () => {
            coordLabel.alpha = 0;
        };

        canvas.style.cursor = 'grab';
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseleave', onMouseLeave);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        // Store cleanup refs
        (app as unknown as Record<string, unknown>).__cleanupZoomPan = () => {
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mouseleave', onMouseLeave);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [maxRow, maxCol, config, pixiColors]);

    useEffect(() => {
        if (run) {
            drawMap(run, showRow, showCol, swapped, pixiColors);
        }
        return () => {
            if (appRef.current) {
                const cleanup = (appRef.current as unknown as Record<string, unknown>).__cleanupZoomPan;
                if (typeof cleanup === 'function') cleanup();
                appRef.current.destroy(true);
                appRef.current = null;
            }
        };
    }, [run, drawMap, showRow, showCol, swapped, pixiColors]);

    if (!run) {
        return (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: currentTheme.bg }}>
                <Stack alignItems="center" spacing={0.5}>
                    <Typography sx={{ fontSize: '0.95rem', color: currentTheme.textMuted }}>
                        {i.awaitingSolve}
                    </Typography>
                </Stack>
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{ px: 1, py: 0.3, borderBottom: `1px solid ${currentTheme.border}`, bgcolor: currentTheme.bgDark }}
            >
                <ToggleItem color={currentTheme.cyan} label={i.legendRow} active={showRow} onClick={() => setShowRow(!showRow)} t={currentTheme} />
                <Typography sx={{ fontSize: '0.8rem', color: currentTheme.border }}>│</Typography>
                <ToggleItem color={currentTheme.purple} label={i.legendLcr} active={showCol} onClick={() => setShowCol(!showCol)} t={currentTheme} />
                <ToggleItem color={currentTheme.green} label={i.legendCcr} active={showCol} onClick={() => setShowCol(!showCol)} t={currentTheme} />
                <LegendItem color={currentTheme.pink} label={i.legendFail} t={currentTheme} />
                <Typography sx={{ fontSize: '0.8rem', color: currentTheme.border }}>│</Typography>
                <ToggleItem
                    color={currentTheme.orange}
                    label={swapped ? '⟲ row×col' : '⟳ col×row'}
                    active={true}
                    onClick={() => setSwapped(!swapped)}
                    t={currentTheme}
                />
                <Box sx={{ flex: 1 }} />
                <Typography sx={{ fontSize: '0.8rem', color: currentTheme.textMuted }}>
                    {run.assignments?.length ?? 0} {i.assignments}
                </Typography>
            </Stack>

            <Box ref={containerRef} sx={{ flex: 1, bgcolor: currentTheme.bg, overflow: 'hidden' }} />
        </Box>
    );
}

function LegendItem({ color, label, t }: { color: string; label: string; t: AppTheme }) {
    return (
        <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 6, height: 6, bgcolor: color }} />
            <Typography sx={{ fontSize: '0.8rem', color: t.textSubtle }}>{label}</Typography>
        </Stack>
    );
}

function ToggleItem({ color, label, active, onClick, t }: { color: string; label: string; active: boolean; onClick: () => void; t: AppTheme }) {
    return (
        <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            onClick={onClick}
            sx={{
                cursor: 'pointer',
                opacity: active ? 1 : 0.3,
                px: 0.5,
                py: 0.2,
                '&:hover': { bgcolor: t.bgHover },
                transition: 'opacity 0.15s',
                userSelect: 'none',
            }}
        >
            <Box sx={{ width: 6, height: 6, bgcolor: color }} />
            <Typography sx={{ fontSize: '0.8rem', color: active ? t.text : t.textMuted }}>
                {label}
            </Typography>
        </Stack>
    );
}
