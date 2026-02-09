import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#66d9ef',    // Monokai cyan
            light: '#78ddf2',
            dark: '#4fb3c9',
        },
        secondary: {
            main: '#a6e22e',    // Monokai green
            light: '#b8e85a',
            dark: '#8aba1e',
        },
        success: {
            main: '#a6e22e',
            light: '#b8e85a',
        },
        error: {
            main: '#f92672',
            light: '#fa4d8d',
        },
        warning: {
            main: '#fd971f',
            light: '#fdab4d',
        },
        info: {
            main: '#66d9ef',
        },
        background: {
            default: '#272822',
            paper: '#272822',
        },
        text: {
            primary: '#f8f8f2',
            secondary: '#a6a69b',
        },
        divider: '#3e3d32',
    },
    typography: {
        fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
        fontSize: 14,
        h6: { fontWeight: 600, fontSize: '1.05rem' },
        subtitle1: { fontWeight: 500, fontSize: '0.95rem' },
        subtitle2: { fontWeight: 600, fontSize: '0.9rem' },
        body1: { fontSize: '0.9rem' },
        body2: { fontSize: '0.85rem', color: '#a6a69b' },
        caption: { fontSize: '0.8rem' },
    },
    shape: {
        borderRadius: 0,  // VS Code: no rounded corners
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 0,
                    padding: '4px 12px',
                    fontSize: '0.9rem',
                    minHeight: 28,
                },
                contained: {
                    boxShadow: 'none',
                    '&:hover': { boxShadow: 'none' },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    borderRadius: 0,
                    border: 'none',
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    borderRadius: 0,
                    border: 'none',
                    boxShadow: 'none',
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        borderRadius: 0,
                        fontSize: '0.9rem',
                    },
                    '& .MuiInputLabel-root': {
                        fontSize: '0.9rem',
                    },
                },
            },
        },
        MuiSelect: {
            styleOverrides: {
                root: {
                    borderRadius: 0,
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 2,
                    fontWeight: 500,
                    fontFamily: "'JetBrains Mono', monospace",
                    height: 22,
                    fontSize: '0.8rem',
                },
            },
        },
        MuiDivider: {
            styleOverrides: {
                root: {
                    borderColor: '#3e3d32',
                },
            },
        },
        MuiList: {
            styleOverrides: {
                root: {
                    padding: 0,
                },
            },
        },
        MuiListItem: {
            styleOverrides: {
                root: {
                    borderRadius: 0,
                },
            },
        },
    },
});

export default theme;
