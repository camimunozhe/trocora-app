import { useState, useEffect, useRef } from 'react';
import { requestCollectionRefresh } from '@/lib/collectionRefresh';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, FlatList,
  ActivityIndicator, Switch, Dimensions, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDialog } from '@/lib/AppDialog';
import { Image } from 'expo-image';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import type { TCGGame, CardCondition, CardLanguage } from '@/types/database';
import { getUsdToClp } from '@/lib/exchangeRate';
import { formatPrice, currencyLabel } from '@/lib/currency';
import { resolveEnabledGames } from '@/lib/enabledGames';
import { validateFolderGame, gameLabel } from '@/lib/folderValidation';
import { makeStyles } from '@/lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type PkmSet = {
  id: string;
  name: string;
  series: string;
  total: number;
  release_date: string;
  symbol_url: string | null;
  logo_url: string | null;
};

type PkmCard = {
  id: string;
  name: string;
  number: string;
  set_id: string | null;
  set_name: string;
  image_url: string | null;
  image_url_large: string | null;
  supertype?: string | null;
  tcgplayer_normal_market?: number | null;
  tcgplayer_foil_market?: number | null;
};

type MtgSet = {
  id: string;
  name: string;
  set_type: string;
  card_count: number;
  released_at: string;
};

type Page =
  | { page: 'game' }
  | { page: 'method'; game: TCGGame }
  | { page: 'sets'; game: TCGGame }
  | { page: 'cards-in-set'; game: TCGGame; setId: string; setName: string }
  | { page: 'search-name'; game: TCGGame }
  | { page: 'confirm'; game: TCGGame; card: PkmCard };

const GAMES: { value: TCGGame; label: string; icon: IoniconName; color: string; image?: ReturnType<typeof require> }[] = [
  { value: 'pokemon', label: 'Pokémon', icon: 'flash-outline', color: '#FACC15', image: require('../../../assets/pokemon-tcg-logo.png') },
  { value: 'magic', label: 'Magic', icon: 'color-wand-outline', color: '#A78BFA', image: require('../../../assets/magic-tcg-logo.png') },
];

const CONDITIONS: { value: CardCondition; label: string }[] = [
  { value: 'mint', label: 'Nueva' },
  { value: 'near_mint', label: 'Casi Nueva' },
  { value: 'excellent', label: 'Excelente' },
  { value: 'good', label: 'Buena' },
  { value: 'played', label: 'Jugada' },
  { value: 'poor', label: 'Dañada' },
];

const LANGUAGES: { value: CardLanguage; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'es', label: 'ES' },
  { value: 'jp', label: 'JP' },
  { value: 'pt', label: 'PT' },
  { value: 'fr', label: 'FR' },
  { value: 'de', label: 'DE' },
  { value: 'it', label: 'IT' },
  { value: 'ko', label: 'KO' },
  { value: 'other', label: 'Otro' },
];

const CARD_WIDTH = (Dimensions.get('window').width - 16 - 24) / 3;

