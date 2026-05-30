import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Modal, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { usePremium } from '@/lib/usePremium';
import { resolveEnabledGames } from '@/lib/enabledGames';
import { formatPrice, currencyLabel } from '@/lib/currency';
import { getUsdToClp } from '@/lib/exchangeRate';
import { makeStyles } from '@/lib/theme';
import { useTabBarClearance } from '@/lib/useTabBarClearance';
import type { Currency } from '@/types/database';

const MTG_SET_TYPES = ['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'starter'];
type GameKey = 'pokemon' | 'magic';
const CATALOG_GAMES: GameKey[] = ['pokemon', 'magic'];

type SetRow = { id: string; name: string; sub: string; symbol: string | null };
type CardResult = {
  id: string; name: string; setName: string; number: string;
  image: string | null; imageLarge: string | null; rarity: string | null; priceUsd: number | null;
};

async function searchCards(game: GameKey, q: string): Promise<CardResult[]> {
  if (game === 'magic') {
    const { data } = await supabase
      .from('magic_cards')
      .select('id, name, set_name, collector_number, image_url, image_url_large, rarity, tcgplayer_normal_market, tcgplayer_foil_market')
      .ilike('name', `%${q}%`)
      .limit(60);
    return (data ?? []).map((c: any) => ({
      id: c.id, name: c.name, setName: c.set_name, number: c.collector_number ?? '',
      image: c.image_url, imageLarge: c.image_url_large ?? c.image_url, rarity: c.rarity,
      priceUsd: c.tcgplayer_normal_market ?? c.tcgplayer_foil_market ?? null,
    }));
  }
  const { data } = await supabase
    .from('pokemon_cards')
    .select('id, name, set_name, number, image_url, image_url_large, rarity, tcgplayer_normal_market, tcgplayer_foil_market')
    .ilike('name', `%${q}%`)
    .limit(60);
  return (data ?? []).map((c: any) => ({
    id: c.id, name: c.name, setName: c.set_name, number: c.number ?? '',
    image: c.image_url, imageLarge: c.image_url_large ?? c.image_url, rarity: c.rarity,
    priceUsd: c.tcgplayer_normal_market ?? c.tcgplayer_foil_market ?? null,
  }));
}

export default function CatalogScreen() {
  const { palette } = useTheme();
  const { profile } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const { isPremium } = usePremium();
  const tabBarClearance = useTabBarClearance();
  const currency = (profile?.currency ?? 'usd') as Currency;

  const availableGames = useMemo<GameKey[]>(() => {
    const enabled = new Set(resolveEnabledGames(profile?.enabled_games));
    const g = CATALOG_GAMES.filter(x => enabled.has(x));
    return g.length ? g : ['pokemon'];
  }, [profile?.enabled_games]);

  const [game, setGame] = useState<GameKey>(availableGames[0]);
  const [mode, setMode] = useState<'sets' | 'cards'>('cards');
  const [search, setSearch] = useState('');
  const [sets, setSets] = useState<SetRow[]>([]);
  const [cardResults, setCardResults] = useState<CardResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchingCards, setSearchingCards] = useState(false);
  const [usdToClp, setUsdToClp] = useState(970);
  const [zoomed, setZoomed] = useState<CardResult | null>(null);

  // Si cambian los juegos habilitados y el actual ya no aplica, corrige.
  useEffect(() => {
    if (!availableGames.includes(game)) setGame(availableGames[0]);
  }, [availableGames]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { getUsdToClp().then(setUsdToClp).catch(() => {}); }, []);

  // Carga de sets del juego actual.
  useEffect(() => {
    if (!isPremium) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (game === 'pokemon') {
        const { data } = await supabase
          .from('pokemon_sets')
          .select('id, name, series, total, release_date, symbol_url')
          .order('release_date', { ascending: false });
        if (cancelled) return;
        setSets((data ?? []).map((s: any) => ({ id: s.id, name: s.name, sub: `${s.series} · ${s.total} cartas`, symbol: s.symbol_url ?? null })));
      } else {
        const { data } = await supabase
          .from('magic_sets')
          .select('id, name, set_type, card_count, released_at')
          .in('set_type', MTG_SET_TYPES)
          .gt('card_count', 0)
          .not('released_at', 'is', null)
          .order('released_at', { ascending: false });
        if (cancelled) return;
        setSets((data ?? []).map((s: any) => ({ id: s.id, name: s.name, sub: `${s.card_count} cartas`, symbol: null })));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [game, isPremium]);

  // Búsqueda global de cartas (modo "cards"), con debounce.
  useEffect(() => {
    if (!isPremium || mode !== 'cards') return;
    const q = search.trim();
    if (q.length < 2) { setCardResults([]); setSearchingCards(false); return; }
    setSearchingCards(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const rows = await searchCards(game, q);
      if (!cancelled) { setCardResults(rows); setSearchingCards(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, game, mode, isPremium]);

  const filteredSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sets;
    return sets.filter(s => s.name.toLowerCase().includes(q) || s.sub.toLowerCase().includes(q));
  }, [search, sets]);

  function switchMode(m: 'sets' | 'cards') { setMode(m); setSearch(''); setCardResults([]); }
  function switchGame(g: GameKey) { setGame(g); setSearch(''); setCardResults([]); }

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="chevron-back" size={22} color={palette.primary} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>Catálogo</Text>
      <View style={{ width: 28 }} />
    </View>
  );

  if (!isPremium) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {Header}
        <View style={styles.lockWrap}>
          <Ionicons name="layers-outline" size={48} color={palette.warning} />
          <Text style={styles.lockTitle}>Catálogo de sets</Text>
          <Text style={styles.lockText}>
            Explora todos los sets de tus juegos con sus cartas y precios de mercado, sin agregar nada a tu colección. Es una función de Trocora Pro.
          </Text>
          <TouchableOpacity style={styles.lockBtn} onPress={() => router.push('/paywall')} activeOpacity={0.85}>
            <Ionicons name="star" size={16} color="#fff" />
            <Text style={styles.lockBtnText}>Probar Trocora Pro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {Header}

      {availableGames.length > 1 && (
        <View style={styles.chipRow}>
          {availableGames.map(g => {
            const on = game === g;
            return (
              <TouchableOpacity key={g} style={[styles.chip, on && styles.chipActive]} onPress={() => switchGame(g)} activeOpacity={0.7}>
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{g === 'pokemon' ? 'Pokémon' : 'Magic'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.segment}>
        {(['cards', 'sets'] as const).map(m => {
          const on = mode === m;
          return (
            <TouchableOpacity key={m} style={[styles.segmentBtn, on && styles.segmentBtnActive]} onPress={() => switchMode(m)} activeOpacity={0.7}>
              <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{m === 'sets' ? 'Sets' : 'Cartas'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder={mode === 'sets' ? 'Buscar set…' : 'Buscar carta en todos los sets…'}
        placeholderTextColor={palette.textMuted}
        autoCapitalize="none"
      />

      {mode === 'sets' ? (
        loading ? (
          <ActivityIndicator style={{ flex: 1 }} color={palette.textSecondary} />
        ) : (
          <FlatList
            data={filteredSets}
            keyExtractor={s => s.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarClearance }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.setRow}
                activeOpacity={0.7}
                onPress={() => router.push({ pathname: '/catalog-set', params: { game, setId: item.id, setName: item.name } })}
              >
                {item.symbol
                  ? <Image source={{ uri: item.symbol }} style={styles.setSymbol} contentFit="contain" />
                  : <View style={styles.setSymbolFallback}><Ionicons name="albums-outline" size={16} color={palette.textMuted} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.setName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.setMeta} numberOfLines={1}>{item.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Sin resultados.</Text>}
          />
        )
      ) : (
        searchingCards ? (
          <ActivityIndicator style={{ flex: 1 }} color={palette.textSecondary} />
        ) : (
          <FlatList
            data={cardResults}
            keyExtractor={c => c.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarClearance }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.cardRow} activeOpacity={0.7} onPress={() => setZoomed(item)}>
                <View style={styles.cardThumbWrap}>
                  {item.image
                    ? <Image source={{ uri: item.image }} style={styles.cardThumb} contentFit="contain" />
                    : <Ionicons name="image-outline" size={20} color={palette.textMuted} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.setName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.setMeta} numberOfLines={1}>{item.setName} · #{item.number}</Text>
                </View>
                <Text style={styles.cardPrice}>{item.priceUsd != null ? formatPrice(item.priceUsd, currency, usdToClp) : '—'}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {search.trim().length < 2 ? 'Escribe al menos 2 letras del nombre de la carta.' : 'Sin resultados.'}
              </Text>
            }
          />
        )
      )}

      <Modal visible={!!zoomed} transparent animationType="fade" onRequestClose={() => setZoomed(null)}>
        <TouchableOpacity style={styles.zoomBackdrop} activeOpacity={1} onPress={() => setZoomed(null)}>
          {zoomed && (
            <View style={styles.zoomCard} onStartShouldSetResponder={() => true}>
              <Image source={{ uri: zoomed.imageLarge ?? zoomed.image ?? undefined }} style={styles.zoomImg} contentFit="contain" />
              <Text style={styles.zoomName}>{zoomed.name}</Text>
              <Text style={styles.zoomMeta}>{zoomed.setName} · #{zoomed.number}{zoomed.rarity ? ` · ${zoomed.rarity}` : ''}</Text>
              <Text style={styles.zoomPrice}>
                {zoomed.priceUsd != null ? `${formatPrice(zoomed.priceUsd, currency, usdToClp)} ${currencyLabel(currency)}` : 'Sin precio de referencia'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  backBtn: { width: 28 },
  title: { color: p.textPrimary, fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },

  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: p.border, backgroundColor: p.surface,
  },
  chipActive: { borderColor: p.primary, backgroundColor: p.primaryMuted },
  chipText: { color: p.textSecondary, fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: p.primary },

  segment: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12,
    backgroundColor: p.surface, borderRadius: 10, borderWidth: 1, borderColor: p.border, padding: 3,
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segmentBtnActive: { backgroundColor: p.primaryMuted },
  segmentText: { color: p.textSecondary, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: p.primary },

  search: {
    margin: 16, marginBottom: 8,
    backgroundColor: p.surface, borderRadius: 12, borderWidth: 1, borderColor: p.border,
    paddingHorizontal: 14, paddingVertical: 10, color: p.textPrimary, fontSize: 15,
  },

  setRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  setSymbol: { width: 32, height: 32 },
  setSymbolFallback: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: p.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  setName: { color: p.textPrimary, fontSize: 15, fontWeight: '600' },
  setMeta: { color: p.textMuted, fontSize: 12, marginTop: 2 },
  empty: { color: p.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },

  cardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  cardThumbWrap: {
    width: 38, height: 53, borderRadius: 6, overflow: 'hidden',
    backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center',
  },
  cardThumb: { width: '100%', height: '100%' },
  cardPrice: { color: p.successAlt, fontSize: 14, fontWeight: '700' },

  lockWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  lockTitle: { color: p.textPrimary, fontSize: 20, fontWeight: '800', marginTop: 4 },
  lockText: { color: p.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  lockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    backgroundColor: p.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24,
  },
  lockBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  zoomBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  zoomCard: { alignItems: 'center', gap: 8 },
  zoomImg: { width: Dimensions.get('window').width * 0.7, height: Dimensions.get('window').width * 0.98 },
  zoomName: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  zoomMeta: { color: '#cbd5e1', fontSize: 13, textAlign: 'center' },
  zoomPrice: { color: '#4ADE80', fontSize: 16, fontWeight: '700', marginTop: 4 },
}));
