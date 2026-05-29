import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_HEIGHT = 50;

// El bottom tab flota y deja pasar el contenido por detrás (el scene ya no
// reserva una franja opaca). Por eso cada lista/scroll de una pantalla de tabs
// debe agregar este espacio inferior en su contentContainerStyle, para que su
// último ítem no quede tapado por el pill. Coincide con el cálculo de
// app/(tabs)/_layout.tsx (alto del pill + safe area + holgura).
export function useTabBarClearance(extra = 12): number {
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom > 0 ? insets.bottom : 12;
  return TAB_BAR_HEIGHT + bottom + extra;
}
