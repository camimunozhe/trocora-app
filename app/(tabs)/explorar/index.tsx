import { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator,
  Dimensions, ScrollView, Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { usePremium } from '@/lib/usePremium';
import { useDialog } from '@/lib/AppDialog';
import type { CardCollection, TCGGame, CardCondition } from '@/types/database';
import { ProBadge } from '@/lib/ProBadge';
import { PhotoLightbox } from '@/lib/PhotoLightbox';
import { addToWatchlist, removeFromWatchlist, isInWatchlist } from '@/lib/watchlist';
import { fetchBlockedIds } from '@/lib/moderation';
import { resolveEnabledGames } from '@/lib/enabledGames';
import { REGION_LABEL } from '@/lib/regions';
import { formatCurrencyValue } from '@/lib/currency';
import { PriceTagPill } from '@/lib/CardPriceTag';
import { makeStyles } from '@/lib/theme';
import { useTabBarClearance } from '@/lib/useTabBarClearance';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const CARD_WIDTH = (Dimensions.get('window').width - 16 - 24) / 3;

const GAME_LABELS: Record<TCGGame, string> = {
  pokemon: 'Pokémon',
  magic: 'Magic',
  yugioh: 'Yu-Gi-Oh!',
  onepiece: 'One Piece',
  digimon: 'Digimon',
  lorcana: 'Lorcana',
  other: 'Otro',
};

const GAME_ICON: Record<TCGGame, { name: IoniconName; color: string }> = {
  pokemon: { name: 'flash-outline', color: '#FACC15' },
  magic: { name: 'color-wand-outline', color: '#A78BFA' },
  yugioh: { name: 'triangle-outline', color: '#60A5FA' },
  onepiece: { name: 'compass-outline', color: '#F87171' },
  digimon: { name: 'hardware-chip-outline', color: '#34D399' },
  lorcana: { name: 'flame-outline', color: '#FB923C' },
  other: { name: 'albums-outline', color: '#94A3B8' },
};

const GAME_LOGO: Partial<Record<TCGGame, ReturnType<typeof require>>> = {
  pokemon: require('../../../assets/pokemon-tcg-logo.png'),
  magic: require('../../../assets/magic-tcg-logo.png'),
};

const CONDITION_LABELS: Record<string, string> = {
  mint: 'Nueva',
  near_mint: 'Casi nueva',
  excellent: 'Excelente',
  good: 'Buena',
  played: 'Jugada',
  poor: 'Dañada',
};

type ExploreCard = CardCollection & {
  profiles: { username: string; avatar_url: string | null; regions: string[] | null; created_at: string | null; premium_status: string | null } | null;
};

function memberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const month = d.toLocaleDateString('es', { month: 'short' }).replace('.', '');
  return `Miembro desde ${month} ${d.getFullYear()}`;
}

type CardGroup = {
  key: string;
  game: TCGGame;
  card_name: string;
  card_number: string | null;
  set_name: string | null;
  image_url: string | null;
  is_foil: boolean;
  listings: ExploreCard[];
  regionSet: Set<string>;
};

function groupKey(c: ExploreCard): string {
  if ((c as any).pokemon_card_id) return `pkm:${(c as any).pokemon_card_id}`;
  if ((c as any).magic_card_id) return `mtg:${(c as any).magic_card_id}`;
  return `${c.game}|${c.set_name ?? ''}|${c.card_number ?? ''}|${c.card_name}|${c.is_foil ? 'foil' : 'reg'}`;
}

type AdvancedFilters = {
  conditions: Set<CardCondition>;
  foilOnly: boolean;
  setName: string;
};

const EMPTY_FILTERS: AdvancedFilters = {
  conditions: new Set(),
  foilOnly: false,
  setName: '',
};

function activeFilterCount(f: AdvancedFilters): number {
  let n = 0;
  if (f.conditions.size > 0) n += 1;
  if (f.foilOnly) n += 1;
  if (f.setName.trim()) n += 1;
  return n;
}

