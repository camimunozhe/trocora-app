import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, FlatList, ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { usePremium } from '@/lib/usePremium';
import { useDialog } from '@/lib/AppDialog';
import { addToWatchlist, isInWatchlist } from '@/lib/watchlist';
import { resolveEnabledGames } from '@/lib/enabledGames';
import { makeStyles } from '@/lib/theme';
import type { TCGGame } from '@/types/database';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type PkmSet = { id: string; name: string; series: string; total: number; symbol_url: string };
type MtgSet = { id: string; name: string; set_type: string; card_count: number; released_at: string };
type CatalogCard = {
  id: string;
  name: string;
  number: string;
  set_id: string;
  set_name: string;
  image_url: string;
  image_url_large: string;
};

type Page =
  | { page: 'game' }
  | { page: 'method'; game: TCGGame }
  | { page: 'sets'; game: TCGGame }
  | { page: 'cards-in-set'; game: TCGGame; setId: string; setName: string }
  | { page: 'search-name'; game: TCGGame };

const GAMES: { value: TCGGame; label: string; icon: IoniconName; color: string; image?: ReturnType<typeof require> }[] = [
  { value: 'pokemon', label: 'Pokémon', icon: 'flash-outline', color: '#FACC15', image: require('../../../assets/pokemon-tcg-logo.png') },
  { value: 'magic', label: 'Magic', icon: 'color-wand-outline', color: '#A78BFA', image: require('../../../assets/magic-tcg-logo.png') },
];

const CARD_WIDTH = (Dimensions.get('window').width - 16 - 24) / 3;
const MTG_SET_TYPES = new Set(['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'starter']);

function getTitle(p: Page): string {
  switch (p.page) {
    case 'game': return 'Agregar a watchlist';
    case 'method': return 'Cómo buscar';
    case 'sets': return 'Elegir set';
    case 'cards-in-set': return p.setName;
    case 'search-name': return 'Buscar por nombre';
  }
}

export default function WatchlistAddScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { palette } = useTheme();
  const { isPremium } = usePremium();
  const dialog = useDialog();
  const styles = useStyles();
  const enabledGames = resolveEnabledGames(profile?.enabled_games);
  const initial: Page = enabledGames.length === 1
    ? { page: 'method', game: enabledGames[0] }
    : { page: 'game' };
  const [stack, setStack] = useState<Page[]>([initial]);
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isPremium) {
      dialog.confirm({
        title: 'Watchlist es Pro',
        message: 'La watchlist está disponible con Trocora Pro.',
        confirmText: 'Pasarme a Pro',
        cancelText: 'Volver',
        onConfirm: () => { router.replace('/paywall'); },
        onCancel: () => { router.back(); },
      });
    }
  }, [isPremium]);

  const current = stack[stack.length - 1];

  function push(p: Page) { setStack(s => [...s, p]); }
  function pop() {
    if (stack.length <= 1) router.back();
    else setStack(s => s.slice(0, -1));
  }

  async function handleAddCard(game: TCGGame, card: CatalogCard) {
    if (!user) return;
    if (added.has(card.id)) return;
    const already = await isInWatchlist(user.id, game, card.id);
    if (already) {
      setAdded(prev => new Set(prev).add(card.id));
      return;
    }
    const res = await addToWatchlist({
      userId: user.id,
      game,
      catalogCardId: card.id,
      cardName: card.name,
      setName: card.set_name,
      imageUrl: card.image_url_large || card.image_url,
    });
    if (res.error) {
      dialog.alert({ title: 'Error', message: res.error });
      return;
    }
    setAdded(prev => new Set(prev).add(card.id));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={pop} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={palette.primary} />
          <Text style={styles.back}>{stack.length <= 1 ? 'Cerrar' : 'Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{getTitle(current)}</Text>
        <View style={{ width: 70 }} />
      </View>

      {current.page === 'game' && (
        <GameStep enabledGames={enabledGames} onSelect={g => push({ page: 'method', game: g })} />
      )}
      {current.page === 'method' && (
        <MethodStep
          game={current.game}
          onSet={() => push({ page: 'sets', game: current.game })}
          onName={() => push({ page: 'search-name', game: current.game })}
        />
      )}
      {current.page === 'sets' && (
        <SetsStep
          game={current.game}
          onSelect={(id, name) => push({ page: 'cards-in-set', game: current.game, setId: id, setName: name })}
        />
      )}
      {current.page === 'cards-in-set' && (
        <CardsInSetStep
          setId={current.setId}
          game={current.game}
          added={added}
          onAdd={card => handleAddCard(current.game, card)}
        />
      )}
      {current.page === 'search-name' && (
        <SearchNameStep
          added={added}
          onAdd={card => handleAddCard('pokemon', card)}
        />
      )}
    </SafeAreaView>
  );
}