const MTG_SET_TYPES = new Set(['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'starter']);

function getTitle(p: Page): string {
  switch (p.page) {
    case 'game': return 'Agregar carta';
    case 'method': return 'Cómo buscar';
    case 'sets': return 'Elegir set';
    case 'cards-in-set': return p.setName;
    case 'search-name': return 'Buscar por nombre';
    case 'confirm': return p.card.name;
  }
}

type CardInsertRow = {
  user_id: string;
  card_name: string;
  game: TCGGame;
  set_name: string | null;
  card_number: string | null;
  quantity: number;
  condition: CardCondition;
  language?: CardLanguage;
  is_foil: boolean;
  is_published: boolean;
  price_reference: number | null;
  price_reference_currency: import('@/types/database').Currency;
  image_url: string | null;
  pokemon_card_id: string | null;
  magic_card_id: string | null;
  folder_id: string | null;
};

async function upsertCollectionCards(rows: CardInsertRow[]): Promise<{ error: any }> {
  type CatalogKey = 'pokemon_card_id' | 'magic_card_id';

  async function dedupeByCatalog(catalogKey: CatalogKey, batch: CardInsertRow[]) {
    if (batch.length === 0) return { toInsert: [] as CardInsertRow[], error: null as any };
    const ids = batch.map(r => r[catalogKey]!);
    const { data: existing, error: selError } = await supabase
      .from('cards_collection')
      .select(`id, ${catalogKey}, condition, is_foil, language, folder_id, quantity`)
      .eq('user_id', batch[0].user_id)
      .in(catalogKey, ids);
    if (selError) return { toInsert: [], error: selError };

    const rowKey = (r: { [k: string]: any }) =>
      `${r[catalogKey]}|${r.condition}|${r.is_foil}|${r.language ?? ''}|${r.folder_id ?? ''}`;
    const existingMap = new Map((existing ?? []).map((e: any) => [rowKey(e), e]));
    const toInsert: CardInsertRow[] = [];
    for (const row of batch) {
      const key = rowKey(row);
      const match = existingMap.get(key) as { id: string; quantity: number } | undefined;
      if (match) {
        const { error } = await supabase
          .from('cards_collection')
          .update({ quantity: match.quantity + row.quantity })
          .eq('id', match.id);
        if (error) return { toInsert: [], error };
      } else {
        toInsert.push(row);
      }
    }
    return { toInsert, error: null };
  }

  const pokemonRows = rows.filter(r => r.pokemon_card_id);
  const magicRows   = rows.filter(r => r.magic_card_id);
  const otherRows   = rows.filter(r => !r.pokemon_card_id && !r.magic_card_id);

  const pkmRes = await dedupeByCatalog('pokemon_card_id', pokemonRows);
  if (pkmRes.error) return { error: pkmRes.error };
  const mtgRes = await dedupeByCatalog('magic_card_id', magicRows);
  if (mtgRes.error) return { error: mtgRes.error };

  const toInsert = [...pkmRes.toInsert, ...mtgRes.toInsert, ...otherRows];
  if (toInsert.length > 0) {
    const { error } = await supabase.from('cards_collection').insert(toInsert);
    if (error) return { error };
  }
  return { error: null };
}

type SaveCtx = { total: number; saving: boolean; save: () => void };

export default function AddCardScreen() {
  const { user, profile } = useAuth();
  const { palette } = useTheme();
  const dialog = useDialog();
  const currency = profile?.currency ?? 'usd';
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ folderId?: string; game?: TCGGame }>();
  const styles = useStyles();
  const lockedFolderId = typeof params.folderId === 'string' ? params.folderId : null;
  const initialGame = typeof params.game === 'string' ? (params.game as TCGGame) : null;
  const enabledGames = resolveEnabledGames(profile?.enabled_games);
  const initialPage: Page = initialGame
    ? { page: 'method', game: initialGame }
    : enabledGames.length === 1
    ? { page: 'method', game: enabledGames[0] }
    : { page: 'game' };
  const [stack, setStack] = useState<Page[]>([initialPage]);
  const [saved, setSaved] = useState(false);
  const [saveCtx, setSaveCtx] = useState<SaveCtx | null>(null);
  const [usdToClp, setUsdToClp] = useState(950);

  useEffect(() => {
    if (currency !== 'clp') return;
    let mounted = true;
    getUsdToClp().then(r => { if (mounted) setUsdToClp(r); });
    return () => { mounted = false; };
  }, [currency]);

  type ResolveFolderResult = { folderId: string | null } | { error: string };
  async function resolveFolderId(game: TCGGame): Promise<ResolveFolderResult> {
    if (lockedFolderId) {
      const check = await validateFolderGame(lockedFolderId, [game]);
      if (!check.ok) {
        return { error: `Esta carpeta solo permite cartas de ${gameLabel(check.folderGame)}.` };
      }
      return { folderId: lockedFolderId };
    }
    return { folderId: null };
  }

  const current = stack[stack.length - 1];
  const inWizard = stack.length > 1;

  useEffect(() => {
    (navigation as any).setOptions({ gestureEnabled: !inWizard });
  }, [navigation, inWizard]);

  usePreventRemove(inWizard && !saved, () => {
    attemptPop();
  });

  useEffect(() => {
    if (saved) router.back();
  }, [saved]);

  function push(page: Page) {
    setStack(s => [...s, page]);
  }

  function popUnchecked() {
    if (stack.length <= 1) { router.back(); return; }
    setStack(s => s.slice(0, -1));
  }

  function attemptPop() {
    const pending = saveCtx?.total ?? 0;
    if (pending > 0) {
      dialog.confirm({
        title: 'Cartas sin guardar',
        message: `Tienes ${pending} ${pending === 1 ? 'carta seleccionada' : 'cartas seleccionadas'} sin guardar. Si sales se perderán.`,
        confirmText: 'Salir sin guardar',
        cancelText: 'Seguir editando',
        destructive: true,
        onConfirm: () => popUnchecked(),
      });
      return;
    }
    popUnchecked();
  }

  function pop() {
    attemptPop();
  }

  function onSave() {
    requestCollectionRefresh();
    setSaved(true);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={pop} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={palette.primary} />
          <Text style={styles.back}>{stack.length <= 1 ? 'Cancelar' : 'Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{getTitle(current)}</Text>
        {saveCtx ? (
          <TouchableOpacity
            style={[styles.headerSaveBtn, (saveCtx.total === 0 || saveCtx.saving) && styles.headerSaveBtnDisabled]}
            onPress={saveCtx.save}
            disabled={saveCtx.total === 0 || saveCtx.saving}
          >
            {saveCtx.saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.headerSaveBtnText} numberOfLines={1}>
                  {saveCtx.total === 0 ? 'Guardar' : `Guardar ${saveCtx.total}`}
                </Text>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ minWidth: 90 }} />
        )}
      </View>

      {current.page === 'game' && (
        <GameStep enabledGames={enabledGames} onSelect={(g) => push({ page: 'method', game: g })} />
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
          onSelect={(id, name) =>
            push({ page: 'cards-in-set', game: current.game, setId: id, setName: name })
          }
        />
      )}
      {current.page === 'cards-in-set' && (
        <CardsInSetStep
          setId={current.setId}
          game={current.game}
          userId={user!.id}
          onSave={onSave}
          onCtxChange={setSaveCtx}
          resolveFolderId={resolveFolderId}
          currency={currency}
          usdToClp={usdToClp}
        />
      )}
      {current.page === 'search-name' && (
        <SearchNameStep
          game={current.game}
          userId={user!.id}
          onSave={onSave}
          onCtxChange={setSaveCtx}
          resolveFolderId={resolveFolderId}
          currency={currency}
          usdToClp={usdToClp}
        />
      )}
      {current.page === 'confirm' && (
        <ConfirmStep game={current.game} card={current.card} userId={user!.id} onSave={onSave} resolveFolderId={resolveFolderId} currency={currency} usdToClp={usdToClp} />
      )}
    </SafeAreaView>
  );
}