export default function ExploreScreen() {
  const { user, profile } = useAuth();
  const { palette } = useTheme();
  const router = useRouter();
  const dialog = useDialog();
  const { isPremium } = usePremium();
  const styles = useStyles();
  const tabBarClearance = useTabBarClearance();
  const [allCards, setAllCards] = useState<ExploreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGame, setFilterGame] = useState<TCGGame | 'all'>('all');
  const [onlyMyRegions, setOnlyMyRegions] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CardGroup | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<AdvancedFilters>(EMPTY_FILTERS);
  const isFirstMount = useRef(true);

  const fetchCards = useCallback(async () => {
    if (!user) return;
    const [{ data }, blockedIds] = await Promise.all([
      supabase
        .from('cards_collection')
        .select('*, profiles!cards_collection_user_id_fkey!inner(username, avatar_url, regions, created_at, premium_status)')
        .eq('is_published', true)
        .neq('user_id', user.id)
        .order('created_at', { ascending: false }),
      fetchBlockedIds(user.id),
    ]);
    const blocked = new Set(blockedIds);
    setAllCards(((data as ExploreCard[]) ?? []).filter((c) => !blocked.has(c.user_id)));
  }, [user]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCards();
    setRefreshing(false);
  }, [fetchCards]);

  useFocusEffect(useCallback(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      setLoading(true);
      fetchCards().finally(() => setLoading(false));
    }
  }, [fetchCards]));

  const enabledGamesSet = useMemo(() => new Set(resolveEnabledGames(profile?.enabled_games)), [profile?.enabled_games]);
  const myRegions = useMemo(() => new Set(profile?.regions ?? []), [profile?.regions]);
  const visibleAllCards = useMemo(
    () => allCards.filter(c => enabledGamesSet.has(c.game as TCGGame)),
    [allCards, enabledGamesSet],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, CardGroup>();
    for (const c of visibleAllCards) {
      const k = groupKey(c);
      let g = map.get(k);
      if (!g) {
        g = {
          key: k,
          game: c.game as TCGGame,
          card_name: c.card_name,
          card_number: c.card_number,
          set_name: c.set_name,
          image_url: c.image_url,
          is_foil: c.is_foil,
          listings: [],
          regionSet: new Set(),
        };
        map.set(k, g);
      }
      g.listings.push(c);
      (c.profiles?.regions ?? []).forEach(r => g.regionSet.add(r));
      if (!g.image_url && c.image_url) g.image_url = c.image_url;
    }
    for (const g of map.values()) {
      g.listings.sort((a, b) => {
        if (!!a.is_boosted !== !!b.is_boosted) return b.is_boosted ? 1 : -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.listings[0].created_at).getTime() -
        new Date(a.listings[0].created_at).getTime(),
    );
  }, [visibleAllCards]);

  const uniqueGames = useMemo(() => new Set(grouped.map(g => g.game)), [grouped]);

  const cards = useMemo(() => {
    let result = grouped;
    if (filterGame !== 'all') result = result.filter(g => g.game === filterGame);
    if (onlyMyRegions && myRegions.size > 0) {
      result = result.filter(g => Array.from(g.regionSet).some(r => myRegions.has(r)));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(g => g.card_name.toLowerCase().includes(q));
    }
    if (isPremium) {
      const setQ = filters.setName.trim().toLowerCase();
      if (filters.conditions.size > 0 || filters.foilOnly || setQ) {
        result = result
          .map(g => {
            const listings = g.listings.filter(l => {
              if (filters.foilOnly && !l.is_foil) return false;
              if (filters.conditions.size > 0 && !filters.conditions.has(l.condition)) return false;
              if (setQ && !(l.set_name ?? '').toLowerCase().includes(setQ)) return false;
              return true;
            });
            if (listings.length === 0) return null;
            return { ...g, listings };
          })
          .filter((g): g is CardGroup => g !== null);
      }
    }
    return result;
  }, [grouped, filterGame, onlyMyRegions, myRegions, search, isPremium, filters]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Explorar</Text>
          <Text style={styles.subtitle}>
            {allCards.length} carta{allCards.length !== 1 ? 's' : ''} publicada{allCards.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={palette.textSecondary} />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={item => item.key}
          numColumns={3}
          columnWrapperStyle={{ justifyContent: 'flex-start' }}
          ListHeaderComponent={
            <ExploreHeader
              search={search}
              onSearchChange={setSearch}
              uniqueGames={uniqueGames}
              filterGame={filterGame}
              setFilterGame={setFilterGame}
              onlyMyRegions={onlyMyRegions}
              setOnlyMyRegions={setOnlyMyRegions}
              hasRegions={myRegions.size > 0}
              filterCount={activeFilterCount(filters)}
              onOpenFilters={() => {
                if (!isPremium) {
                  dialog.confirm({
                    title: 'Filtros avanzados son Pro',
                    message: 'Filtra por precio, condición, foil y set con Trocora Pro.',
                    confirmText: 'Pasarme a Pro',
                    cancelText: 'Más tarde',
                    onConfirm: () => router.push('/paywall'),
                  });
                  return;
                }
                setShowFilters(true);
              }}
              onClearFilters={() => setFilters(EMPTY_FILTERS)}
            />
          }
          renderItem={({ item }) => (
            <CardItem group={item} onPress={() => setSelectedGroup(item)} />
          )}
          ListEmptyComponent={<EmptyExplore />}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: tabBarClearance }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.primary} />
          }
        />
      )}

      <CardDetailModal
        group={selectedGroup}
        myRegions={myRegions}
        onClose={() => setSelectedGroup(null)}
        onPropose={(listing) => {
          setSelectedGroup(null);
          router.push({
            pathname: '/intercambio/nueva',
            params: { receiver_id: listing.user_id, card_id: listing.id },
          });
        }}
      />

      <AdvancedFiltersModal
        visible={showFilters}
        filters={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_FILTERS)}
        onClose={() => setShowFilters(false)}
      />
    </SafeAreaView>
  );
}

