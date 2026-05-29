import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { makeStyles } from '@/lib/theme';
import { formatPrice, currencyLabel, convertCurrency } from '@/lib/currency';
import { marketPriceUsd, type CardWithCatalog } from '@/lib/cardPrice';
import type { Currency } from '@/types/database';

// Modal para elegir el precio al publicar (o editar el precio de venta) de una
// carta. Pre-rellena con el precio de mercado sugerido (o el ya fijado),
// convertido a la moneda del usuario, y permite sobrescribirlo. Validación
// inline (sin AppDialog encima, para no apilar modales — ver TROC-22).
// El gate de límites del plan lo hace el padre ANTES de abrir este modal.
export function PublishPriceModal({
  visible, card, currency, usdToClp, mode, saving, onCancel, onConfirm,
}: {
  visible: boolean;
  card: CardWithCatalog | null;
  currency: Currency;
  usdToClp: number;
  mode: 'publish' | 'edit';
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (priceInCurrency: number) => void;
}) {
  const { palette } = useTheme();
  const styles = useStyles();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const market = card ? marketPriceUsd(card) : null;

  function formatForInput(v: number): string {
    return currency === 'clp'
      ? String(Math.round(v))
      : (v % 1 === 0 ? String(v) : v.toFixed(2));
  }

  function suggested(): string {
    if (!card) return '';
    if (card.price_reference != null) {
      return formatForInput(convertCurrency(card.price_reference, card.price_reference_currency, currency, usdToClp));
    }
    if (market == null) return '';
    return formatForInput(convertCurrency(market, 'usd', currency, usdToClp));
  }

  // Pre-rellena cada vez que se abre para una carta.
  useEffect(() => {
    if (visible) { setInput(suggested()); setError(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, card?.id]);

  function confirm() {
    const n = parseFloat(input);
    if (!input.trim() || isNaN(n) || n <= 0) {
      setError('Ingresa un precio válido mayor a 0.');
      return;
    }
    onConfirm(n);
  }

  if (!card) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.cardBox}>
          <Text style={styles.title}>{mode === 'publish' ? 'Publicar carta' : 'Precio de venta'}</Text>
          <Text style={styles.hint}>
            {market != null
              ? 'Te sugerimos el precio de mercado. Puedes ajustarlo.'
              : 'No hay precio de referencia para esta carta. Ingresa tu precio.'}
          </Text>
          {market != null && (
            <Text style={styles.ref}>
              Referencia de mercado: {formatPrice(market, currency, usdToClp)} {currencyLabel(currency)}
            </Text>
          )}
          <View style={styles.inputRow}>
            <Text style={styles.sym}>$</Text>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={t => { setInput(t); if (error) setError(''); }}
              keyboardType="decimal-pad"
              placeholder={currency === 'clp' ? '0' : '0.00'}
              placeholderTextColor={palette.textMuted}
              autoFocus
              selectionColor={palette.primary}
              returnKeyType="done"
              onSubmitEditing={confirm}
              underlineColorAndroid="transparent"
            />
            <Text style={styles.cur}>{currencyLabel(currency)}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirm} onPress={confirm} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.confirmText}>{mode === 'publish' ? 'Publicar' : 'Guardar'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((p) => ({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  cardBox: {
    width: '100%', maxWidth: 360,
    backgroundColor: p.surface, borderRadius: 16,
    borderWidth: 1, borderColor: p.border, padding: 20,
  },
  title: { color: p.textPrimary, fontSize: 17, fontWeight: '800' },
  hint: { color: p.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 18 },
  ref: { color: p.successAlt, fontSize: 13, fontWeight: '600', marginTop: 10 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14,
    backgroundColor: p.bg, borderRadius: 10, borderWidth: 1, borderColor: p.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  sym: { color: p.textSecondary, fontSize: 14, fontWeight: '600' },
  input: { flex: 1, color: p.textPrimary, fontSize: 18, fontWeight: '700', padding: 0 },
  cur: { color: p.textMuted, fontSize: 13, fontWeight: '600' },
  error: { color: p.danger, fontSize: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancel: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: p.border, alignItems: 'center',
  },
  cancelText: { color: p.textSecondary, fontSize: 14, fontWeight: '600' },
  confirm: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: p.primary, alignItems: 'center',
  },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
}));
