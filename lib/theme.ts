import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export type ThemeName = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  primary: string;
  primaryMuted: string;
  success: string;
  successAlt: string;
  warning: string;
  warningAlt: string;
  danger: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

// Paleta inspirada en el logo de Trocora:
// - Fondo navy muy profundo (#0A0F1E)
// - Dorado champagne como color de marca (#D4A864)
export const palettes: Record<ThemeName, Palette> = {
  dark: {
    bg: '#0A0F1E',
    surface: '#141B2E',
    surfaceAlt: '#1E2940',
    border: '#2A3458',
    primary: '#D4A864',
    primaryMuted: 'rgba(212, 168, 100, 0.18)',
    success: '#22C55E',
    successAlt: '#4ADE80',
    warning: '#FACC15',
    warningAlt: '#FB923C',
    danger: '#EF4444',
    textPrimary: '#F1F0E8',
    textSecondary: '#9CA0B1',
    textMuted: '#5E6478',
  },
  light: {
    bg: '#FAF7F0',
    surface: '#FFFFFF',
    surfaceAlt: '#F4F0E5',
    border: '#E5DDC8',
    primary: '#B8924D',
    primaryMuted: 'rgba(184, 146, 77, 0.14)',
    success: '#16A34A',
    successAlt: '#22C55E',
    warning: '#CA8A04',
    warningAlt: '#EA580C',
    danger: '#DC2626',
    textPrimary: '#1A1F2E',
    textSecondary: '#4A5168',
    textMuted: '#8B8FA0',
  },
};

export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (palette: Palette) => T,
): () => T {
  return function useStyles() {
    const { palette } = useTheme();
    return useMemo(() => StyleSheet.create(factory(palette)), [palette]);
  };
}
