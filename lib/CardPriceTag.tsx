import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { effectivePrice, type CardWithCatalog } from '@/lib/cardPrice';
import { formatCurrencyValue } from '@/lib/currency';
import type { Currency } from '@/types/database';

// Pastilla que marca una carta PUBLICADA en las grillas: ícono de etiqueta +
// precio (en la moneda del usuario), superpuesta abajo del arte. Si no hay
// precio, muestra "Publicada". Fondo oscuro translúcido para legibilidad sobre
// cualquier ilustración; acento en color del tema. Reemplaza el viejo borde
// indigo hardcodeado (ver TROC-27). Se posiciona absolute dentro de un
// contenedor relative (el wrapper de la imagen).
// Pill presentacional por etiqueta libre (ej. "Desde $X" en Explorar).
export function PriceTagPill({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.pill} pointerEvents="none">
      <Ionicons name="pricetag" size={9} color={palette.primary} />
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function CardPriceTag({ card, currency, usdToClp }: {
  card: CardWithCatalog;
  currency: Currency;
  usdToClp: number;
}) {
  const price = effectivePrice(card, currency, usdToClp);
  return <PriceTagPill label={price > 0 ? formatCurrencyValue(price, currency) : 'Publicada'} />;
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute', left: 4, bottom: 4, maxWidth: '92%',
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 6, paddingVertical: 2, paddingHorizontal: 5,
  },
  text: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
