import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Modal, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { formatPrice, currencyLabel } from '@/lib/currency';
import { getUsdToClp } from '@/lib/exchangeRate';
import { makeStyles } from '@/lib/theme';
import { useTabBarClearance } from '@/lib/useTabBarClearance';
import type { Currency } from '@/types/database';

type CatalogCard = {
  id: string;
  name: string;
  number: string;
  image: string | null;
  imageLarge: string | null;
  rarity: string | null;
  priceUsd: number | null;
};

const COLS = 3;
const GAP = 10;
const SIDE = 16;
const THUMB = (Dimensions.get('window').width - SIDE * 2 - GAP * (COLS - 1)) / COLS;

function sortByNumber(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

export default function CatalogSetScreen() {
  const { game, setId, setName } = useLocalSearchParams<{ game: string; setId: string; setName: string }>();
  const { profile } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const styles = useStyles();
  const tabBarClearance = useTabBarClearance();
  const currency = (profile?.currency ?? 'usd') as Currency;
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [usdToClp, setUsdToClp] = useState(970);
  const [loading, setLoading] = useState(true);
  const [zoomed, setZoomed] = useState<CatalogCard | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(c => c.name.toLowerCase().includes(q) || c.number.toLowerCase().includes(q));
  }, [search, cards]);

  useEffect(() => { getUsdToClp().then(setUsdToClp).catch(() => {}); }, []);

  useEffect(() => {
    if (!setId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (game === 'magic') {
        const { data } = await supabase
          .from('magic_cards')
          .select('id, name, collector_number, image_url, image_url_large, rarity, tcgplayer_normal_market, tcgplayer_foil_market')
          .eq('set_id', setId);
        if (cancelled) return;
        const rows: CatalogCard[] = (data ?? []).map((c: any) => ({
          id: c.id, name: c.name, number: c.collector_number ?? '',
          image: c.image_url, imageLarge: c.image_url_large ?? c.image_url, rarity: c.rarity,
          priceUsd: c.tcgplayer_normal_market ?? c.tcgplayer_foil_market ?? null,
        }));
        rows.sort((a, b) => sortByNumber(a.number, b.number));
        setCards(rows);
      } else {
        const { data } = await supabase
          .from('pokemon_cards')
          .select('id, name, number, image_url, image_url_large, rarity, tcgplayer_normal_market, tcgplayer_foil_market')
          .eq('set_id', setId);
        if (cancelled) return;
        const rows: CatalogCard[] = (data ?? []).map((c: any) => ({
          id: c.id, name: c.name, number: c.number ?? '',
          image: c.image_url, imageLarge: c.image_url_large ?? c.image_url, rarity: c.rarity,
          priceUsd: c.tcgplayer_normal_market ?? c.tcgplayer_foil_market ?? null,
        }));
        rows.sort((a, b) => sortByNumber(a.number, b.number));
        setCards(rows);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [game, setId]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={20} color={palette.primary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{setName ?? 'Set'}</Text>
        <View style={{ width: 28 }} />
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar carta por nombre o número…"
        placeholderTextColor={palette.textMuted}
        autoCapitalize="none"
      />

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={palette.textSecondary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.id}
          numColumns={COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ padding: SIDE, gap: GAP, paddingBottom: tabBarClearance }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.thumb} activeOpacity={0.8} onPress={() => setZoomed(item)}>
              <View style={styles.thumbImgWrap}>
                {item.image
                  ? <Image source={{ uri: item.image }} style={styles.thumbImg} contentFit="contain" />
                  : <Ionicons name="image-outline" size={28} color={palette.textMuted} />}
              </View>
              <Text style={styles.thumbNum}>#{item.number}</Text>
              <Text style={styles.thumbPrice} numberOfLines={1}>
                {item.priceUsd != null ? formatPrice(item.priceUsd, currency, usdToClp) : '—'}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{search ? 'Sin resultados para tu búsqueda.' : 'Este set no tiene cartas cargadas.'}</Text>}
        />
      )}

      <Modal visible={!!zoomed} transparent animationType="fade" onRequestClose={() => setZoomed(null)}>
        <TouchableOpacity style={styles.zoomBackdrop} activeOpacity={1} onPress={() => setZoomed(null)}>
          {zoomed && (
            <View style={styles.zoomCard} onStartShouldSetResponder={() => true}>
              <Image source={{ uri: zoomed.imageLarge ?? zoomed.image ?? undefined }} style={styles.zoomImg} contentFit="contain" />
              <Text style={styles.zoomName}>{zoomed.name}</Text>
              <Text style={styles.zoomMeta}>
                #{zoomed.number}{zoomed.rarity ? ` · ${zoomed.rarity}` : ''}
              </Text>
              <Text style={styles.zoomPrice}>
                {zoomed.priceUsd != null
                  ? `${formatPrice(zoomed.priceUsd, currency, usdToClp)} ${currencyLabel(currency)}`
                  : 'Sin precio de referencia'}
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

  search: {
    margin: 16, marginBottom: 4,
    backgroundColor: p.surface, borderRadius: 12, borderWidth: 1, borderColor: p.border,
    paddingHorizontal: 14, paddingVertical: 10, color: p.textPrimary, fontSize: 15,
  },

  thumb: { width: THUMB },
  thumbImgWrap: {
    width: THUMB, height: THUMB * 1.4, borderRadius: 8, overflow: 'hidden',
    backgroundColor: p.surface, alignItems: 'center', justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbNum: { color: p.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' },
  thumbPrice: { color: p.successAlt, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  empty: { color: p.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },

  zoomBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  zoomCard: { alignItems: 'center', gap: 8 },
  zoomImg: { width: Dimensions.get('window').width * 0.7, height: Dimensions.get('window').width * 0.98 },
  zoomName: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  zoomMeta: { color: '#cbd5e1', fontSize: 13 },
  zoomPrice: { color: '#4ADE80', fontSize: 16, fontWeight: '700', marginTop: 4 },
}));
