import { AppConfig } from './app-config';

// Default colors from index.css
export const DEFAULT_COLORS = {
  primary: '222.2 47.4% 11.2%',
  primaryDark: '210 40% 98%',
  accent: '210 40% 96.1%',
  accentDark: '217.2 32.6% 17.5%',
};

/**
 * Apply theme colors to CSS custom properties
 */
export function applyTheme(config: AppConfig) {
  const root = document.documentElement;
  const colors = config.theme?.colors;

  if (!colors) {
    return;
  }

  // Apply light mode colors
  if (colors.primary) {
    root.style.setProperty('--primary-light', colors.primary);
    // Update current --primary if not in dark mode
    if (!document.documentElement.classList.contains('dark')) {
      root.style.setProperty('--primary', colors.primary);
    }
  }

  if (colors.accent) {
    root.style.setProperty('--accent-light', colors.accent);
    if (!document.documentElement.classList.contains('dark')) {
      root.style.setProperty('--accent', colors.accent);
    }
  }

  // Apply dark mode colors
  if (colors.primaryDark) {
    root.style.setProperty('--primary-dark', colors.primaryDark);
    if (document.documentElement.classList.contains('dark')) {
      root.style.setProperty('--primary', colors.primaryDark);
    }
  }

  if (colors.accentDark) {
    root.style.setProperty('--accent-dark', colors.accentDark);
    if (document.documentElement.classList.contains('dark')) {
      root.style.setProperty('--accent', colors.accentDark);
    }
  }
}

/**
 * Update theme when dark mode changes
 */
export function updateThemeForDarkMode(config: AppConfig, isDark: boolean) {
  const root = document.documentElement;
  const colors = config.theme?.colors;

  if (!colors) {
    return;
  }

  if (isDark) {
    // Switch to dark mode colors
    if (colors.primaryDark) {
      root.style.setProperty('--primary', colors.primaryDark);
    }
    if (colors.accentDark) {
      root.style.setProperty('--accent', colors.accentDark);
    }
  } else {
    // Switch to light mode colors
    if (colors.primary) {
      root.style.setProperty('--primary', colors.primary);
    }
    if (colors.accent) {
      root.style.setProperty('--accent', colors.accent);
    }
  }
}

/**
 * Reset colors to defaults
 */
export function resetThemeColors() {
  const root = document.documentElement;
  const isDark = document.documentElement.classList.contains('dark');

  if (isDark) {
    root.style.setProperty('--primary', DEFAULT_COLORS.primaryDark);
    root.style.setProperty('--accent', DEFAULT_COLORS.accentDark);
  } else {
    root.style.setProperty('--primary', DEFAULT_COLORS.primary);
    root.style.setProperty('--accent', DEFAULT_COLORS.accent);
  }

  // Clear custom properties
  root.style.removeProperty('--primary-light');
  root.style.removeProperty('--primary-dark');
  root.style.removeProperty('--accent-light');
  root.style.removeProperty('--accent-dark');
}