function GameStep({ onSelect, enabledGames }: { onSelect: (g: TCGGame) => void; enabledGames: TCGGame[] }) {
  const styles = useStyles();
  const { palette } = useTheme();
  const visible = GAMES.filter(g => enabledGames.includes(g.value));
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollPad}>
      <Text style={styles.hint}>¿Qué juego quieres agregar?</Text>
      {visible.map((g) => (
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

function MethodStep({
  game, onSet, onName,
}: {
  game: TCGGame;
  onSet: () => void;
  onName: () => void;
}) {
  const styles = useStyles();
  const hasNameSearch = game === 'pokemon';
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollPad}>
      <Text style={styles.hint}>¿Cómo quieres buscar la carta?</Text>
      <MethodOption icon="albums-outline" label="Por Set" desc="Explora las expansiones y elige una carta del set" onPress={onSet} />
      {hasNameSearch && (
        <MethodOption icon="search-outline" label="Por nombre" desc="Busca directamente por nombre de la carta" onPress={onName} />
      )}
    </ScrollView>
  );
}

function MethodOption({ icon, label, desc, onPress, muted }: {
  icon: IoniconName; label: string; desc: string; onPress: () => void; muted?: boolean;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <TouchableOpacity style={[styles.methodCard, muted && styles.methodCardMuted]} onPress={onPress}>
      <View style={[styles.methodIconBox, muted && styles.methodIconBoxMuted]}>
        <Ionicons name={icon} size={24} color={muted ? palette.textMuted : palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.methodLabel, muted && styles.methodLabelMuted]}>{label}</Text>
        <Text style={styles.methodDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
    </TouchableOpacity>
  );
}

function SetsStep({ game, onSelect }: { game: TCGGame; onSelect: (id: string, name: string) => void }) {
  if (game === 'magic') return <MagicSetsStep onSelect={onSelect} />;
  return <PokemonSetsStep onSelect={onSelect} />;
}

function PokemonSetsStep({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const dialog = useDialog();
  const styles = useStyles();
  const { palette } = useTheme();
  const [sets, setSets] = useState<PkmSet[]>([]);
  const [filtered, setFiltered] = useState<PkmSet[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('pokemon_sets')
      .select('id, name, series, total, release_date, symbol_url, logo_url')
      .order('release_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) dialog.alert({ title: 'Error', message: 'No se pudo cargar los sets' });
        setSets(data ?? []);
        setFiltered(data ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!search.trim()) { setFiltered(sets); return; }
    const q = search.toLowerCase();
    setFiltered(sets.filter(s => s.name.toLowerCase().includes(q) || s.series.toLowerCase().includes(q)));
  }, [search, sets]);

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
            <Image source={{ uri: item.symbol_url ?? undefined }} style={styles.setSymbol} contentFit="contain" />
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

const MTG_TYPE_LABEL: Record<string, string> = {
  core: 'Core', expansion: 'Expansión', masters: 'Masters',
  draft_innovation: 'Draft', commander: 'Commander', starter: 'Starter',
};

function MagicSetsStep({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const dialog = useDialog();
  const styles = useStyles();
  const { palette } = useTheme();
  const [sets, setSets] = useState<MtgSet[]>([]);
  const [filtered, setFiltered] = useState<MtgSet[]>([]);
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
      .then(({ data, error }) => {
        if (error) dialog.alert({ title: 'Error', message: 'No se pudo cargar los sets de Magic' });
        setSets((data ?? []) as MtgSet[]);
        setFiltered((data ?? []) as MtgSet[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!search.trim()) { setFiltered(sets); return; }
    const q = search.toLowerCase();
    setFiltered(sets.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)));
  }, [search, sets]);

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
              <Text style={styles.setMeta}>
                {MTG_TYPE_LABEL[item.set_type] ?? item.set_type} · {item.card_count} cartas · {item.released_at?.slice(0, 4)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

type Selection = { card: PkmCard; qty: number };

function CardsInSetStep({ setId, game, userId, onSave, onCtxChange, resolveFolderId, currency, usdToClp }: {
  setId: string;
  game: TCGGame;
  userId: string;
  onSave: () => void;
  onCtxChange: (ctx: SaveCtx | null) => void;
  resolveFolderId: (game: TCGGame) => Promise<{ folderId: string | null } | { error: string }>;
  currency: import('@/types/database').Currency;
  usdToClp: number;
}) {
  const dialog = useDialog();
  const styles = useStyles();
  const { palette } = useTheme();
  const [cards, setCards] = useState<PkmCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Map<string, Selection>>(new Map());
  const [condition, setCondition] = useState<CardCondition>('mint');
  const [language, setLanguage] = useState<CardLanguage>('en');
  const [saving, setSaving] = useState(false);
  const [previewCard, setPreviewCard] = useState<PkmCard | null>(null);
  const saveRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (game === 'magic') {
      supabase
        .from('magic_cards')
        .select('id, name, collector_number, set_id, set_name, image_url, image_url_large, tcgplayer_normal_market, tcgplayer_foil_market')
        .eq('set_id', setId)
        .then(({ data, error }) => {
          if (error) dialog.alert({ title: 'Error', message: 'No se pudo cargar las cartas' });
          const sorted = (data ?? []).sort((a, b) => {
            const na = parseInt(a.collector_number ?? '', 10);
            const nb = parseInt(b.collector_number ?? '', 10);
            if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
            return (a.collector_number ?? '').localeCompare(b.collector_number ?? '');
          });
          setCards(sorted.map(c => ({
            id: c.id,
            name: c.name,
            number: c.collector_number ?? '',
            set_id: c.set_id,
            set_name: c.set_name,
            image_url: c.image_url ?? '',
            image_url_large: c.image_url_large ?? c.image_url ?? '',
            tcgplayer_normal_market: c.tcgplayer_normal_market,
            tcgplayer_foil_market: c.tcgplayer_foil_market,
          })));
          setLoading(false);
        });
    } else {
      supabase
        .from('pokemon_cards')
        .select('id, name, number, set_id, set_name, image_url, image_url_large, supertype, tcgplayer_normal_market, tcgplayer_foil_market')
        .eq('set_id', setId)
        .then(({ data, error }) => {
          if (error) dialog.alert({ title: 'Error', message: 'No se pudo cargar las cartas' });
          const sorted = (data ?? []).sort((a, b) => {
            const na = parseInt(a.number, 10);
            const nb = parseInt(b.number, 10);
            if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
            return a.number.localeCompare(b.number);
          });
          setCards(sorted);
          setLoading(false);
        });
    }
  }, [setId, game]);

  function tapCard(card: PkmCard) {
    setSelected(prev => {
      const next = new Map(prev);
      const existing = next.get(card.id);
      next.set(card.id, { card, qty: (existing?.qty ?? 0) + 1 });
      return next;
    });
  }

  function removeCard(cardId: string) {
    setSelected(prev => {
      const next = new Map(prev);
      next.delete(cardId);
      return next;
    });
  }

  const totalCards = Array.from(selected.values()).reduce((sum, s) => sum + s.qty, 0);

  saveRef.current = async () => {
    if (selected.size === 0) return;
    const res = await resolveFolderId(game);
    if ('error' in res) { dialog.alert({ title: 'Carpeta inválida', message: res.error }); return; }
    const folderId = res.folderId;
    setSaving(true);
    const rows = Array.from(selected.values()).map(({ card, qty }) => ({
      user_id: userId,
      card_name: card.name,
      game,
      set_name: card.set_name,
      card_number: card.number,
      quantity: qty,
      condition,
      language,
      is_foil: false,
      is_published: false,
      price_reference: null,
      price_reference_currency: currency,
      image_url: card.image_url_large ?? card.image_url ?? null,
      pokemon_card_id: game === 'pokemon' ? card.id : null,
      magic_card_id: game === 'magic' ? card.id : null,
      folder_id: folderId,
    }));
    const { error } = await upsertCollectionCards(rows);
    setSaving(false);
    if (error) dialog.alert({ title: 'Error', message: error.message });
    else onSave();
  };

  useEffect(() => {
    onCtxChange({ total: totalCards, saving, save: () => saveRef.current() });
  }, [totalCards, saving]);

  useEffect(() => {
    return () => onCtxChange(null);
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} color={palette.textSecondary} />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={cards}
        keyExtractor={c => c.id}
        numColumns={3}
        columnWrapperStyle={{ justifyContent: 'flex-start' }}
        renderItem={({ item }) => {
          const sel = selected.get(item.id);
          const qty = sel?.qty ?? 0;
          return (
            <TouchableOpacity
              style={[styles.thumb, qty > 0 && styles.thumbSelected]}
              onPress={() => setPreviewCard(item)}
              activeOpacity={0.7}
            >
              <Image source={{ uri: item.image_url ?? undefined }} style={styles.thumbImg} contentFit="contain" />
              <View style={styles.thumbFooter}>
                <Text style={styles.thumbNum}>#{item.number}</Text>
                <Text style={styles.thumbName} numberOfLines={1}>{item.name}</Text>
                {(() => { const p = item.tcgplayer_normal_market ?? item.tcgplayer_foil_market; return p ? <Text style={styles.thumbPrice}>{formatPrice(p, currency, usdToClp)}</Text> : null; })()}
              </View>
              <View style={styles.zoomHint} pointerEvents="none">
                <Ionicons name="expand-outline" size={12} color={palette.textPrimary} />
              </View>
              {qty > 0 ? (
                <TouchableOpacity style={styles.qtyBadge} onPress={() => removeCard(item.id)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                  <Text style={styles.qtyText}>{qty}</Text>
                  <Ionicons name="close-circle" size={11} color="rgba(255,255,255,0.8)" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.addBadge} onPress={() => tapCard(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="add" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ padding: 8, paddingBottom: 8 }}
      />

      <CardPreviewModal card={previewCard} onClose={() => setPreviewCard(null)} onAdd={(c) => { tapCard(c); setPreviewCard(null); }} qty={previewCard ? selected.get(previewCard.id)?.qty ?? 0 : 0} currency={currency} usdToClp={usdToClp} />

      <View style={styles.setBottomPanel}>
        <View style={styles.setBottomRow}>
          <Text style={styles.setBottomLabel}>Condición</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {CONDITIONS.map(c => (
              <TouchableOpacity
                key={c.value}
                style={[styles.miniChip, condition === c.value && styles.miniChipActive]}
                onPress={() => setCondition(c.value)}
              >
                <Text style={[styles.miniChipText, condition === c.value && styles.miniChipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={styles.setBottomRow}>
          <Text style={styles.setBottomLabel}>Idioma</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {LANGUAGES.map(l => (
              <TouchableOpacity
                key={l.value}
                style={[styles.miniChip, language === l.value && styles.miniChipActive]}
                onPress={() => setLanguage(l.value)}
              >
                <Text style={[styles.miniChipText, language === l.value && styles.miniChipTextActive]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

function SearchNameStep({ game, userId, onSave, onCtxChange, resolveFolderId, currency, usdToClp }: {
  game: TCGGame;
  userId: string;
  onSave: () => void;
  onCtxChange: (ctx: SaveCtx | null) => void;
  resolveFolderId: (game: TCGGame) => Promise<{ folderId: string | null } | { error: string }>;
  currency: import('@/types/database').Currency;
  usdToClp: number;
}) {
  const dialog = useDialog();
  const styles = useStyles();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<PkmCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, Selection>>(new Map());
  const [condition, setCondition] = useState<CardCondition>('mint');
  const [language, setLanguage] = useState<CardLanguage>('en');
  const [saving, setSaving] = useState(false);
  const [previewCard, setPreviewCard] = useState<PkmCard | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) { setCards([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, set_id, set_name, image_url, image_url_large, supertype, tcgplayer_normal_market, tcgplayer_foil_market')
        .ilike('name', `%${query.trim()}%`)
        .order('name')
        .limit(60);
      if (error) dialog.alert({ title: 'Error', message: 'No se pudo realizar la búsqueda' });
      setCards(data ?? []);
      setLoading(false);
    }, 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  function tapCard(card: PkmCard) {
    setSelected(prev => {
      const next = new Map(prev);
      const existing = next.get(card.id);
      next.set(card.id, { card, qty: (existing?.qty ?? 0) + 1 });
      return next;
    });
  }

  function removeCard(cardId: string) {
    setSelected(prev => {
      const next = new Map(prev);
      next.delete(cardId);
      return next;
    });
  }

  const totalCards = Array.from(selected.values()).reduce((sum, s) => sum + s.qty, 0);

  saveRef.current = async () => {
    if (selected.size === 0) return;
    const res = await resolveFolderId(game);
    if ('error' in res) { dialog.alert({ title: 'Carpeta inválida', message: res.error }); return; }
    const folderId = res.folderId;
    setSaving(true);
    const rows = Array.from(selected.values()).map(({ card, qty }) => ({
      user_id: userId,
      card_name: card.name,
      game,
      set_name: card.set_name,
      card_number: card.number,
      quantity: qty,
      condition,
      language,
      is_foil: false,
      is_published: false,
      price_reference: null,
      price_reference_currency: currency,
      image_url: card.image_url_large ?? card.image_url ?? null,
      pokemon_card_id: game === 'pokemon' ? card.id : null,
      magic_card_id: game === 'magic' ? card.id : null,
      folder_id: folderId,
    }));
    const { error } = await upsertCollectionCards(rows);
    setSaving(false);
    if (error) dialog.alert({ title: 'Error', message: error.message });
    else onSave();
  };

  useEffect(() => {
    onCtxChange({ total: totalCards, saving, save: () => saveRef.current() });
  }, [totalCards, saving]);

  useEffect(() => {
    return () => onCtxChange(null);
  }, []);

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
            const sel = selected.get(item.id);
            const qty = sel?.qty ?? 0;
            return (
              <TouchableOpacity
                style={[styles.thumb, qty > 0 && styles.thumbSelected]}
                onPress={() => setPreviewCard(item)}
                activeOpacity={0.7}
              >
                <Image source={{ uri: item.image_url ?? undefined }} style={styles.thumbImg} contentFit="contain" />
                <View style={styles.thumbFooter}>
                  <Text style={styles.thumbNum}>#{item.number}</Text>
                  <Text style={styles.thumbName} numberOfLines={1}>{item.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text style={[styles.thumbNum, { flex: 1 }]} numberOfLines={1}>{item.set_name}</Text>
                  {(() => { const p = item.tcgplayer_normal_market ?? item.tcgplayer_foil_market; return p ? <Text style={styles.thumbPrice}>{formatPrice(p, currency, usdToClp)}</Text> : null; })()}
                </View>
                <View style={styles.zoomHint} pointerEvents="none">
                  <Ionicons name="expand-outline" size={12} color={palette.textPrimary} />
                </View>
                {qty > 0 ? (
                  <TouchableOpacity style={styles.qtyBadge} onPress={() => removeCard(item.id)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                    <Text style={styles.qtyText}>{qty}</Text>
                    <Ionicons name="close-circle" size={11} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.addBadge} onPress={() => tapCard(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="add" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            query.trim() ? (
              <View style={styles.emptySearch}>
                <Text style={styles.emptySearchText}>Sin resultados para "{query}"</Text>
              </View>
            ) : (
              <View style={styles.emptySearch}>
                <Ionicons name="search-outline" size={40} color={palette.surfaceAlt} />
                <Text style={styles.emptySearchText}>Escribe el nombre del Pokémon</Text>
              </View>
            )
          }
          contentContainerStyle={{ padding: 8, paddingBottom: 8 }}
        />
      )}

      <View style={styles.setBottomPanel}>
        <View style={styles.setBottomRow}>
          <Text style={styles.setBottomLabel}>Condición</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {CONDITIONS.map(c => (
              <TouchableOpacity
                key={c.value}
                style={[styles.miniChip, condition === c.value && styles.miniChipActive]}
                onPress={() => setCondition(c.value)}
              >
                <Text style={[styles.miniChipText, condition === c.value && styles.miniChipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={styles.setBottomRow}>
          <Text style={styles.setBottomLabel}>Idioma</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {LANGUAGES.map(l => (
              <TouchableOpacity
                key={l.value}
                style={[styles.miniChip, language === l.value && styles.miniChipActive]}
                onPress={() => setLanguage(l.value)}
              >
                <Text style={[styles.miniChipText, language === l.value && styles.miniChipTextActive]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <CardPreviewModal card={previewCard} onClose={() => setPreviewCard(null)} onAdd={(c) => { tapCard(c); setPreviewCard(null); }} qty={previewCard ? selected.get(previewCard.id)?.qty ?? 0 : 0} currency={currency} usdToClp={usdToClp} />
    </View>
  );
}

function CardPreviewModal({ card, onClose, onAdd, qty, currency, usdToClp }: {
  card: PkmCard | null;
  onClose: () => void;
  onAdd: (c: PkmCard) => void;
  qty: number;
  currency: import('@/types/database').Currency;
  usdToClp: number;
}) {
  const styles = useStyles();
  if (!card) return null;
  const price = card.tcgplayer_normal_market ?? card.tcgplayer_foil_market;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.previewBackdrop} onPress={onClose}>
        <Pressable style={styles.previewCardBox} onPress={() => {}}>
          <Image
            source={{ uri: (card.image_url_large || card.image_url) ?? undefined }}
            style={styles.previewImageLarge}
            contentFit="contain"
          />
          <Text style={styles.previewLabelName} numberOfLines={2}>{card.name}</Text>
          <Text style={styles.previewLabelMeta}>{card.set_name} · #{card.number}</Text>
          {price ? <Text style={styles.previewLabelPrice}>{formatPrice(price, currency, usdToClp)}</Text> : null}
          <TouchableOpacity style={styles.previewAddBtn} onPress={() => onAdd(card)} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.previewAddBtnText}>{qty > 0 ? `Agregar otra (${qty})` : 'Agregar a la selección'}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ConfirmStep({ game, card, userId, onSave, resolveFolderId, currency, usdToClp }: {
  game: TCGGame; card: PkmCard; userId: string; onSave: () => void;
  resolveFolderId: (game: TCGGame) => Promise<{ folderId: string | null } | { error: string }>;
  currency: import('@/types/database').Currency;
  usdToClp: number;
}) {
  const dialog = useDialog();
  const styles = useStyles();
  const { palette } = useTheme();
  const [condition, setCondition] = useState<CardCondition>('mint');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [isFoil, setIsFoil] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const res = await resolveFolderId(game);
    if ('error' in res) { dialog.alert({ title: 'Carpeta inválida', message: res.error }); return; }
    const folderId = res.folderId;
    setSaving(true);
    const { error } = await upsertCollectionCards([{
      user_id: userId,
      card_name: card.name,
      game,
      set_name: card.set_name,
      card_number: card.number,
      quantity: parseInt(quantity) || 1,
      condition,
      is_foil: isFoil,
      is_published: isAvailable,
      price_reference: price ? parseFloat(price) : null,
      price_reference_currency: currency,
      image_url: card.image_url_large ?? card.image_url ?? null,
      pokemon_card_id: game === 'pokemon' ? card.id : null,
      magic_card_id: game === 'magic' ? card.id : null,
      folder_id: folderId,
    }]);
    setSaving(false);
    if (error) dialog.alert({ title: 'Error', message: error.message });
    else onSave();
  }

  return (
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.cardPreview}>
        <Image source={{ uri: (card.image_url_large ?? card.image_url) ?? undefined }} style={styles.cardPreviewImg} contentFit="contain" />
        <Text style={styles.previewName}>{card.name}</Text>
        <Text style={styles.previewMeta}>{card.set_name} · #{card.number}</Text>
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Condición</Text>
        <View style={styles.chips}>
          {CONDITIONS.map((c) => (
            <TouchableOpacity key={c.value} style={[styles.chip, condition === c.value && styles.chipActive]} onPress={() => setCondition(c.value)}>
              <Text style={[styles.chipText, condition === c.value && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.rowInputs}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Cantidad</Text>
          <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" placeholder="1" placeholderTextColor={palette.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Precio ref. ({currencyLabel(currency)})</Text>
          <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType={currency === 'clp' ? 'number-pad' : 'decimal-pad'} placeholder={currency === 'clp' ? '0' : '0.00'} placeholderTextColor={palette.textMuted} />
        </View>
      </View>

      <View style={styles.switches}>
        <SwitchRow icon="star-outline" label="Foil / Holo" value={isFoil} onChange={setIsFoil} />
        <SwitchRow icon="pricetag-outline" label="Publicar para intercambio o venta" value={isAvailable} onChange={setIsAvailable} last />
      </View>

      <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Guardar en colección</Text>}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function SwitchRow({ icon, label, value, onChange, last }: {
  icon: IoniconName; label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <View style={[styles.switchRow, last && styles.switchRowLast]}>
      <View style={styles.switchLabelRow}>
        <Ionicons name={icon} size={16} color={palette.textSecondary} />
        <Text style={styles.switchLabel}>{label}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: palette.primary }} />
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
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 90 },
  back: { color: p.primary, fontSize: 15 },
  title: { flex: 1, color: p.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  headerSaveBtn: {
    backgroundColor: p.primary, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, minWidth: 90, maxWidth: 140,
    alignItems: 'center', justifyContent: 'center',
  },
  headerSaveBtnDisabled: { opacity: 0.4 },
  headerSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  scroll: { flex: 1 },
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
  methodCardMuted: { backgroundColor: p.bg, borderColor: p.surface },
  methodIconBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: p.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  methodIconBoxMuted: { backgroundColor: p.surface },
  methodLabel: { color: p.textPrimary, fontSize: 15, fontWeight: '700' },
  methodLabelMuted: { color: p.textMuted },
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
  },
  thumbSelected: {
    borderColor: p.primary, borderWidth: 2, backgroundColor: p.primaryMuted,
  },
  thumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  thumbFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3 },
  thumbNum: { color: p.textMuted, fontSize: 9, fontWeight: '600', flexShrink: 0 },
  thumbName: { color: p.textPrimary, fontSize: 9, fontWeight: '600', flex: 1 },
  thumbPrice: { color: p.successAlt, fontSize: 9, fontWeight: '600', flexShrink: 0 },
  qtyBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: p.primary, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  qtyText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: p.primary,
    borderRadius: 14, width: 26, height: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  zoomHint: {
    position: 'absolute', top: 4, left: 4,
    backgroundColor: 'rgba(15,23,42,0.7)',
    borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },

  previewBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  previewCardBox: {
    backgroundColor: p.surface, borderRadius: 16,
    borderWidth: 1, borderColor: p.border,
    padding: 16, gap: 8, alignItems: 'center',
    maxWidth: 360, width: '100%',
  },
  previewImageLarge: {
    width: 240, aspectRatio: 0.715, borderRadius: 10,
  },
  previewLabelName: {
    color: p.textPrimary, fontSize: 18, fontWeight: '800',
    textAlign: 'center', marginTop: 8,
  },
  previewLabelMeta: { color: p.textMuted, fontSize: 13 },
  previewLabelPrice: { color: p.successAlt, fontSize: 14, fontWeight: '700' },
  previewAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: p.primary, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 20,
    marginTop: 8, alignSelf: 'stretch',
  },
  previewAddBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  setBottomPanel: {
    borderTopWidth: 1, borderTopColor: p.border,
    backgroundColor: p.bg, padding: 12, gap: 10,
  },
  setBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setBottomLabel: { color: p.textMuted, fontSize: 11, fontWeight: '600', width: 62 },
  miniChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: p.border,
    backgroundColor: p.surface,
  },
  miniChipActive: { backgroundColor: p.primary, borderColor: p.primary },
  miniChipText: { color: p.textMuted, fontSize: 12 },
  miniChipTextActive: { color: '#fff', fontWeight: '600' },

  emptySearch: { flex: 1, alignItems: 'center', paddingTop: 60, gap: 10 },
  emptySearchText: { color: p.textMuted, fontSize: 14 },

  cardPreview: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 32 },
  cardPreviewImg: { width: 200, height: 280, borderRadius: 12 },
  previewName: { color: p.textPrimary, fontSize: 20, fontWeight: '800', marginTop: 16, textAlign: 'center' },
  previewMeta: { color: p.textMuted, fontSize: 13, marginTop: 4 },

  fieldBlock: { paddingHorizontal: 16, marginBottom: 16 },
  fieldLabel: { color: p.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface },
  chipActive: { backgroundColor: p.primary, borderColor: p.primary },
  chipText: { color: p.textMuted, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  rowInputs: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 16 },
  input: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 10, padding: 12, fontSize: 14, color: p.textPrimary },
  switches: { marginHorizontal: 16, backgroundColor: p.surface, borderRadius: 12, borderWidth: 1, borderColor: p.border, marginBottom: 20 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: p.border },
  switchRowLast: { borderBottomWidth: 0 },
  switchLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { color: p.textPrimary, fontSize: 14 },
  saveBtn: { marginHorizontal: 16, backgroundColor: p.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
}));
