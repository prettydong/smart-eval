import { useAppTheme } from '../themes';

/** 内存修补主题 SVG 插图 — 展示 DRAM bank 阵列 + 行/列修复 */
export default function MemoryRepairSvg() {
    const { theme: t } = useAppTheme();

    const cellSize = 14;
    const gap = 2;
    const rows = 10;
    const cols = 16;
    const gridW = cols * (cellSize + gap);
    const gridH = rows * (cellSize + gap);
    const offsetX = 60;
    const offsetY = 40;
    const svgW = gridW + offsetX * 2;
    const svgH = gridH + offsetY * 2 + 30;

    // 模拟 fail 位置（固定的）
    const fails = [
        [1, 3], [2, 7], [3, 11], [4, 5], [5, 9], [6, 2], [7, 14], [8, 6],
        [0, 10], [9, 1], [3, 3], [6, 12], [1, 15], [8, 8],
    ];
    // 行修复
    const rowRepairs = [3, 6];
    // 列修复
    const colRepairs = [7, 11];

    const failSet = new Set(fails.map(([r, c]) => `${r},${c}`));

    return (
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ opacity: 0.85, maxWidth: 420 }}>
            <defs>
                {/* 行修复渐变 */}
                <linearGradient id="rowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={t.cyan} stopOpacity="0" />
                    <stop offset="15%" stopColor={t.cyan} stopOpacity="0.25" />
                    <stop offset="85%" stopColor={t.cyan} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={t.cyan} stopOpacity="0" />
                </linearGradient>
                {/* 列修复渐变 */}
                <linearGradient id="colGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={t.purple} stopOpacity="0" />
                    <stop offset="15%" stopColor={t.purple} stopOpacity="0.25" />
                    <stop offset="85%" stopColor={t.purple} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={t.purple} stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* 行修复高亮条 */}
            {rowRepairs.map((r) => (
                <rect key={`rh-${r}`}
                    x={offsetX - 4}
                    y={offsetY + r * (cellSize + gap) - 2}
                    width={gridW + 8}
                    height={cellSize + 4}
                    fill="url(#rowGrad)" rx={3}
                />
            ))}

            {/* 列修复高亮条 */}
            {colRepairs.map((c) => (
                <rect key={`ch-${c}`}
                    x={offsetX + c * (cellSize + gap) - 2}
                    y={offsetY - 4}
                    width={cellSize + 4}
                    height={gridH + 8}
                    fill="url(#colGrad)" rx={3}
                />
            ))}

            {/* 网格单元 */}
            {Array.from({ length: rows }, (_, r) =>
                Array.from({ length: cols }, (_, c) => {
                    const x = offsetX + c * (cellSize + gap);
                    const y = offsetY + r * (cellSize + gap);
                    const isFail = failSet.has(`${r},${c}`);
                    const isRowRepaired = rowRepairs.includes(r);
                    const isColRepaired = colRepairs.includes(c);
                    const isRepaired = isFail && (isRowRepaired || isColRepaired);

                    let fill = t.border;
                    let opacity = 0.3;
                    if (isFail && !isRepaired) {
                        fill = t.pink; opacity = 0.9;
                    } else if (isRepaired) {
                        fill = t.green; opacity = 0.7;
                    } else if (isRowRepaired || isColRepaired) {
                        fill = isRowRepaired ? t.cyan : t.purple;
                        opacity = 0.15;
                    }

                    return (
                        <rect key={`${r}-${c}`} x={x} y={y} width={cellSize} height={cellSize}
                            rx={2} fill={fill} opacity={opacity}
                        />
                    );
                })
            )}

            {/* Fail 点标记（×） */}
            {fails.filter(([r, c]) => {
                const isRowRepaired = rowRepairs.includes(r);
                const isColRepaired = colRepairs.includes(c);
                return !(isRowRepaired || isColRepaired);
            }).map(([r, c]) => {
                const cx = offsetX + c * (cellSize + gap) + cellSize / 2;
                const cy = offsetY + r * (cellSize + gap) + cellSize / 2;
                return (
                    <g key={`fail-${r}-${c}`}>
                        <line x1={cx - 3} y1={cy - 3} x2={cx + 3} y2={cy + 3} stroke={t.pink} strokeWidth={1.5} opacity={0.8} />
                        <line x1={cx + 3} y1={cy - 3} x2={cx - 3} y2={cy + 3} stroke={t.pink} strokeWidth={1.5} opacity={0.8} />
                    </g>
                );
            })}

            {/* 已修复标记（✓） */}
            {fails.filter(([r, c]) => rowRepairs.includes(r) || colRepairs.includes(c)).map(([r, c]) => {
                const cx = offsetX + c * (cellSize + gap) + cellSize / 2;
                const cy = offsetY + r * (cellSize + gap) + cellSize / 2;
                return (
                    <polyline key={`ok-${r}-${c}`}
                        points={`${cx - 3},${cy} ${cx - 1},${cy + 3} ${cx + 4},${cy - 3}`}
                        fill="none" stroke={t.green} strokeWidth={1.5} opacity={0.9}
                    />
                );
            })}

            {/* 行标签 */}
            {rowRepairs.map((r) => (
                <text key={`rl-${r}`}
                    x={offsetX - 10} y={offsetY + r * (cellSize + gap) + cellSize / 2 + 4}
                    textAnchor="end" fontSize={10} fill={t.cyan} fontFamily="monospace" opacity={0.8}
                >R{r}</text>
            ))}

            {/* 列标签 */}
            {colRepairs.map((c) => (
                <text key={`cl-${c}`}
                    x={offsetX + c * (cellSize + gap) + cellSize / 2}
                    y={offsetY + gridH + 16}
                    textAnchor="middle" fontSize={10} fill={t.purple} fontFamily="monospace" opacity={0.8}
                >C{c}</text>
            ))}

            {/* 图例 */}
            <g transform={`translate(${offsetX}, ${offsetY + gridH + 25})`}>
                <rect width={8} height={8} rx={1} fill={t.pink} opacity={0.8} />
                <text x={12} y={8} fontSize={9} fill={t.textMuted} fontFamily="monospace">fail</text>

                <rect x={45} width={8} height={8} rx={1} fill={t.cyan} opacity={0.4} />
                <text x={57} y={8} fontSize={9} fill={t.textMuted} fontFamily="monospace">row repair</text>

                <rect x={125} width={8} height={8} rx={1} fill={t.purple} opacity={0.4} />
                <text x={137} y={8} fontSize={9} fill={t.textMuted} fontFamily="monospace">col repair</text>

                <rect x={205} width={8} height={8} rx={1} fill={t.green} opacity={0.7} />
                <text x={217} y={8} fontSize={9} fill={t.textMuted} fontFamily="monospace">repaired</text>
            </g>
        </svg>
    );
}
