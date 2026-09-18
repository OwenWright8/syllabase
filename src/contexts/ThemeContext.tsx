import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { applyColorTheme } from '@/lib/colorThemes';
import { supabase } from '@/integrations/supabase/client';

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

  // Load color theme from profile and listen to auth changes
  useEffect(() => {
    const loadColorTheme = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('color_theme, theme_preference')
          .eq('id', user.id)
          .single();
        
        if (data?.color_theme) {
          setColorTheme(data.color_theme);
          localStorage.setItem('colorTheme', data.color_theme);
        }
        if (data?.theme_preference && data.theme_preference !== 'system') {
          setTheme(data.theme_preference as Theme);
        }
      }
    };
    
    loadColorTheme();

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadColorTheme();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
