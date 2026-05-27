import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { palettes, type Palette, type ThemeName, type ThemePreference } from '@/lib/theme';

const STORAGE_KEY = 'trocora.theme_preference';

interface ThemeContextValue {
  preference: ThemePreference;
  theme: ThemeName;
  palette: Palette;
  setPreference: (p: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(preference: ThemePreference, systemScheme: ThemeName): ThemeName {
  if (preference === 'system') return systemScheme;
  return preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, profile, refreshProfile } = useAuth();
  const systemScheme = (useColorScheme() ?? 'dark') as ThemeName;

  // Arranca con 'system' y se actualiza apenas se resuelve AsyncStorage / profile.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  // Cold start: leer AsyncStorage para evitar flash mientras carga el profile.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => {
        if (v === 'light' || v === 'dark' || v === 'system') {
          setPreferenceState(v);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  // Cuando carga el profile, BD es source of truth.
  useEffect(() => {
    if (!profile) return;
    const fromDb = (profile as { theme_preference?: ThemePreference }).theme_preference;
    if (fromDb && fromDb !== preference) {
      setPreferenceState(fromDb);
      AsyncStorage.setItem(STORAGE_KEY, fromDb).catch(() => {});
    }
  }, [profile?.id, (profile as { theme_preference?: ThemePreference } | null)?.theme_preference]);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    if (user) {
      await supabase
        .from('profiles')
        .update({ theme_preference: next } as never)
        .eq('id', user.id);
      await refreshProfile();
    }
  }, [user?.id, refreshProfile]);

  const theme = resolveTheme(preference, systemScheme);
  const palette = palettes[theme];

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    theme,
    palette,
    setPreference,
  }), [preference, theme, palette, setPreference]);

  // Mientras no esté hidratado, igual renderizamos para no bloquear UI.
  // El estado inicial 'system' es razonable hasta que llegue la real.
  void hydrated;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
