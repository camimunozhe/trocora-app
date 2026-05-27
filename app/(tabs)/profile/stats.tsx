import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { usePremium } from '@/lib/usePremium';
import { effectivePrice, type CardWithCatalog } from '@/lib/cardPrice';
import { formatCurrencyValue, currencyLabel } from '@/lib/currency';
import { getUsdToClp } from '@/lib/exchangeRate';
import { makeStyles } from '@/lib/theme';

type Condition = 'mint' | 'near_mint' | 'excellent' | 'good' | 'played' | 'poor';

const CONDITION_LABEL: Record<Condition, string> = {
  mint: 'Nueva',
  near_mint: 'Casi nueva',
  excellent: 'Excelente',
  good: 'Buena',
  played: 'Jugada',
  poor: 'Dañada',
};

const CONDITION_COLOR: Record<Condition, string> = {
  mint: '#4ADE80',
  near_mint: '#22D3EE',
  excellent: '#A78BFA',
  good: '#FACC15',
  played: '#FB923C',
  poor: '#EF4444',
};

type SetCompletion = {
  setName: string;
  game: 'pokemon' | 'magic';
  owned: number;
  total: number;
};

const STATS_SELECT =
  'id, game, card_name, set_name, card_number, quantity, condition, is_foil, price_reference, price_reference_currency, image_url, pokemon_card_id, magic_card_id, pokemon_cards(set_id, tcgplayer_normal_market, tcgplayer_foil_market), magic_cards(set_id, tcgplayer_normal_market, tcgplayer_foil_market)';

