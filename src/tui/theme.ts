export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
  border: string;
  background?: string;
}

export const themes: Record<string, ThemeColors> = {
  dark: {
    primary: 'cyan',
    secondary: 'blue',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    muted: 'gray',
    border: 'cyan',
  },
  light: {
    primary: 'blue',
    secondary: 'magenta',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    muted: 'gray',
    border: 'blue',
  },
  dracula: {
    primary: 'magenta',
    secondary: 'cyan',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    muted: 'gray',
    border: 'magenta',
  },
  cyberpunk: {
    primary: 'yellow',
    secondary: 'cyan',
    success: 'greenBright',
    warning: 'magenta',
    error: 'redBright',
    muted: 'gray',
    border: 'yellow',
  },
};

export function getTheme(themeName: string = 'dark'): ThemeColors {
  return themes[themeName] || themes.dark;
}
