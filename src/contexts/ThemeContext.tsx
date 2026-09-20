import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { applyColorTheme } from '@/lib/colorThemes';
import { useUserPreferences } from '@/hooks/useUserTimezone';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  colorTheme: string;
  setColorTheme: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme;
    return stored || 'system';
  });
  
  // Initialize color theme from localStorage immediately for instant colors
  const [colorTheme, setColorTheme] = useState<string>(() => {
    return localStorage.getItem('colorTheme') || 'sage';
  });

  // Apply theme immediately on mount (before async fetch)
  useEffect(() => {
    const isDark = theme === 'system' 
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    applyColorTheme(colorTheme, isDark);
  }, []);

  // Adopt the user's saved preferences when they arrive (on sign-in, or after
  // they're changed on the Profile page). They come from the shared profile
  // query rather than a fetch of our own. This runs when the saved *values*
  // change, not on every auth event, so a theme toggled in the header isn't
  // undone when, say, the tab regains focus.
  const { colorTheme: savedColorTheme, themePreference } = useUserPreferences();
  useEffect(() => {
    if (savedColorTheme) {
      setColorTheme(savedColorTheme);
      localStorage.setItem('colorTheme', savedColorTheme);
    }
    if (themePreference && themePreference !== 'system') {
      setTheme(themePreference as Theme);
    }
  }, [savedColorTheme, themePreference]);

  useEffect(() => {
    const root = document.documentElement;
    
    const applyTheme = (theme: Theme) => {
      const isDark = theme === 'system' 
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : theme === 'dark';
      
      root.classList.toggle('dark', isDark);
      
      // Apply color theme whenever theme changes
      applyColorTheme(colorTheme, isDark);
    };

    applyTheme(theme);
    localStorage.setItem('theme', theme);
    localStorage.setItem('colorTheme', colorTheme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme('system');
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme, colorTheme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, colorTheme, setColorTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