export default function StatsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { palette } = useTheme();
  const { isPremium } = usePremium();
  const currency = profile?.currency ?? 'usd';
  const styles = useStyles();
  const [cards, setCards] = useState<any[]>([]);
  const [setTotals, setSetTotals] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [usdToClp, setUsdToClp] = useState(950);

  useEffect(() => {
    if (currency !== 'clp') return;
    getUsdToClp().then(setUsdToClp).catch(() => {});
  }, [currency]);

  useEffect(() => {
    if (!user) return;
    if (!isPremium) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data: collectionData } = await supabase
        .from('cards_collection')
        .select(STATS_SELECT)
        .eq('user_id', user.id);
      const rows = (collectionData as any[]) ?? [];
      setCards(rows);

      const pokemonSetIds = new Set<string>();
      const magicSetIds = new Set<string>();
      for (const r of rows) {
        const sid = r.game === 'pokemon' ? r.pokemon_cards?.set_id : r.magic_cards?.set_id;
        if (!sid) continue;
        if (r.game === 'pokemon') pokemonSetIds.add(sid);
        else magicSetIds.add(sid);
      }
      const totals = new Map<string, number>();
      if (pokemonSetIds.size > 0) {
        const { data } = await supabase
          .from('pokemon_sets')
          .select('id, total')
          .in('id', Array.from(pokemonSetIds));
        ((data as any[]) ?? []).forEach(s => totals.set(`pokemon:${s.id}`, s.total));
      }
      if (magicSetIds.size > 0) {
        const { data } = await supabase
          .from('magic_sets')
          .select('id, card_count')
          .in('id', Array.from(magicSetIds));
        ((data as any[]) ?? []).forEach(s => totals.set(`magic:${s.id}`, s.card_count));
      }
      setSetTotals(totals);
      setLoading(false);
    })();
  }, [user?.id, isPremium]);

  const stats = useMemo(() => {
    let total = 0;
    const byCondition = new Map<Condition, number>();
    let foilCount = 0;
    let totalCount = 0;
    const bySet = new Map<string, { setName: string; game: 'pokemon' | 'magic'; setId: string; owned: number }>();
    for (const c of cards) {
      const qty = c.quantity ?? 1;
      totalCount += qty;
      total += effectivePrice(c as CardWithCatalog, currency, usdToClp) * qty;
      const cond = (c.condition ?? 'mint') as Condition;
      byCondition.set(cond, (byCondition.get(cond) ?? 0) + qty);
      if (c.is_foil) foilCount += qty;
      const setId = c.game === 'pokemon' ? c.pokemon_cards?.set_id : c.magic_cards?.set_id;
      if (setId && c.set_name) {
        const key = `${c.game}:${setId}`;
        const ex = bySet.get(key);
        if (ex) {
          ex.owned += 1;
        } else {
          bySet.set(key, { setName: c.set_name, game: c.game, setId, owned: 1 });
        }
      }
    }

    const top = [...cards]
      .map(c => ({ card: c, value: effectivePrice(c as CardWithCatalog, currency, usdToClp) }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const sets: SetCompletion[] = Array.from(bySet.values())
      .map(s => ({
        setName: s.setName,
        game: s.game,
        owned: s.owned,
        total: setTotals.get(`${s.game}:${s.setId}`) ?? 0,
      }))
      .filter(s => s.total > 0)
      .sort((a, b) => (b.owned / b.total) - (a.owned / a.total))
      .slice(0, 5);

    return { totalValue: total, totalCount, foilCount, byCondition, top, sets };
  }, [cards, currency, usdToClp, setTotals]);

  if (!isPremium) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Header onBack={() => router.back()} />
        <View style={styles.proGate}>
          <View style={styles.proGateIcon}>
            <Ionicons name="stats-chart" size={42} color={palette.warningAlt} />
          </View>
          <Text style={styles.proGateTitle}>Stats de colección</Text>
          <Text style={styles.proGateDesc}>
            Con Trocora Pro accedes al valor total, top cartas, completitud por set y distribución por condición.
          </Text>
          <TouchableOpacity style={styles.proGateBtn} onPress={() => router.push('/paywall')}>
            <Ionicons name="star" size={14} color={palette.bg} />
            <Text style={styles.proGateBtnText}>Probar Trocora Pro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Header onBack={() => router.back()} />
        <ActivityIndicator style={{ flex: 1 }} color={palette.textSecondary} />
      </SafeAreaView>
    );
  }

  const conditionsList = Array.from(stats.byCondition.entries()).sort((a, b) => b[1] - a[1]);
  const foilPct = stats.totalCount > 0 ? Math.round((stats.foilCount / stats.totalCount) * 100) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Valor estimado</Text>
          <Text style={styles.heroValue}>{formatCurrencyValue(stats.totalValue, currency)}</Text>
          <Text style={styles.heroSub}>
            {stats.totalCount} carta{stats.totalCount !== 1 ? 's' : ''} · {currencyLabel(currency)}
          </Text>
        </View>

        {stats.top.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top cartas más valiosas</Text>
            <View style={styles.topList}>
              {stats.top.map(({ card, value }, i) => (
                <View key={card.id} style={styles.topRow}>
                  <Text style={styles.topRank}>#{i + 1}</Text>
                  <View style={styles.topThumb}>
                    {card.image_url
                      ? <Image source={{ uri: card.image_url }} style={{ width: 30, height: 42, borderRadius: 4 }} contentFit="contain" />
                      : <Ionicons name="card-outline" size={20} color={palette.textMuted} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topName} numberOfLines={1}>{card.card_name}</Text>
                    <Text style={styles.topSet} numberOfLines={1}>
                      {card.set_name ?? '—'}{card.is_foil ? ' · ✦ Foil' : ''}
                    </Text>
                  </View>
                  <Text style={styles.topValue}>{formatCurrencyValue(value, currency)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {stats.sets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Completitud por set</Text>
            <View style={styles.setsList}>
              {stats.sets.map(s => {
                const pct = Math.round((s.owned / s.total) * 100);
                return (
                  <View key={s.setName} style={styles.setRow}>
                    <View style={styles.setHeader}>
                      <Text style={styles.setName} numberOfLines={1}>{s.setName}</Text>
                      <Text style={styles.setNumbers}>{s.owned}/{s.total}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%` }]} />
                    </View>
                    <Text style={styles.setPct}>{pct}%</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {conditionsList.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Distribución por condición</Text>
            <View style={styles.condList}>
              {conditionsList.map(([cond, count]) => (
                <View key={cond} style={styles.condRow}>
                  <View style={[styles.condDot, { backgroundColor: CONDITION_COLOR[cond] ?? palette.textSecondary }]} />
                  <Text style={styles.condLabel}>{CONDITION_LABEL[cond] ?? cond}</Text>
                  <Text style={styles.condCount}>{count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {stats.totalCount > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Foil / Holo</Text>
            <View style={styles.foilCard}>
              <View style={styles.foilLeft}>
                <Text style={styles.foilCount}>{stats.foilCount}</Text>
                <Text style={styles.foilCountLabel}>cartas foil</Text>
              </View>
              <View style={styles.foilBarWrap}>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${foilPct}%`, backgroundColor: palette.warning }]} />
                </View>
                <Text style={styles.foilPctText}>{foilPct}% del total</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="chevron-back" size={24} color={palette.primary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Stats de colección</Text>
      <View style={{ width: 24 }} />
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
  headerTitle: { color: p.textPrimary, fontSize: 17, fontWeight: '700' },

  scroll: { padding: 16, gap: 16 },

  heroCard: {
    backgroundColor: p.surface, borderRadius: 16,
    borderWidth: 1, borderColor: p.border,
    padding: 20, alignItems: 'center',
  },
  heroLabel: { color: p.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroValue: { color: p.successAlt, fontSize: 32, fontWeight: '800', marginTop: 4 },
  heroSub: { color: p.textSecondary, fontSize: 13, marginTop: 4 },

  section: { gap: 8 },
  sectionTitle: { color: p.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  topList: {
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border, overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: p.border,
  },
  topRank: { color: p.textMuted, fontSize: 12, fontWeight: '700', width: 28 },
  topThumb: {
    width: 30, height: 42, borderRadius: 4,
    backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center',
  },
  topName: { color: p.textPrimary, fontSize: 13, fontWeight: '600' },
  topSet: { color: p.textMuted, fontSize: 11, marginTop: 1 },
  topValue: { color: p.successAlt, fontSize: 13, fontWeight: '700' },

  setsList: { gap: 12 },
  setRow: {
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border,
    padding: 12, gap: 6,
  },
  setHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setName: { color: p.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 },
  setNumbers: { color: p.textSecondary, fontSize: 12, fontWeight: '600' },
  setPct: { color: p.primary, fontSize: 11, fontWeight: '700', alignSelf: 'flex-end' },

  barTrack: { height: 8, borderRadius: 4, backgroundColor: p.border, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: p.primary, borderRadius: 4 },

  condList: {
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border, overflow: 'hidden',
  },
  condRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: p.border,
  },
  condDot: { width: 10, height: 10, borderRadius: 5 },
  condLabel: { color: p.textPrimary, fontSize: 14, flex: 1 },
  condCount: { color: p.textPrimary, fontSize: 14, fontWeight: '700' },

  foilCard: {
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border,
    padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 16,
  },
  foilLeft: { alignItems: 'center', minWidth: 70 },
  foilCount: { color: p.warning, fontSize: 28, fontWeight: '800' },
  foilCountLabel: { color: p.textMuted, fontSize: 10, marginTop: 2 },
  foilBarWrap: { flex: 1, gap: 4 },
  foilPctText: { color: p.textSecondary, fontSize: 12, textAlign: 'right' },

  proGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  proGateIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(251,146,60,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  proGateTitle: { color: p.textPrimary, fontSize: 22, fontWeight: '800' },
  proGateDesc: { color: p.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  proGateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: p.warning, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    marginTop: 12,
  },
  proGateBtnText: { color: p.bg, fontSize: 14, fontWeight: '800' },
}));
