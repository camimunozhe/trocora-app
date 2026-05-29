import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useDialog } from '@/lib/AppDialog';
import { unblockUser } from '@/lib/moderation';
import { makeStyles } from '@/lib/theme';
import { useTabBarClearance } from '@/lib/useTabBarClearance';

type BlockedRow = { id: string; username: string; avatar_url: string | null };

export default function BlockedScreen() {
  const { user } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const dialog = useDialog();
  const styles = useStyles();
  const tabBarClearance = useTabBarClearance();
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: blocks } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id);
    const ids = (blocks ?? []).map((b) => b.blocked_id);
    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
    setRows((profs as BlockedRow[]) ?? []);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  function confirmUnblock(row: BlockedRow) {
    dialog.confirm({
      title: `Desbloquear a @${row.username}`,
      message: 'Volverás a ver su contenido y podrá contactarte de nuevo.',
      confirmText: 'Desbloquear',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        if (!user) return;
        setBusyId(row.id);
        await unblockUser(user.id, row.id);
        setBusyId(null);
        setRows((prev) => prev.filter((r) => r.id !== row.id));
      },
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={palette.primary} />
          <Text style={styles.back}>Soporte</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Bloqueados</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={palette.textSecondary} /></View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={48} color={palette.surfaceAlt} />
          <Text style={styles.emptyText}>No has bloqueado a nadie.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarClearance }]}>
          {rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <View style={styles.avatar}>
                {row.avatar_url
                  ? <Image source={{ uri: row.avatar_url }} style={styles.avatarImg} contentFit="cover" />
                  : <Text style={styles.avatarText}>{row.username[0]?.toUpperCase() ?? '?'}</Text>}
              </View>
              <Text style={styles.username} numberOfLines={1}>@{row.username}</Text>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => confirmUnblock(row)}
                disabled={busyId === row.id}
                activeOpacity={0.7}
              >
                {busyId === row.id
                  ? <ActivityIndicator color={palette.primary} />
                  : <Text style={styles.unblockText}>Desbloquear</Text>}
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 70 },
  back: { color: p.primary, fontSize: 15 },
  title: { color: p.textPrimary, fontSize: 16, fontWeight: '700' },
  scroll: { padding: 16, gap: 8 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  emptyText: { color: p.textMuted, fontSize: 14, textAlign: 'center' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
    backgroundColor: p.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  username: { flex: 1, color: p.textPrimary, fontSize: 15, fontWeight: '600' },
  unblockBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: p.border, backgroundColor: p.bg,
    minWidth: 104, alignItems: 'center',
  },
  unblockText: { color: p.primary, fontSize: 13, fontWeight: '700' },
}));
