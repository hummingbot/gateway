import { AppConfig } from './app-config';

// Default colors from index.css (hex format for better UX)
export const DEFAULT_COLORS = {
  primary: '#0f172a',
  primaryDark: '#f8fafc',
  accent: '#f1f5f9',
  accentDark: '#1e293b',
};

/**
 * Convert hex color to HSL format for CSS custom properties
 * Returns format: "hue saturation% lightness%" (without hsl() wrapper)
 */
function hexToHSL(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  const hue = Math.round(h * 360);
  const saturation = Math.round(s * 100);
  const lightness = Math.round(l * 100);

  return `${hue} ${saturation}% ${lightness}%`;
}

/**
 * Apply theme colors to CSS custom properties
 * Accepts both hex (#rrggbb) and HSL (hue sat% light%) formats
 */
export function applyTheme(config: AppConfig) {
  const root = document.documentElement;
  const colors = config.theme?.colors;

  if (!colors) {
    return;
  }

  const isDark = document.documentElement.classList.contains('dark');

  // Helper to convert color to HSL if needed
  const toHSL = (color: string): string => {
    return color.startsWith('#') ? hexToHSL(color) : color;
  };

  // Apply light mode colors
  if (colors.primary) {
    const hsl = toHSL(colors.primary);
    root.style.setProperty('--primary-light', hsl);
    if (!isDark) {
      root.style.setProperty('--primary', hsl);
    }
  }

  if (colors.accent) {
    const hsl = toHSL(colors.accent);
    root.style.setProperty('--accent-light', hsl);
    if (!isDark) {
      root.style.setProperty('--accent', hsl);
    }
  }

  // Apply dark mode colors
  if (colors.primaryDark) {
    const hsl = toHSL(colors.primaryDark);
    root.style.setProperty('--primary-dark', hsl);
    if (isDark) {
      root.style.setProperty('--primary', hsl);
    }
  }

  if (colors.accentDark) {
    const hsl = toHSL(colors.accentDark);
    root.style.setProperty('--accent-dark', hsl);
    if (isDark) {
      root.style.setProperty('--accent', hsl);
    }
  }
}

/**
 * Update theme when dark mode changes
 * Accepts both hex (#rrggbb) and HSL (hue sat% light%) formats
 */
export function updateThemeForDarkMode(config: AppConfig, isDark: boolean) {
  const root = document.documentElement;
  const colors = config.theme?.colors;

  if (!colors) {
    return;
  }

  // Helper to convert color to HSL if needed
  const toHSL = (color: string): string => {
    return color.startsWith('#') ? hexToHSL(color) : color;
  };

  if (isDark) {
    // Switch to dark mode colors
    if (colors.primaryDark) {
      root.style.setProperty('--primary', toHSL(colors.primaryDark));
    }
    if (colors.accentDark) {
      root.style.setProperty('--accent', toHSL(colors.accentDark));
    }
  } else {
    // Switch to light mode colors
    if (colors.primary) {
      root.style.setProperty('--primary', toHSL(colors.primary));
    }
    if (colors.accent) {
      root.style.setProperty('--accent', toHSL(colors.accent));
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
    root.style.setProperty('--primary', hexToHSL(DEFAULT_COLORS.primaryDark));
    root.style.setProperty('--accent', hexToHSL(DEFAULT_COLORS.accentDark));
  } else {
    root.style.setProperty('--primary', hexToHSL(DEFAULT_COLORS.primary));
    root.style.setProperty('--accent', hexToHSL(DEFAULT_COLORS.accent));
  }

  // Clear custom properties
  root.style.removeProperty('--primary-light');
  root.style.removeProperty('--primary-dark');
  root.style.removeProperty('--accent-light');
  root.style.removeProperty('--accent-dark');
}
