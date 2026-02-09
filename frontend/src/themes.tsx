import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ─── 主题定义 ───

export interface AppTheme {
    name: string;
    // 结构色
    bg: string;
    bgDark: string;
    bgHover: string;
    bgSelected: string;
    border: string;
    borderSubtle: string;
    statusBar: string;
    // 文字
    text: string;
    textMuted: string;
    textSubtle: string;
    // 语义色
    pink: string;
    green: string;
    cyan: string;
    purple: string;
    orange: string;
    yellow: string;
    // PixiJS (0x hex)
    pixi: {
        bg: number;
        grid: number;
        rowRepair: number;
        lcrRepair: number;
        ccrRepair: number;
        fail: number;
        highlight: number;
        text: number;
        textBright: number;
        sectionBorder: number;
    };
}

export const MONOKAI: AppTheme = {
    name: 'Monokai',
    bg: '#272822',
    bgDark: '#1e1f1c',
    bgHover: '#3e3d32',
    bgSelected: '#49483e',
    border: '#3e3d32',
    borderSubtle: '#2d2e27',
    statusBar: '#414339',
    text: '#f8f8f2',
    textMuted: '#908b6e',
    textSubtle: '#c0bfb0',
    pink: '#f92672',
    green: '#a6e22e',
    cyan: '#66d9ef',
    purple: '#ae81ff',
    orange: '#fd971f',
    yellow: '#e6db74',
    pixi: {
        bg: 0x272822,
        grid: 0x3e3d32,
        rowRepair: 0x66d9ef,
        lcrRepair: 0xae81ff,
        ccrRepair: 0xa6e22e,
        fail: 0xff6b9d,
        highlight: 0xfd971f,
        text: 0x908b6e,
        textBright: 0xc0bfb0,
        sectionBorder: 0x49483e,
    },
};

export const LIGHT: AppTheme = {
    name: 'Light',
    bg: '#ffffff',
    bgDark: '#f0f0f0',
    bgHover: '#e8e8e8',
    bgSelected: '#d8dce0',
    border: '#d0d0d0',
    borderSubtle: '#e4e4e4',
    statusBar: '#e8e8e8',
    text: '#24292e',
    textMuted: '#6a737d',
    textSubtle: '#959da5',
    pink: '#d73a49',
    green: '#22863a',
    cyan: '#0366d6',
    purple: '#6f42c1',
    orange: '#e36209',
    yellow: '#b08800',
    pixi: {
        bg: 0xffffff,
        grid: 0xd0d0d0,
        rowRepair: 0x0366d6,
        lcrRepair: 0x6f42c1,
        ccrRepair: 0x22863a,
        fail: 0xd73a49,
        highlight: 0xe36209,
        text: 0x6a737d,
        textBright: 0x24292e,
        sectionBorder: 0xe0e0e0,
    },
};

const THEMES: Record<string, AppTheme> = { Monokai: MONOKAI, Light: LIGHT };

// ─── Context ───

interface ThemeContextValue {
    theme: AppTheme;
    themeName: string;
    setThemeName: (name: string) => void;
    themeNames: string[];
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: MONOKAI,
    themeName: 'Monokai',
    setThemeName: () => { },
    themeNames: Object.keys(THEMES),
});

export function useAppTheme() {
    return useContext(ThemeContext);
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
    const [themeName, setThemeNameState] = useState('Monokai');

    const setThemeName = useCallback((name: string) => {
        if (THEMES[name]) setThemeNameState(name);
    }, []);

    const theme = THEMES[themeName] ?? MONOKAI;

    return (
        <ThemeContext.Provider value={{ theme, themeName, setThemeName, themeNames: Object.keys(THEMES) }}>
            {children}
        </ThemeContext.Provider>
    );
}
