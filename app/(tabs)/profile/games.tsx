import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { GAME_DISPLAY_NAMES, resolveEnabledGames } from '@/lib/enabledGames';
import { makeStyles } from '@/lib/theme';
import { useDialog } from '@/lib/AppDialog';
import { useTabBarClearance } from '@/lib/useTabBarClearance';
import type { TCGGame } from '@/types/database';

export default function GamesScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const dialog = useDialog();
  const styles = useStyles();
  const tabBarClearance = useTabBarClearance();
  const [saving, setSaving] = useState(false);

  const enabled = resolveEnabledGames(profile?.enabled_games);

  async function toggle(game: TCGGame) {
    if (saving) return;
    const next = enabled.includes(game) ? enabled.filter(g => g !== game) : [...enabled, game];
    if (next.length === 0) {
      dialog.alert({ title: 'Selecciona al menos uno', message: 'Necesitas tener al menos un juego habilitado.' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ enabled_games: next }).eq('id', user!.id);
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
        <Text style={styles.title}>Juegos</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarClearance }]}>
        <Text style={styles.intro}>
          Elige los juegos que coleccionas. Solo se muestran en tu colección, en explorar y al agregar cartas. Puedes cambiarlo cuando quieras — no se borra ningún dato.
        </Text>

        {(['pokemon', 'magic'] as TCGGame[]).map(g => {
          const isOn = enabled.includes(g);
          return (
            <TouchableOpacity
              key={g}
              style={[styles.row, isOn && styles.rowActive]}
              onPress={() => toggle(g)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={[styles.rowLabel, isOn && styles.rowLabelActive]}>
                {GAME_DISPLAY_NAMES[g]}
              </Text>
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
  rowLabel: { color: p.textSecondary, fontSize: 15, fontWeight: '600' },
  rowLabelActive: { color: p.textPrimary },
}));
