import { useState, useCallback } from 'react';
import { Box, Typography, Stack, Snackbar, Alert, Chip } from '@mui/material';
import ControlPanel from './components/ControlPanel';
import ResultPanel from './components/ResultPanel';
import RepairMap from './components/RepairMap';
import { solve } from './api/solver';
import type { SolveRequest, SolveResponse, RunResult } from './api/solver';
import { AppThemeProvider, useAppTheme } from './themes';
import { I18nProvider, useI18n } from './i18n';
import MemoryRepairSvg from './components/MemoryRepairSvg';

function isChipResp(r: SolveResponse): r is import('./api/solver').ChipSolveResponse {
  return r.evalMode === 'chip';
}

function AppInner() {
  const { theme: th, themeName, setThemeName, themeNames } = useAppTheme();
  const { t: i, lang, setLang, langNames } = useI18n();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState(0);
  const [selectedChip, setSelectedChip] = useState(0);
  const [selectedBank, setSelectedBank] = useState(0);

  const handleSolve = useCallback(async (req: SolveRequest) => {
    setLoading(true);
    setError(null);
    try {
      const data = await solve(req);
      setResult(data);
      setSelectedRun(0);
      setSelectedChip(0);
      setSelectedBank(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectChipBank = useCallback((chip: number, bank: number) => {
    setSelectedChip(chip);
    setSelectedBank(bank);
  }, []);

  const cycleTheme = () => {
    const idx = themeNames.indexOf(themeName);
    setThemeName(themeNames[(idx + 1) % themeNames.length]);
  };

  const cycleLang = () => {
    const idx = langNames.indexOf(lang);
    setLang(langNames[(idx + 1) % langNames.length]);
  };

  let currentRun: RunResult | null = null;
  let statusLabel = '';
  let configObj: Record<string, number> | null = null;

  if (result) {
    if (isChipResp(result)) {
      const chip = result.chips[selectedChip];
      if (chip && chip.banks[selectedBank]) {
        currentRun = chip.banks[selectedBank];
        statusLabel = `Chip #${selectedChip} / Bank #${selectedBank}`;
      }
      configObj = result.config;
    } else {
      currentRun = result.runs[selectedRun] ?? null;
      statusLabel = `Run #${selectedRun}`;
      configObj = result.config;
    }
  }

  let titleInfo = i.idle;
  if (result) {
    if (isChipResp(result)) {
      const s = result.summary;
      titleInfo = `${result.mode} · chip · ${s.feasibleChips}/${s.totalChips} ${i.pass}`;
    } else {
      const f = result.runs.filter(r => r.feasible).length;
      titleInfo = `${result.mode} · bank · ${f}/${result.runs.length} ${i.pass}`;
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* ─── Title Bar ─── */}
      <Box sx={{
        height: 30, minHeight: 30, bgcolor: th.bgDark, borderBottom: `1px solid ${th.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', px: 1, userSelect: 'none',
        position: 'relative',
      }}>
        <Typography sx={{ fontSize: '0.9rem', color: th.textSubtle, fontWeight: 500 }}>
          {i.appTitle}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ position: 'absolute', right: 8 }}>
          <Box sx={{ width: 6, height: 6, bgcolor: result ? th.green : th.textMuted, borderRadius: '50%' }} />
          <Typography sx={{ fontSize: '0.85rem', color: th.textMuted }}>{titleInfo}</Typography>
        </Stack>
      </Box>

      {/* ─── Main Content ─── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left */}
        <Box sx={{ width: 280, minWidth: 280, bgcolor: th.bg, borderRight: `1px solid ${th.border}`, overflow: 'auto' }}>
          <Box sx={{ px: 1, py: 0.5, bgcolor: th.bgDark, borderBottom: `1px solid ${th.border}` }}>
            <Typography sx={{ fontSize: '0.85rem', color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {i.explorerTitle}
            </Typography>
          </Box>
          <ControlPanel onSolve={handleSolve} loading={loading} />
        </Box>

        {/* Center */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', bgcolor: th.bgDark, borderBottom: `1px solid ${th.border}`, minHeight: 28 }}>
            <Box sx={{
              px: 1.5, py: 0.5, bgcolor: th.bg,
              borderRight: `1px solid ${th.border}`, borderTop: `1px solid ${th.green}`,
              display: 'flex', alignItems: 'center', gap: 0.5,
            }}>
              <Typography sx={{ fontSize: '0.9rem', color: th.text }}>{i.repairMapTab}</Typography>
              {currentRun && (
                <Chip label={currentRun.feasible ? i.feasible : i.infeasible} size="small" sx={{
                  bgcolor: currentRun.feasible ? `${th.green}22` : `${th.pink}22`,
                  color: currentRun.feasible ? th.green : th.pink, height: 16, fontSize: '0.8rem',
                }} />
              )}
            </Box>
          </Box>

          <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {currentRun ? (
              <RepairMap run={currentRun} maxRow={configObj?.maxrow ?? 16384} maxCol={configObj?.maxcol ?? 1024} config={configObj} />
            ) : (
              <Box sx={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', bgcolor: th.bg, gap: 2,
              }}>
                <MemoryRepairSvg />
                <Typography sx={{ fontSize: '1.1rem', color: th.textSubtle, fontWeight: 500 }}>
                  {i.landingTitle}
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', color: th.textMuted, maxWidth: 400, textAlign: 'center' }}>
                  {i.landingDesc}
                </Typography>
              </Box>
            )}
          </Box>

          {currentRun && currentRun.feasible && (
            <Box sx={{ px: 1, py: 0.3, bgcolor: th.bgDark, borderTop: `1px solid ${th.border}`, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: '0.85rem', color: th.textMuted }}>{statusLabel}</Typography>
              <Typography sx={{ fontSize: '0.85rem', color: th.cyan }}>{currentRun.totalFails} {i.fails}</Typography>
              <Typography sx={{ fontSize: '0.85rem', color: th.green }}>{currentRun.totalUsed} {i.repairs}</Typography>
              <Typography sx={{ fontSize: '0.85rem', color: th.orange }}>{(currentRun.solveTime * 1000).toFixed(2)}ms</Typography>
              <Typography sx={{ fontSize: '0.85rem', color: th.purple }}>{currentRun.solvedBy}</Typography>
            </Box>
          )}
        </Box>

        {/* Right */}
        <Box sx={{ width: 340, minWidth: 340, bgcolor: th.bg, borderLeft: `1px solid ${th.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ px: 1, py: 0.5, bgcolor: th.bgDark, borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
            <Typography sx={{ fontSize: '0.85rem', color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {i.outputTitle}
            </Typography>
          </Box>
          <ResultPanel
            data={result} selectedRun={selectedRun} onSelectRun={setSelectedRun}
            selectedChip={selectedChip} selectedBank={selectedBank} onSelectChipBank={handleSelectChipBank}
          />
        </Box>
      </Box>

      {/* ─── Status Bar ─── */}
      <Box sx={{ height: 22, minHeight: 22, bgcolor: th.statusBar, display: 'flex', alignItems: 'center', px: 1, gap: 2 }}>
        <Typography sx={{ fontSize: '0.8rem', color: th.textSubtle }}>{i.statusVersion}</Typography>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: '0.8rem', color: th.textSubtle }}>UTF-8</Typography>
        <StatusToggle label={lang} onClick={cycleLang} th={th} />
        <StatusToggle label={themeName} onClick={cycleTheme} th={th} />
      </Box>

      <Snackbar open={!!error} autoHideDuration={8000} onClose={() => setError(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 0 }}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}

function StatusToggle({ label, onClick, th }: { label: string; onClick: () => void; th: import('./themes').AppTheme }) {
  return (
    <Typography onClick={onClick} sx={{
      fontSize: '0.8rem', color: th.textSubtle, cursor: 'pointer', userSelect: 'none',
      '&:hover': { color: th.text, textDecoration: 'underline' },
    }}>
      {label}
    </Typography>
  );
}

export default function App() {
  return (
    <AppThemeProvider>
      <I18nProvider>
        <AppInner />
      </I18nProvider>
    </AppThemeProvider>
  );
}
