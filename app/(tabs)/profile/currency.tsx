import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { makeStyles } from '@/lib/theme';
import type { Currency } from '@/types/database';

const OPTIONS: { value: Currency; label: string; desc: string }[] = [
  { value: 'usd', label: 'USD', desc: 'Dólar estadounidense' },
  { value: 'clp', label: 'CLP', desc: 'Peso chileno' },
];

export default function CurrencyScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const styles = useStyles();
  const [saving, setSaving] = useState(false);
  const current: Currency = profile?.currency ?? 'usd';

  async function setCurrency(value: Currency) {
    if (saving || current === value) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ currency: value }).eq('id', user!.id);
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      setSaving(false);
      return;
    }
    await refreshProfile();
    setSaving(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={palette.primary} />
          <Text style={styles.back}>Perfil</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Divisa</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Elige la moneda en la que quieres ver y registrar los precios de tus cartas.
        </Text>

        {OPTIONS.map(opt => {
          const isOn = current === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.row, isOn && styles.rowActive]}
              onPress={() => setCurrency(opt.value)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, isOn && styles.rowLabelActive]}>{opt.label}</Text>
                <Text style={styles.rowDesc}>{opt.desc}</Text>
              </View>
              {isOn && <Ionicons name="checkmark-circle" size={22} color={palette.primary} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  back: { color: p.primary, fontSize: 15 },
  title: { color: p.textPrimary, fontSize: 17, fontWeight: '700' },
  scroll: { padding: 16, gap: 8 },
  intro: { color: p.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowActive: { borderColor: p.primary },
  rowLabel: { color: p.textSecondary, fontSize: 15, fontWeight: '700' },
  rowLabelActive: { color: p.textPrimary },
  rowDesc: { color: p.textMuted, fontSize: 12, marginTop: 2 },
}));
