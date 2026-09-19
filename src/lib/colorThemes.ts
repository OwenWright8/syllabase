export interface ColorTheme {
  name: string;
  label: string;
  colors: {
    light: {
      primary: string;
      accent: string;
      purple: string;
      pink: string;
      orange: string;
      teal: string;
    };
    dark: {
      primary: string;
      accent: string;
      purple: string;
      pink: string;
      orange: string;
      teal: string;
    };
  };
}

export const colorThemes: Record<string, ColorTheme> = {
  // Palette based on Animal Crossing: New Leaf — leaf green, Tom Nook brown,
  // hydrangea purple, cherry-blossom pink, acorn orange, and river blue.
  sage: {
    name: 'sage',
    label: 'Sage',
    colors: {
      light: {
        primary: '100 38% 40%',
        accent: '28 42% 42%',
        purple: '265 35% 68%',
        pink: '340 55% 75%',
        orange: '25 65% 55%',
        teal: '195 45% 48%',
      },
      dark: {
        primary: '100 32% 55%',
        accent: '28 38% 55%',
        purple: '265 30% 70%',
        pink: '340 50% 72%',
        orange: '25 55% 60%',
        teal: '195 40% 55%',
      },
    },
  },
  purple: {
    name: 'purple',
    label: 'Purple',
    colors: {
      light: {
        primary: '250 100% 65%',
        accent: '320 85% 65%',
        purple: '270 95% 75%',
        pink: '330 85% 70%',
        orange: '25 95% 60%',
        teal: '180 75% 50%',
      },
      dark: {
        primary: '250 100% 70%',
        accent: '320 85% 65%',
        purple: '270 95% 75%',
        pink: '330 85% 70%',
        orange: '25 95% 60%',
        teal: '180 75% 50%',
      },
    },
  },
  blue: {
    name: 'blue',
    label: 'Blue',
    colors: {
      light: {
        primary: '210 100% 60%',
        accent: '195 90% 55%',
        purple: '220 95% 70%',
        pink: '200 85% 65%',
        orange: '190 80% 55%',
        teal: '180 75% 50%',
      },
      dark: {
        primary: '210 100% 65%',
        accent: '195 90% 60%',
        purple: '220 95% 75%',
        pink: '200 85% 70%',
        orange: '190 80% 60%',
        teal: '180 75% 55%',
      },
    },
  },
  green: {
    name: 'green',
    label: 'Green',
    colors: {
      light: {
        primary: '145 75% 50%',
        accent: '160 70% 45%',
        purple: '170 65% 55%',
        pink: '140 75% 48%',
        orange: '155 70% 52%',
        teal: '180 75% 50%',
      },
      dark: {
        primary: '145 75% 55%',
        accent: '160 70% 50%',
        purple: '170 65% 60%',
        pink: '140 75% 53%',
        orange: '155 70% 57%',
        teal: '180 75% 55%',
      },
    },
  },
  red: {
    name: 'red',
    label: 'Red',
    colors: {
      light: {
        primary: '0 85% 60%',
        accent: '15 90% 65%',
        purple: '340 85% 70%',
        pink: '350 90% 68%',
        orange: '25 95% 60%',
        teal: '10 80% 58%',
      },
      dark: {
        primary: '0 85% 65%',
        accent: '15 90% 70%',
        purple: '340 85% 75%',
        pink: '350 90% 73%',
        orange: '25 95% 65%',
        teal: '10 80% 63%',
      },
    },
  },
  orange: {
    name: 'orange',
    label: 'Orange',
    colors: {
      light: {
        primary: '30 95% 58%',
        accent: '45 92% 55%',
        purple: '35 90% 62%',
        pink: '20 88% 60%',
        orange: '25 95% 60%',
        teal: '40 85% 56%',
      },
      dark: {
        primary: '30 95% 63%',
        accent: '45 92% 60%',
        purple: '35 90% 67%',
        pink: '20 88% 65%',
        orange: '25 95% 65%',
        teal: '40 85% 61%',
      },
    },
  },
  teal: {
    name: 'teal',
    label: 'Teal',
    colors: {
      light: {
        primary: '175 70% 50%',
        accent: '185 75% 52%',
        purple: '190 68% 55%',
        pink: '170 72% 48%',
        orange: '180 75% 50%',
        teal: '180 75% 50%',
      },
      dark: {
        primary: '175 70% 55%',
        accent: '185 75% 57%',
        purple: '190 68% 60%',
        pink: '170 72% 53%',
        orange: '180 75% 55%',
        teal: '180 75% 55%',
      },
    },
  },
};

export function applyColorTheme(theme: string, isDark: boolean) {
  const colorTheme = colorThemes[theme] || colorThemes.sage;
  const colors = isDark ? colorTheme.colors.dark : colorTheme.colors.light;
  
  const root = document.documentElement;
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--purple', colors.purple);
  root.style.setProperty('--pink', colors.pink);
  root.style.setProperty('--orange', colors.orange);
  root.style.setProperty('--teal', colors.teal);
}
