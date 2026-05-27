import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ProBadge } from '@/lib/ProBadge';
import { makeStyles } from '@/lib/theme';
import type { Profile } from '@/types/database';

type Reputation = { positive_count: number; negative_count: number; total_ratings: number } | null;
type GameBreakdown = { pokemon: number; magic: number; published: number };

function memberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const month = d.toLocaleDateString('es', { month: 'short' }).replace('.', '');
  return `${month} ${d.getFullYear()}`;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { palette } = useTheme();
  const styles = useStyles();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reputation, setReputation] = useState<Reputation>(null);
  const [collectionCount, setCollectionCount] = useState<number | null>(null);
  const [meetupCount, setMeetupCount] = useState(0);
  const [breakdown, setBreakdown] = useState<GameBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    if (user && id === user.id) {
      router.replace('/(tabs)/profile');
      return;
    }
    (async () => {
      const [pRes, repRes, colRes, meetRes, pkmRes, mtgRes, pubRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('user_reputation').select('*').eq('user_id', id).single(),
        supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', id),
        supabase.from('meetups').select('id', { count: 'exact' })
          .or(`proposer_id.eq.${id},receiver_id.eq.${id}`)
          .eq('status', 'completed'),
        supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', id).eq('game', 'pokemon').eq('is_published', true),
        supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', id).eq('game', 'magic').eq('is_published', true),
        supabase.from('cards_collection').select('id', { count: 'exact' }).eq('user_id', id).eq('is_published', true),
      ]);
      const prof = pRes.data as Profile | null;
      setProfile(prof);
      setReputation(repRes.data as Reputation);
      setCollectionCount(prof?.collection_public ? (colRes.count ?? 0) : null);
      setMeetupCount(meetRes.count ?? 0);
      setBreakdown({
        pokemon: pkmRes.count ?? 0,
        magic: mtgRes.count ?? 0,
        published: pubRes.count ?? 0,
      });
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={palette.textSecondary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={24} color={palette.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Perfil</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="person-outline" size={48} color={palette.surfaceAlt} />
          <Text style={styles.notFoundText}>No se encontró este usuario.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const since = memberSince(profile.created_at);
  const positiveRate = reputation && reputation.total_ratings > 0
    ? Math.round((reputation.positive_count / reputation.total_ratings) * 100)
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={palette.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>@{profile.username}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView>
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{profile.username[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
          </View>

          <View style={styles.usernameRow}>
            <Text style={styles.username}>@{profile.username}</Text>
            <ProBadge status={profile.premium_status} size="md" />
          </View>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          {since && (
            <View style={styles.badgesRow}>
              <View style={styles.badgeChip}>
                <Ionicons name="calendar-outline" size={13} color={palette.textSecondary} />
                <Text style={styles.badgeText}>Desde {since}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.stats}>
          {collectionCount !== null && (
            <>
              <StatBox label="Cartas" value={String(collectionCount)} />
              <View style={styles.statDivider} />
            </>
          )}
          <StatBox label="Intercambios" value={String(meetupCount)} />
          <View style={styles.statDivider} />
          <StatBox
            label="Reputación"
            value={positiveRate !== null ? `${positiveRate}%` : '—'}
            sub={reputation && reputation.total_ratings > 0 ? `${reputation.total_ratings} ratings` : undefined}
          />
        </View>

        {breakdown && breakdown.published > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Publicaciones</Text>
            <View style={styles.metricsList}>
              {breakdown.pokemon > 0 && (
                <View style={styles.metricRow}>
                  <View style={styles.metricLabel}>
                    <View style={[styles.metricDot, { backgroundColor: palette.warning }]} />
                    <Text style={styles.metricLabelText}>Pokémon</Text>
                  </View>
                  <Text style={styles.metricValue}>{breakdown.pokemon}</Text>
                </View>
              )}
              {breakdown.magic > 0 && (
                <View style={styles.metricRow}>
                  <View style={styles.metricLabel}>
                    <View style={[styles.metricDot, { backgroundColor: '#A78BFA' }]} />
                    <Text style={styles.metricLabelText}>Magic</Text>
                  </View>
                  <Text style={styles.metricValue}>{breakdown.magic}</Text>
                </View>
              )}
              <View style={[styles.metricRow, styles.metricRowLast]}>
                <View style={styles.metricLabel}>
                  <Ionicons name="pricetag-outline" size={14} color={palette.successAlt} />
                  <Text style={styles.metricLabelText}>Total publicadas</Text>
                </View>
                <Text style={[styles.metricValue, { color: palette.successAlt }]}>{breakdown.published}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  headerTitle: { color: p.textPrimary, fontSize: 17, fontWeight: '700', maxWidth: '70%' },
  notFoundText: { color: p.textMuted, fontSize: 14, marginTop: 12, textAlign: 'center' },

  hero: { alignItems: 'center', padding: 24, paddingBottom: 16 },
  avatarWrap: { marginBottom: 12 },
  avatarImg: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: p.primary },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: p.primary, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },

  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  username: { color: p.textPrimary, fontSize: 22, fontWeight: '800' },
  bio: { color: p.textSecondary, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20, maxWidth: 320 },

  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 },
  badgeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: p.surface, borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: p.border,
  },
  badgeText: { color: p.textPrimary, fontSize: 12, fontWeight: '600' },

  stats: {
    flexDirection: 'row',
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border,
  },
  statBox: { flex: 1, alignItems: 'center', padding: 16 },
  statDivider: { width: 1, backgroundColor: p.border },
  statValue: { color: p.textPrimary, fontSize: 22, fontWeight: '800' },
  statLabel: { color: p.textMuted, fontSize: 12, marginTop: 2 },
  statSub: { color: p.textMuted, fontSize: 10 },

  section: { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: { color: p.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },

  metricsList: {
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border, overflow: 'hidden',
  },
  metricRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: p.border,
  },
  metricRowLast: { borderBottomWidth: 0 },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricDot: { width: 10, height: 10, borderRadius: 5 },
  metricLabelText: { color: p.textPrimary, fontSize: 14 },
  metricValue: { color: p.textPrimary, fontSize: 16, fontWeight: '700' },
}));