function ExploreHeader({
  search, onSearchChange, uniqueGames, filterGame, setFilterGame,
  onlyMyRegions, setOnlyMyRegions, hasRegions,
  filterCount, onOpenFilters, onClearFilters,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  uniqueGames: Set<TCGGame>;
  filterGame: TCGGame | 'all';
  setFilterGame: (g: TCGGame | 'all') => void;
  onlyMyRegions: boolean;
  setOnlyMyRegions: (v: boolean) => void;
  hasRegions: boolean;
  filterCount: number;
  onOpenFilters: () => void;
  onClearFilters: () => void;
}) {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <>
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          value={search}
          onChangeText={onSearchChange}
          placeholder="Buscar carta..."
          placeholderTextColor={palette.textMuted}
        />
        <TouchableOpacity
          style={[styles.filtersBtn, filterCount > 0 && styles.filtersBtnActive]}
          onPress={onOpenFilters}
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={18} color={filterCount > 0 ? palette.bg : palette.primary} />
          {filterCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountBadgeText}>{filterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {filterCount > 0 && (
        <TouchableOpacity onPress={onClearFilters} style={styles.clearFiltersRow}>
          <Ionicons name="close-circle" size={14} color={palette.textSecondary} />
          <Text style={styles.clearFiltersText}>Limpiar filtros ({filterCount})</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {hasRegions && (
          <TouchableOpacity
            style={[styles.filterChip, onlyMyRegions && styles.filterChipActive]}
            onPress={() => setOnlyMyRegions(!onlyMyRegions)}
          >
            <Ionicons name="location-outline" size={15} color={onlyMyRegions ? '#fff' : palette.primary} />
            <Text style={[styles.filterChipText, onlyMyRegions && styles.filterChipTextActive]}>
              Mis regiones
            </Text>
          </TouchableOpacity>
        )}
        {uniqueGames.size > 1 && (Array.from(uniqueGames) as TCGGame[]).map(g => (
          <TouchableOpacity
            key={g}
            style={[styles.filterChip, filterGame === g && styles.filterChipActive]}
            onPress={() => setFilterGame(filterGame === g ? 'all' : g)}
          >
            {GAME_LOGO[g]
              ? <Image source={GAME_LOGO[g]} style={styles.filterChipLogo} contentFit="contain" />
              : <Ionicons name={GAME_ICON[g].name} size={15} color={filterGame === g ? '#fff' : GAME_ICON[g].color} />
            }
            <Text style={[styles.filterChipText, filterGame === g && styles.filterChipTextActive]}>
              {GAME_LABELS[g]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );
}

function CardItem({ group, onPress }: { group: CardGroup; onPress: () => void }) {
  const styles = useStyles();
  const gameIcon = GAME_ICON[group.game];
  const count = group.listings.length;
  const prices = group.listings.map(l => l.price_reference).filter((p): p is number => p != null);
  const priceCur = group.listings.find(l => l.price_reference_currency)?.price_reference_currency ?? 'usd';
  const priceLabel = prices.length > 0
    ? `${prices.length > 1 ? 'Desde ' : ''}${formatCurrencyValue(Math.min(...prices), priceCur)}`
    : null;
  return (
    <TouchableOpacity style={styles.thumb} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.thumbImageWrap}>
        {group.image_url ? (
          <Image source={{ uri: group.image_url }} style={styles.thumbImg} contentFit="contain" />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Ionicons name={gameIcon.name} size={32} color={gameIcon.color} />
          </View>
        )}
        {priceLabel && <PriceTagPill label={priceLabel} />}
      </View>
      <View style={styles.thumbFooter}>
        {group.card_number && <Text style={styles.thumbNum}>#{group.card_number}</Text>}
        <Text style={styles.thumbName} numberOfLines={1}>{group.card_name}</Text>
      </View>
      {count > 1 && (
        <View style={styles.countBadge}>
          <Ionicons name="people" size={9} color="#fff" />
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function CardDetailModal({ group, myRegions, onClose, onPropose }: { group: CardGroup | null; myRegions: Set<string>; onClose: () => void; onPropose: (listing: ExploreCard) => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const { palette } = useTheme();
  const { isPremium } = usePremium();
  const dialog = useDialog();
  const styles = useStyles();
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [watching, setWatching] = useState(false);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [watchBusy, setWatchBusy] = useState(false);

  const sample = group?.listings[0];
  const catalogCardId = sample?.pokemon_card_id ?? sample?.magic_card_id ?? null;

  useEffect(() => {
    if (!group || !user || !catalogCardId) {
      setWatching(false);
      setWatchingId(null);
      return;
    }
    (async () => {
      const has = await isInWatchlist(user.id, group.game, catalogCardId);
      setWatching(has);
      if (has) {
        const col = group.game === 'pokemon' ? 'pokemon_card_id' : 'magic_card_id';
        const { data } = await supabase
          .from('card_watchlist')
          .select('id')
          .eq('user_id', user.id)
          .eq(col, catalogCardId)
          .maybeSingle();
        setWatchingId((data as any)?.id ?? null);
      } else {
        setWatchingId(null);
      }
    })();
  }, [group?.key, user?.id, catalogCardId]);

  if (!group) return null;
  const gameIcon = GAME_ICON[group.game];
  const gameLogo = GAME_LOGO[group.game];

  function openUserProfile(userId: string) {
    onClose();
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  async function toggleWatchlist() {
    if (!user || !group || !catalogCardId) return;
    if (!isPremium) {
      onClose();
      dialog.confirm({
        title: 'Watchlist es Pro',
        message: 'Recibe push cuando alguien publique esta carta. Disponible con Trocora Pro.',
        confirmText: 'Pasarme a Pro',
        cancelText: 'Más tarde',
        onConfirm: () => router.push('/paywall'),
      });
      return;
    }
    setWatchBusy(true);
    if (watching && watchingId) {
      await removeFromWatchlist(watchingId);
      setWatching(false);
      setWatchingId(null);
    } else {
      const res = await addToWatchlist({
        userId: user.id,
        game: group.game,
        catalogCardId,
        cardName: group.card_name,
        setName: group.set_name ?? null,
        imageUrl: group.image_url ?? null,
      });
      if (res.error) {
        dialog.alert({ title: 'Error', message: res.error });
      } else {
        setWatching(true);
      }
    }
    setWatchBusy(false);
  }

  return (
    <Modal visible={!!group} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalHandle} />

            <View style={styles.modalContent}>
              {group.image_url ? (
                <Image source={{ uri: group.image_url }} style={styles.modalImage} contentFit="contain" />
              ) : (
                <View style={styles.modalImagePlaceholder}>
                  {gameLogo
                    ? <Image source={gameLogo} style={{ width: 64, height: 64 }} contentFit="contain" />
                    : <Ionicons name={gameIcon.name} size={64} color={gameIcon.color} />}
                </View>
              )}

              <View style={styles.modalInfo}>
                <View style={styles.modalGameRow}>
                  {gameLogo
                    ? <Image source={gameLogo} style={styles.modalGameLogo} contentFit="contain" />
                    : <Ionicons name={gameIcon.name} size={14} color={gameIcon.color} />}
                  <Text style={[styles.modalGameText, { color: gameIcon.color }]}>{GAME_LABELS[group.game]}</Text>
                  {group.card_number && <Text style={styles.modalCardNum}>#{group.card_number}</Text>}
                </View>
                <Text style={styles.modalCardName}>{group.card_name}</Text>
                {group.set_name && <Text style={styles.modalSetName}>{group.set_name}</Text>}
                {group.is_foil && (
                  <View style={styles.badgeFoil}>
                    <Text style={styles.badgeFoilText}>✦ Foil</Text>
                  </View>
                )}
                {(() => {
                  const prices = group.listings.map(l => l.price_reference).filter((p): p is number => p != null);
                  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
                  const cur = group.listings.find(l => l.price_reference_currency)?.price_reference_currency ?? 'usd';
                  if (minPrice == null) return null;
                  return (
                    <View style={styles.modalSummary}>
                      <Text style={styles.modalSummaryPrice}>Desde {formatCurrencyValue(minPrice, cur)} {cur.toUpperCase()}</Text>
                    </View>
                  );
                })()}

                {catalogCardId && (
                  <TouchableOpacity
                    style={[styles.watchBtn, watching && styles.watchBtnActive]}
                    onPress={toggleWatchlist}
                    disabled={watchBusy}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={watching ? 'heart' : 'heart-outline'}
                      size={16}
                      color={watching ? '#fff' : palette.primary}
                    />
                    <Text style={[styles.watchBtnText, watching && styles.watchBtnTextActive]}>
                      {watching ? 'En watchlist' : 'Avísame'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.listingsHeader}>
              {group.listings.length === 1 ? '1 publicador' : `${group.listings.length} publicadores`}
            </Text>

            <ScrollView style={styles.listingsScroll} contentContainerStyle={{ gap: 8 }}>
              {group.listings.map(l => {
                const ownerRegions = l.profiles?.regions ?? [];
                const matching = myRegions.size > 0
                  ? ownerRegions.filter(r => myRegions.has(r))
                  : ownerRegions;
                const regionLabel = matching.length > 0
                  ? matching.slice(0, 2).map(r => REGION_LABEL[r] ?? r).join(', ') + (matching.length > 2 ? ` +${matching.length - 2}` : '')
                  : myRegions.size > 0
                    ? 'Otra región'
                    : null;
                return (
                  <View key={l.id} style={styles.listingRow}>
                    <TouchableOpacity
                      onPress={() => openUserProfile(l.user_id)}
                      style={styles.ownerAvatar}
                      activeOpacity={0.7}
                    >
                      {l.profiles?.avatar_url ? (
                        <Image source={{ uri: l.profiles.avatar_url }} style={styles.ownerAvatarImg} />
                      ) : (
                        <Ionicons name="person-outline" size={18} color={palette.textMuted} />
                      )}
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <TouchableOpacity onPress={() => openUserProfile(l.user_id)} activeOpacity={0.7} style={styles.ownerUsernameRow}>
                        <Text style={styles.ownerUsername}>@{l.profiles?.username ?? '—'}</Text>
                        {l.is_boosted && (
                          <View style={styles.boostChip}>
                            <Ionicons name="rocket" size={9} color={palette.bg} />
                            <Text style={styles.boostChipText}>Destacado</Text>
                          </View>
                        )}
                        <ProBadge status={l.profiles?.premium_status as any} />
                      </TouchableOpacity>
                      {memberSince(l.profiles?.created_at) && (
                        <Text style={styles.ownerSince}>{memberSince(l.profiles?.created_at)}</Text>
                      )}
                      <View style={styles.listingMetaRow}>
                        <Text style={styles.listingMeta}>
                          {CONDITION_LABELS[l.condition] ?? l.condition}
                        </Text>
                        {l.price_reference != null && (
                          <>
                            <Text style={styles.listingMetaDot}>·</Text>
                            <Text style={[styles.listingMeta, { color: palette.successAlt }]}>
                              {formatCurrencyValue(l.price_reference, l.price_reference_currency ?? 'usd')} {(l.price_reference_currency ?? 'usd').toUpperCase()}
                            </Text>
                          </>
                        )}
                        {regionLabel && (
                          <>
                            <Text style={styles.listingMetaDot}>·</Text>
                            <Text style={styles.listingMeta}>{regionLabel}</Text>
                          </>
                        )}
                      </View>
                    </View>
                    {(l.custom_photos?.length ?? 0) > 0 && (
                      <TouchableOpacity
                        style={styles.photoBtn}
                        onPress={() => setLightboxPhotos(l.custom_photos)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="camera" size={14} color={palette.primary} />
                        <Text style={styles.photoBtnText}>{l.custom_photos.length}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.listingBtn} onPress={() => onPropose(l)}>
                      <Ionicons name="arrow-forward" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <PhotoLightbox
        visible={lightboxPhotos.length > 0}
        photos={lightboxPhotos}
        onClose={() => setLightboxPhotos([])}
      />
    </Modal>
  );
}

function EmptyExplore() {
  const styles = useStyles();
  const { palette } = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name="compass-outline" size={64} color={palette.surfaceAlt} style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>Nada por aquí</Text>
      <Text style={styles.emptyText}>Aún no hay cartas publicadas. Vuelve más tarde.</Text>
    </View>
  );
}

const ALL_CONDITIONS: { value: CardCondition; label: string }[] = [
  { value: 'mint', label: 'Nueva' },
  { value: 'near_mint', label: 'Casi nueva' },
  { value: 'excellent', label: 'Excelente' },
  { value: 'good', label: 'Buena' },
  { value: 'played', label: 'Jugada' },
  { value: 'poor', label: 'Dañada' },
];

function AdvancedFiltersModal({
  visible, filters, onChange, onClear, onClose,
}: {
  visible: boolean;
  filters: AdvancedFilters;
  onChange: (f: AdvancedFilters) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { palette } = useTheme();

  function toggleCondition(c: CardCondition) {
    const next = new Set(filters.conditions);
    next.has(c) ? next.delete(c) : next.add(c);
    onChange({ ...filters, conditions: next });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.filtersSheet}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalHandle} />

            <View style={styles.filtersHeader}>
              <Text style={styles.filtersTitle}>Filtros</Text>
              <TouchableOpacity onPress={onClear}>
                <Text style={styles.filtersClear}>Limpiar todo</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }}>
              <Text style={styles.filtersGroupLabel}>Condición</Text>
              <View style={styles.conditionsWrap}>
                {ALL_CONDITIONS.map(c => {
                  const active = filters.conditions.has(c.value);
                  return (
                    <TouchableOpacity
                      key={c.value}
                      style={[styles.conditionChip, active && styles.conditionChipActive]}
                      onPress={() => toggleCondition(c.value)}
                    >
                      <Text style={[styles.conditionChipText, active && styles.conditionChipTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.filtersGroupLabel}>Set / expansión</Text>
              <TextInput
                style={styles.setInput}
                value={filters.setName}
                onChangeText={v => onChange({ ...filters, setName: v })}
                placeholder="Ej: Base Set, Modern Horizons..."
                placeholderTextColor={palette.textMuted}
              />

              <View style={styles.foilRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.foilLabel}>Solo Foil / Holo</Text>
                  <Text style={styles.foilHint}>Mostrar únicamente cartas foil</Text>
                </View>
                <TouchableOpacity
                  style={styles.foilToggle}
                  onPress={() => onChange({ ...filters, foilOnly: !filters.foilOnly })}
                >
                  <Ionicons
                    name={filters.foilOnly ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={filters.foilOnly ? palette.warning : palette.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.applyBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.applyBtnText}>Aplicar filtros</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: { padding: 20, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: '800', color: p.textPrimary },
  subtitle: { fontSize: 13, color: p.textMuted, marginTop: 2 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  searchInput: {
    marginHorizontal: 0,
    backgroundColor: p.surface, borderWidth: 1, borderColor: p.border,
    borderRadius: 12, padding: 12, fontSize: 14, color: p.textPrimary,
  },
  filtersBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: p.surface, borderWidth: 1, borderColor: p.border,
    alignItems: 'center', justifyContent: 'center',
  },
  filtersBtnActive: { backgroundColor: p.warning, borderColor: p.warning },
  filterCountBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: p.primary, borderRadius: 9, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filterCountBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  clearFiltersRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 4,
  },
  clearFiltersText: { color: p.textSecondary, fontSize: 12, fontWeight: '600' },
  filterRow: { gap: 8, paddingBottom: 12 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface,
  },
  filterChipActive: { backgroundColor: p.primary, borderColor: p.primary },
  filterChipLogo: { width: 18, height: 18 },
  filterChipText: { color: p.textMuted, fontSize: 13 },
  filterChipTextActive: { color: '#fff' },

  thumb: {
    width: CARD_WIDTH, margin: 4, alignItems: 'center',
    backgroundColor: p.surface, borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: p.border,
  },
  thumbImageWrap: { width: '100%', position: 'relative' },
  thumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  thumbPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 6,
    backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center',
  },
  thumbFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3, width: '100%' },
  thumbNum: { color: p.textMuted, fontSize: 9, fontWeight: '600', flexShrink: 0 },
  thumbName: { color: p.textPrimary, fontSize: 9, fontWeight: '600', flexShrink: 1 },
  countBadge: {
    position: 'absolute', top: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: p.primary, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8,
  },
  countText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  boostChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: p.warning, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  boostChipText: { color: p.bg, fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: p.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: p.surfaceAlt,
    alignSelf: 'center', marginBottom: 16,
  },
  modalContent: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  modalImage: { width: 120, height: 168, borderRadius: 10 },
  modalImagePlaceholder: {
    width: 120, height: 168, borderRadius: 10,
    backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center',
  },
  modalInfo: { flex: 1, gap: 6 },
  modalGameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  modalGameLogo: { width: 16, height: 16 },
  modalGameText: { fontSize: 12, fontWeight: '600' },
  modalCardNum: { color: p.textMuted, fontSize: 12 },
  modalCardName: { fontSize: 18, fontWeight: '800', color: p.textPrimary, lineHeight: 22 },
  modalSetName: { fontSize: 12, color: p.textMuted },
  modalSummary: { marginTop: 8 },
  modalSummaryPrice: { color: p.successAlt, fontSize: 14, fontWeight: '700' },
  watchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: p.primaryMuted,
    borderWidth: 1, borderColor: p.primary,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginTop: 10,
  },
  watchBtnActive: { backgroundColor: p.primary, borderColor: p.primary },
  watchBtnText: { color: p.primary, fontSize: 12, fontWeight: '700' },
  watchBtnTextActive: { color: '#fff' },
  badgeFoil: {
    backgroundColor: '#A78BFA22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeFoilText: { color: '#A78BFA', fontSize: 12, fontWeight: '600' },

  listingsHeader: {
    color: p.textSecondary, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  listingsScroll: { maxHeight: 320 },
  listingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: p.bg, borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: p.border,
  },
  ownerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: p.surface, borderWidth: 1, borderColor: p.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  ownerAvatarImg: { width: 40, height: 40 },
  ownerUsername: { color: p.primary, fontSize: 14, fontWeight: '700' },
  ownerUsernameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ownerSince: { color: p.textMuted, fontSize: 11, marginTop: 1 },
  listingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: p.primaryMuted, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6,
    borderWidth: 1, borderColor: p.primary,
  },
  photoBtnText: { color: p.primary, fontSize: 11, fontWeight: '700' },
  listingMeta: { color: p.textSecondary, fontSize: 11 },
  listingMetaDot: { color: p.textMuted, fontSize: 11 },
  listingBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: p.primary, alignItems: 'center', justifyContent: 'center',
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: 60 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: p.textPrimary },
  emptyText: { fontSize: 14, color: p.textMuted, textAlign: 'center', marginTop: 8 },

  filtersSheet: {
    backgroundColor: p.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 28,
    borderTopWidth: 1, borderColor: p.border,
  },
  filtersHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  filtersTitle: { color: p.textPrimary, fontSize: 20, fontWeight: '800' },
  filtersClear: { color: p.primary, fontSize: 13, fontWeight: '600' },
  filtersGroupLabel: {
    color: p.textMuted, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8, marginTop: 12,
  },
  conditionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  conditionChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1, borderColor: p.border,
    backgroundColor: p.surface,
  },
  conditionChipActive: { backgroundColor: p.primary, borderColor: p.primary },
  conditionChipText: { color: p.textSecondary, fontSize: 13, fontWeight: '600' },
  conditionChipTextActive: { color: '#fff' },
  setInput: {
    backgroundColor: p.surface, borderRadius: 10,
    borderWidth: 1, borderColor: p.border,
    paddingHorizontal: 12, paddingVertical: 10,
    color: p.textPrimary, fontSize: 14,
  },
  foilRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border,
    padding: 14, marginTop: 16,
  },
  foilLabel: { color: p.textPrimary, fontSize: 14, fontWeight: '600' },
  foilHint: { color: p.textMuted, fontSize: 12, marginTop: 2 },
  foilToggle: { padding: 4 },
  applyBtn: {
    marginTop: 18, backgroundColor: p.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
}));