function GameStep({ enabledGames, onSelect }: { enabledGames: TCGGame[]; onSelect: (g: TCGGame) => void }) {
  const styles = useStyles();
  const { palette } = useTheme();
  const visible = GAMES.filter(g => enabledGames.includes(g.value));
  return (
    <ScrollView contentContainerStyle={styles.scrollPad}>
      <Text style={styles.hint}>¿De qué juego es la carta?</Text>
      {visible.map(g => (
        <TouchableOpacity key={g.value} style={styles.bigCard} onPress={() => onSelect(g.value)}>
          <View style={[styles.bigCardIcon, { backgroundColor: g.image ? '#fff' : g.color + '1A' }]}>
            {g.image
              ? <Image source={g.image} style={{ width: 36, height: 36 }} contentFit="contain" />
              : <Ionicons name={g.icon} size={30} color={g.color} />}
          </View>
          <Text style={styles.bigCardLabel}>{g.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function MethodStep({ game, onSet, onName }: { game: TCGGame; onSet: () => void; onName: () => void }) {
  const styles = useStyles();
  const hasNameSearch = game === 'pokemon';
  return (
    <ScrollView contentContainerStyle={styles.scrollPad}>
      <Text style={styles.hint}>¿Cómo quieres buscar?</Text>
      <MethodOption icon="albums-outline" label="Por set" desc="Explora las expansiones" onPress={onSet} />
      {hasNameSearch && (
        <MethodOption icon="search-outline" label="Por nombre" desc="Busca por nombre de la carta" onPress={onName} />
      )}
    </ScrollView>
  );
}

function MethodOption({ icon, label, desc, onPress }: { icon: IoniconName; label: string; desc: string; onPress: () => void }) {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <TouchableOpacity style={styles.methodCard} onPress={onPress}>
      <View style={styles.methodIconBox}>
        <Ionicons name={icon} size={24} color={palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.methodLabel}>{label}</Text>
        <Text style={styles.methodDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
    </TouchableOpacity>
  );
}

function SetsStep({ game, onSelect }: { game: TCGGame; onSelect: (id: string, name: string) => void }) {
  return game === 'magic' ? <MagicSetsStep onSelect={onSelect} /> : <PokemonSetsStep onSelect={onSelect} />;
}

function PokemonSetsStep({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [sets, setSets] = useState<PkmSet[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('pokemon_sets')
      .select('id, name, series, total, symbol_url')
      .order('release_date', { ascending: false })
      .then(({ data }) => { setSets((data ?? []) as PkmSet[]); setLoading(false); });
  }, []);

  const filtered = search.trim()
    ? sets.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.series.toLowerCase().includes(search.toLowerCase()))
    : sets;

  if (loading) return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} color={palette.textSecondary} />;
  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={styles.searchBar}
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar set o serie..."
        placeholderTextColor={palette.textMuted}
      />
      <FlatList
        data={filtered}
        keyExtractor={s => s.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.setRow} onPress={() => onSelect(item.id, item.name)}>
            <Image source={{ uri: item.symbol_url }} style={styles.setSymbol} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.setName}>{item.name}</Text>
              <Text style={styles.setMeta}>{item.series} · {item.total} cartas</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

function MagicSetsStep({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [sets, setSets] = useState<MtgSet[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('magic_sets')
      .select('id, name, set_type, card_count, released_at')
      .in('set_type', Array.from(MTG_SET_TYPES))
      .gt('card_count', 0)
      .not('released_at', 'is', null)
      .order('released_at', { ascending: false })
      .then(({ data }) => { setSets((data ?? []) as MtgSet[]); setLoading(false); });
  }, []);

  const filtered = search.trim()
    ? sets.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase()))
    : sets;

  if (loading) return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} color={palette.textSecondary} />;
  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={styles.searchBar}
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar set..."
        placeholderTextColor={palette.textMuted}
      />
      <FlatList
        data={filtered}
        keyExtractor={s => s.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.setRow} onPress={() => onSelect(item.id, item.name)}>
            <View style={styles.mtgSetCode}>
              <Text style={styles.mtgSetCodeText}>{item.id.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.setName}>{item.name}</Text>
              <Text style={styles.setMeta}>{item.card_count} cartas · {item.released_at?.slice(0, 4)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

function CardsInSetStep({
  setId, game, added, onAdd,
}: {
  setId: string;
  game: TCGGame;
  added: Set<string>;
  onAdd: (card: CatalogCard) => void;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (game === 'magic') {
      supabase
        .from('magic_cards')
        .select('id, name, collector_number, set_id, set_name, image_url, image_url_large')
        .eq('set_id', setId)
        .then(({ data }) => {
          const rows: CatalogCard[] = (data ?? []).map(c => ({
            id: c.id,
            name: c.name,
            number: c.collector_number ?? '',
            set_id: c.set_id ?? '',
            set_name: c.set_name,
            image_url: c.image_url ?? '',
            image_url_large: c.image_url_large ?? c.image_url ?? '',
          }));
          setCards(rows);
          setLoading(false);
        });
    } else {
      supabase
        .from('pokemon_cards')
        .select('id, name, number, set_id, set_name, image_url, image_url_large')
        .eq('set_id', setId)
        .then(({ data }) => {
          const rows: CatalogCard[] = (data ?? []).map(c => ({
            id: c.id,
            name: c.name,
            number: c.number,
            set_id: c.set_id,
            set_name: c.set_name,
            image_url: c.image_url ?? '',
            image_url_large: c.image_url_large ?? c.image_url ?? '',
          }));
          setCards(rows);
          setLoading(false);
        });
    }
  }, [setId, game]);

  if (loading) return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} color={palette.textSecondary} />;

  return (
    <FlatList
      data={cards}
      keyExtractor={c => c.id}
      numColumns={3}
      columnWrapperStyle={{ justifyContent: 'flex-start' }}
      renderItem={({ item }) => {
        const on = added.has(item.id);
        return (
          <TouchableOpacity
            style={[styles.thumb, on && styles.thumbAdded]}
            onPress={() => onAdd(item)}
            activeOpacity={0.7}
          >
            <Image source={{ uri: item.image_url }} style={styles.thumbImg} contentFit="contain" />
            <View style={styles.thumbFooter}>
              <Text style={styles.thumbNum}>#{item.number}</Text>
              <Text style={styles.thumbName} numberOfLines={1}>{item.name}</Text>
            </View>
            <View style={[styles.heart, on && styles.heartActive]}>
              <Ionicons name={on ? 'heart' : 'heart-outline'} size={14} color={on ? palette.bg : '#fff'} />
            </View>
          </TouchableOpacity>
        );
      }}
      contentContainerStyle={{ padding: 8, paddingBottom: 30 }}
    />
  );
}

function SearchNameStep({ added, onAdd }: { added: Set<string>; onAdd: (card: CatalogCard) => void }) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = setTimeout(async () => {
      if (!query.trim()) { setCards([]); return; }
      setLoading(true);
      const { data } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, set_id, set_name, image_url, image_url_large')
        .ilike('name', `%${query.trim()}%`)
        .order('name')
        .limit(60);
      setCards((data ?? []) as CatalogCard[]);
      setLoading(false);
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={styles.searchBar}
        value={query}
        onChangeText={setQuery}
        placeholder="Ej: Charizard, Pikachu..."
        placeholderTextColor={palette.textMuted}
        autoFocus
      />
      {loading && <ActivityIndicator style={{ marginTop: 24 }} color={palette.textSecondary} />}
      {!loading && (
        <FlatList
          data={cards}
          keyExtractor={c => c.id}
          numColumns={3}
          columnWrapperStyle={{ justifyContent: 'flex-start' }}
          renderItem={({ item }) => {
            const on = added.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.thumb, on && styles.thumbAdded]}
                onPress={() => onAdd(item)}
                activeOpacity={0.7}
              >
                <Image source={{ uri: item.image_url }} style={styles.thumbImg} contentFit="contain" />
                <View style={styles.thumbFooter}>
                  <Text style={styles.thumbNum}>#{item.number}</Text>
                  <Text style={styles.thumbName} numberOfLines={1}>{item.name}</Text>
                </View>
                <Text style={styles.thumbSet} numberOfLines={1}>{item.set_name}</Text>
                <View style={[styles.heart, on && styles.heartActive]}>
                  <Ionicons name={on ? 'heart' : 'heart-outline'} size={14} color={on ? palette.bg : '#fff'} />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            query.trim() ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Sin resultados para "{query}"</Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={40} color={palette.surfaceAlt} />
                <Text style={styles.emptyText}>Busca una carta para agregarla</Text>
              </View>
            )
          }
          contentContainerStyle={{ padding: 8, paddingBottom: 30 }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 70 },
  back: { color: p.primary, fontSize: 15 },
  title: { flex: 1, color: p.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },

  scrollPad: { padding: 16 },
  hint: { color: p.textSecondary, fontSize: 14, marginBottom: 16 },

  bigCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: p.surface, borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: p.border,
  },
  bigCardIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bigCardLabel: { flex: 1, color: p.textPrimary, fontSize: 16, fontWeight: '700' },

  methodCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: p.surface, borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: p.border,
  },
  methodIconBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: p.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  methodLabel: { color: p.textPrimary, fontSize: 15, fontWeight: '700' },
  methodDesc: { color: p.textMuted, fontSize: 13, marginTop: 2 },

  searchBar: {
    margin: 12, marginBottom: 8,
    backgroundColor: p.surface, borderWidth: 1, borderColor: p.border,
    borderRadius: 12, padding: 12, fontSize: 14, color: p.textPrimary,
  },

  setRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  setSymbol: { width: 36, height: 36 },
  mtgSetCode: {
    width: 44, height: 36, borderRadius: 8,
    backgroundColor: p.primaryMuted, alignItems: 'center', justifyContent: 'center',
  },
  mtgSetCodeText: { color: '#A78BFA', fontSize: 11, fontWeight: '800' },
  setName: { color: p.textPrimary, fontSize: 14, fontWeight: '600' },
  setMeta: { color: p.textMuted, fontSize: 12, marginTop: 1 },

  thumb: {
    width: CARD_WIDTH, margin: 4, alignItems: 'center',
    backgroundColor: p.surface, borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: p.border,
    position: 'relative',
  },
  thumbAdded: { borderColor: p.warning, backgroundColor: 'rgba(250,204,21,0.08)' },
  thumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  thumbFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3 },
  thumbNum: { color: p.textMuted, fontSize: 9, fontWeight: '600' },
  thumbName: { color: p.textPrimary, fontSize: 9, fontWeight: '600', flex: 1 },
  thumbSet: { color: p.textMuted, fontSize: 9, marginTop: 2 },

  heart: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  heartActive: { backgroundColor: p.warning },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { color: p.textMuted, fontSize: 14 },
}));
