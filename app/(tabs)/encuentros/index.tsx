import { useCallback, useEffect, useState, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { makeStyles } from '@/lib/theme';
import type { Meetup } from '@/types/database';

type MeetupWithProfiles = Meetup & {
  proposer: { username: string; avatar_url: string | null } | null;
  receiver: { username: string; avatar_url: string | null } | null;
};

export default function EncuentrosScreen() {
  const { user } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const styles = useStyles();
  const [meetups, setMeetups] = useState<MeetupWithProfiles[]>([]);
  const [unreadByMeetup, setUnreadByMeetup] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFirstMount = useRef(true);

  const fetchMeetups = useCallback(async () => {
    if (!user) return;
    const [meetupsRes, unreadRes] = await Promise.all([
      supabase
        .from('meetups')
        .select('*, proposer:profiles!meetups_proposer_id_fkey(username, avatar_url), receiver:profiles!meetups_receiver_id_fkey(username, avatar_url)')
        .or(`proposer_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false }),
      supabase.rpc('get_my_meetup_unread_counts', { p_user_id: user.id }),
    ]);
    setMeetups((meetupsRes.data as MeetupWithProfiles[]) ?? []);
    const rows = (unreadRes.data ?? []) as { meetup_id: string; unread_count: number }[];
    setUnreadByMeetup(new Map(rows.map(r => [r.meetup_id, r.unread_count])));
  }, [user]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMeetups();
    setRefreshing(false);
  }, [fetchMeetups]);

  useFocusEffect(useCallback(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      setLoading(true);
      fetchMeetups().finally(() => setLoading(false));
    } else {
      fetchMeetups();
    }
  }, [fetchMeetups]));

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const channel = supabase
      .channel(`encuentros-unread-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { fetchMeetups(); },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meetups', filter: `proposer_id=eq.${uid}` },
        () => { fetchMeetups(); },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meetups', filter: `receiver_id=eq.${uid}` },
        () => { fetchMeetups(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchMeetups]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Intercambios</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={palette.textSecondary} />
      ) : (
        <FlatList
          data={meetups}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <MeetupRow
              meetup={item}
              isReceived={item.receiver_id === user?.id}
              unreadCount={unreadByMeetup.get(item.id) ?? 0}
              onPress={() => router.push({ pathname: '/intercambio/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={<EmptyState />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.primary} />
          }
        />
      )}
    </SafeAreaView>
  );
}

function MeetupRow({ meetup, isReceived, unreadCount, onPress }: {
  meetup: MeetupWithProfiles;
  isReceived: boolean;
  unreadCount: number;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  const statusMap: Record<string, { label: string; color: string }> = {
    pending:   { label: 'Pendiente',  color: palette.warning },
    countered: { label: 'Pendiente',  color: palette.warning },
    confirmed: { label: 'Confirmado', color: palette.successAlt },
    completed: { label: 'Completado', color: palette.textMuted },
    cancelled: { label: 'Cancelado',  color: palette.danger },
  };
  const other = isReceived ? meetup.proposer : meetup.receiver;
  const status = statusMap[meetup.status] ?? { label: meetup.status, color: palette.textSecondary };
  const dateStr = new Date(meetup.created_at)
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const dirIcon = isReceived ? 'arrow-down-circle' : 'arrow-up-circle';
  const dirColor = isReceived ? palette.successAlt : palette.primary;
  const dirLabel = isReceived ? 'Recibido' : 'Enviado';

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowAvatar}>
        {other?.avatar_url ? (
          <Image source={{ uri: other.avatar_url }} style={styles.avatar} />
        ) : (
          <Ionicons name="person-outline" size={20} color={palette.textMuted} />
        )}
        <View style={[styles.dirBadge, { backgroundColor: dirColor }]}>
          <Ionicons name={dirIcon} size={14} color={palette.bg} />
        </View>
      </View>
      <View style={styles.rowInfo}>
        <View style={styles.rowTop}>
          <Text style={styles.rowUsername}>@{other?.username ?? '—'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '22' }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.rowType, { color: dirColor }]}>{dirLabel}</Text>
          <Text style={styles.rowDate}>· {dateStr}</Text>
        </View>
      </View>
      {unreadCount > 0 ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward-outline" size={16} color={palette.textMuted} />
      )}
    </TouchableOpacity>
  );
}

function EmptyState() {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name="swap-horizontal-outline" size={56} color={palette.surfaceAlt} style={{ marginBottom: 12 }} />
      <Text style={styles.emptyTitle}>Sin intercambios</Text>
      <Text style={styles.emptyText}>
        Explora cartas de otros coleccionistas y propón un intercambio
      </Text>
    </View>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: { padding: 20, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: '800', color: p.textPrimary },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: p.surface, borderRadius: 14, borderWidth: 1, borderColor: p.border, padding: 14,
  },
  rowAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: p.bg, borderWidth: 1, borderColor: p.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  dirBadge: {
    position: 'absolute', right: -4, bottom: -4,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: p.surface,
  },
  rowInfo: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowUsername: { color: p.textPrimary, fontSize: 15, fontWeight: '700' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowType: { color: p.textSecondary, fontSize: 12 },
  rowDate: { color: p.textMuted, fontSize: 12 },

  unreadBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: p.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: p.textPrimary, textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, color: p.textMuted, textAlign: 'center', lineHeight: 20 },
}));
