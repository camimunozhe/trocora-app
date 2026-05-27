import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/lib/AppDialog';
import { CHILE_REGIONS } from '@/lib/regions';
import { usePremium } from '@/lib/usePremium';
import { canAddRegion, limitReachedMessage } from '@/lib/planLimits';
import { makeStyles } from '@/lib/theme';

export default function RegionsScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const dialog = useDialog();
  const { isPremium } = usePremium();
  const styles = useStyles();
  const [selected, setSelected] = useState<Set<string>>(new Set(profile?.regions ?? []));
  const [saving, setSaving] = useState(false);

  async function toggle(code: string) {
    if (saving) return;
    const isAdding = !selected.has(code);
    if (isAdding) {
      const check = canAddRegion(selected.size, isPremium);
      if (!check.allowed) {
        const { title, message } = limitReachedMessage('regions', check.current, check.limit);
        dialog.confirm({
          title,
          message,
          confirmText: 'Pasarme a Pro',
          cancelText: 'Más tarde',
          onConfirm: () => router.push('/paywall'),
        });
        return;
      }
    }
    const next = new Set(selected);
    next.has(code) ? next.delete(code) : next.add(code);
    if (next.size === 0) {
      dialog.alert({
        title: 'Selecciona al menos una',
        message: 'Necesitas mantener al menos una región para poder hacer intercambios.',
      });
      return;
    }
    setSelected(next);
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ regions: Array.from(next) })
      .eq('id', user!.id);
    if (error) {
      dialog.alert({ title: 'No se pudo guardar', message: error.message });
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
        <Text style={styles.title}>Regiones</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Regiones donde puedes hacer intercambios. Esto ayuda a conectar con coleccionistas cercanos.
        </Text>

        {CHILE_REGIONS.map(r => {
          const isOn = selected.has(r.code);
          return (
            <TouchableOpacity
              key={r.code}
              style={[styles.row, isOn && styles.rowActive]}
              onPress={() => toggle(r.code)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={[styles.rowLabel, isOn && styles.rowLabelActive]}>{r.label}</Text>
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
  title: { color: p.textPrimary, fontSize: 16, fontWeight: '700' },
  scroll: { padding: 20, gap: 8 },
  intro: { color: p.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface,
  },
  rowActive: { borderColor: p.primary, backgroundColor: p.primaryMuted },
  rowLabel: { color: p.textPrimary, fontSize: 15, fontWeight: '600' },
  rowLabelActive: { color: p.primary },
}));
