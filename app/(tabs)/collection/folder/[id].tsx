import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
  Dimensions, Modal, TextInput, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDialog } from '@/lib/AppDialog';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { usePremium } from '@/lib/usePremium';
import { assertCanPublish } from '@/lib/publishGate';
import type { CardCollection, CollectionFolder, TCGGame } from '@/types/database';
import { formatCurrencyValue, currencyLabel } from '@/lib/currency';
import { getUsdToClp } from '@/lib/exchangeRate';
import { availabilityBorder } from '@/lib/cardStyle';
import { patchCollectionCard, removeCollectionCard, requestCollectionRefresh, subscribeCollection } from '@/lib/collectionRefresh';
import { validateFolderGame, gameLabel } from '@/lib/folderValidation';
import { effectivePrice, COLLECTION_CARD_SELECT, type CardWithCatalog } from '@/lib/cardPrice';
import { FolderIcon } from '@/lib/folderIcon';
import { UndoSnackbar } from '@/lib/UndoSnackbar';
import { makeStyles } from '@/lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type CardCollectionWithPrice = CardWithCatalog;

const CARD_WIDTH = (Dimensions.get('window').width - 16 - 24) / 3;

const GAME_ICON: Record<TCGGame, { name: IoniconName; color: string }> = {
  pokemon: { name: 'flash-outline', color: '#FACC15' },
  magic: { name: 'color-wand-outline', color: '#A78BFA' },
  yugioh: { name: 'triangle-outline', color: '#60A5FA' },
  onepiece: { name: 'compass-outline', color: '#F87171' },
  digimon: { name: 'hardware-chip-outline', color: '#34D399' },
  lorcana: { name: 'flame-outline', color: '#FB923C' },
  other: { name: 'albums-outline', color: '#94A3B8' },
};

export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const { palette } = useTheme();
  const { isPremium } = usePremium();
  const currency = profile?.currency ?? 'usd';
  const router = useRouter();
  const dialog = useDialog();
  const styles = useStyles();

  const [folder, setFolder] = useState<CollectionFolder | null>(null);
  const [cards, setCards] = useState<CardCollectionWithPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [usdToClp, setUsdToClp] = useState(950);
  const [rateReady, setRateReady] = useState(currency !== 'clp');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [allFolders, setAllFolders] = useState<CollectionFolder[]>([]);
  const [bulkFolderOpen, setBulkFolderOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'number' | 'name' | 'value' | 'date'>('number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const pendingDeleteRef = useRef<Set<string>>(new Set());
  const pendingDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function toggleSort(key: 'number' | 'name' | 'value' | 'date') {
    if (sortBy === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'value' || key === 'date' ? 'desc' : 'asc');
    }
  }

  const fetchFolder = useCallback(async () => {
    const { data } = await supabase
      .from('collection_folders')
      .select('*')
      .eq('id', id)
      .single();
    setFolder(data);
  }, [id]);

  const fetchCards = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cards_collection')
      .select(COLLECTION_CARD_SELECT)
      .eq('user_id', user.id)
      .eq('folder_id', id)
      .order('created_at', { ascending: false });
    setCards((data ?? []) as unknown as CardCollectionWithPrice[]);
  }, [user, id]);

  const fetchAllFolders = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('collection_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setAllFolders(data ?? []);
  }, [user]);

  const isFirstMount = useRef(true);
  const needsRefresh = useRef(false);

  useFocusEffect(useCallback(() => {
    if (isFirstMount.current || needsRefresh.current) {
      isFirstMount.current = false;
      needsRefresh.current = false;
      setLoading(true);
      Promise.all([fetchFolder(), fetchCards(), fetchAllFolders()]).finally(() => setLoading(false));
    }
  }, [fetchFolder, fetchCards, fetchAllFolders]));

  useEffect(() => {
    return subscribeCollection(event => {
      if (event.type === 'patch') {
        if ('folder_id' in event.patch && event.patch.folder_id !== id) {
          setCards(prev => prev.filter(c => c.id !== event.cardId));
        } else {
          setCards(prev => prev.map(c => c.id === event.cardId ? { ...c, ...event.patch } : c));
        }
      } else if (event.type === 'remove') {
        setCards(prev => prev.filter(c => c.id !== event.cardId));
      } else if (event.type === 'refresh') {
        needsRefresh.current = true;
      }
    });
  }, [id]);

  useEffect(() => {
    if (currency !== 'clp') { setRateReady(true); return; }
    let mounted = true;
    setRateReady(false);
    getUsdToClp().then(r => {
      if (!mounted) return;
      setUsdToClp(r);
      setRateReady(true);
    });
    return () => { mounted = false; };
  }, [currency]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([fetchFolder(), fetchCards()]);
    setRefreshing(false);
  }

  function handleCardPress(card: CardCollection) {
    if (selectionMode) toggleCardSelection(card.id);
    else router.push(`/(tabs)/collection/${card.id}`);
  }

  function handleCardLongPress(card: CardCollection) {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedCards(new Set([card.id]));
    }
  }

  function toggleCardSelection(id: string) {
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) setSelectionMode(false);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedCards(new Set());
  }

  function selectAll() {
    setSelectedCards(new Set(cards.map(c => c.id)));
  }

  async function bulkRemoveFromFolder() {
    const ids = Array.from(selectedCards);
    await supabase.from('cards_collection').update({ folder_id: null }).in('id', ids);
    setCards(prev => prev.filter(c => !ids.includes(c.id)));
    ids.forEach(cardId => patchCollectionCard(cardId, { folder_id: null }));
    exitSelectionMode();
  }

  async function bulkAssignFolder(folderId: string | null) {
    const ids = Array.from(selectedCards);
    if (folderId) {
      const games = cards.filter(c => selectedCards.has(c.id)).map(c => c.game);
      const check = await validateFolderGame(folderId, games);
      if (!check.ok) {
        dialog.alert({ title: 'Carpeta de otro juego', message: `Esa carpeta solo acepta cartas de ${gameLabel(check.folderGame)}.` });
        return;
      }
    }
    await supabase.from('cards_collection').update({ folder_id: folderId }).in('id', ids);
    setBulkFolderOpen(false);
    setCards(prev => prev.filter(c => !ids.includes(c.id)));
    ids.forEach(cardId => patchCollectionCard(cardId, { folder_id: folderId }));
    exitSelectionMode();
  }

  async function bulkToggleField(field: 'is_published' | 'is_foil') {
    const ids = Array.from(selectedCards);
    const selectedList = cards.filter(c => selectedCards.has(c.id));
    const newValue = !selectedList.every(c => c[field]);
    if (field === 'is_published' && newValue && user) {
      const willPublish = selectedList.filter(c => !c.is_published).length;
      const ok = await assertCanPublish({
        userId: user.id,
        isPremium,
        addCount: willPublish,
        dialog,
        onUpgrade: () => router.push('/paywall'),
      });
      if (!ok) return;
    }
    await supabase.from('cards_collection').update({ [field]: newValue }).in('id', ids);
    setCards(prev => prev.map(c => selectedCards.has(c.id) ? { ...c, [field]: newValue } : c));
    ids.forEach(cardId => patchCollectionCard(cardId, { [field]: newValue }));
    exitSelectionMode();
  }

  async function commitPendingDelete() {
    if (pendingDeleteTimer.current) { clearTimeout(pendingDeleteTimer.current); pendingDeleteTimer.current = null; }
    const ids = Array.from(pendingDeleteRef.current);
    if (ids.length === 0) return;
    pendingDeleteRef.current = new Set();
    setPendingDeleteIds(new Set());
    setCards(prev => prev.filter(c => !ids.includes(c.id)));
    await supabase.from('cards_collection').delete().in('id', ids);
    ids.forEach(cardId => removeCollectionCard(cardId));
  }

  function undoPendingDelete() {
    if (pendingDeleteTimer.current) { clearTimeout(pendingDeleteTimer.current); pendingDeleteTimer.current = null; }
    pendingDeleteRef.current = new Set();
    setPendingDeleteIds(new Set());
  }

  function bulkDelete() {
    const ids = Array.from(selectedCards);
    if (ids.length === 0) return;
    commitPendingDelete();
    const next = new Set(ids);
    pendingDeleteRef.current = next;
    setPendingDeleteIds(next);
    exitSelectionMode();
    if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    pendingDeleteTimer.current = setTimeout(() => { commitPendingDelete(); }, 5000);
  }

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') commitPendingDelete();
    });
    return () => {
      sub.remove();
      if (pendingDeleteRef.current.size > 0) {
        const ids = Array.from(pendingDeleteRef.current);
        supabase.from('cards_collection').delete().in('id', ids);
        ids.forEach(cardId => removeCollectionCard(cardId));
      }
      if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    };
  }, []);

  function openSearchNewCard() {
    setShowAddSheet(false);
    const folderGame = cards[0]?.game ?? null;
    const qs = new URLSearchParams({ folderId: String(id) });
    if (folderGame) qs.set('game', folderGame);
    router.push(`/(tabs)/collection/add?${qs.toString()}`);
  }

  function openExistingPicker() {
    setShowAddSheet(false);
    setShowPicker(true);
  }

  async function deleteFolder() {
    dialog.confirm({
      title: 'Eliminar carpeta',
      message: `¿Eliminar "${folder?.name}"? Las cartas que tenía adentro quedarán sin carpeta.`,
      confirmText: 'Eliminar',
      destructive: true,
      onConfirm: async () => {
        if (user) {
          await supabase.from('cards_collection').update({ folder_id: null })
            .eq('user_id', user.id).eq('folder_id', id);
        }
        await supabase.from('collection_folders').delete().eq('id', id);
        requestCollectionRefresh();
        router.back();
      },
    });
  }

  const visibleCards = useMemo(() => cards.filter(c => !pendingDeleteIds.has(c.id)), [cards, pendingDeleteIds]);
  const totalCards = visibleCards.reduce((sum, c) => sum + c.quantity, 0);
  const totalValue = visibleCards.reduce((sum, c) => sum + effectivePrice(c, currency, usdToClp) * c.quantity, 0);

  const sortedCards = useMemo(() => {
    const arr = [...visibleCards];
    const factor = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'number') {
      arr.sort((a, b) => {
        const an = parseInt(a.card_number ?? '', 10);
        const bn = parseInt(b.card_number ?? '', 10);
        if (Number.isNaN(an) && Number.isNaN(bn)) return (a.card_number ?? '').localeCompare(b.card_number ?? '') * factor;
        if (Number.isNaN(an)) return 1;
        if (Number.isNaN(bn)) return -1;
        return (an - bn) * factor;
      });
    } else if (sortBy === 'name') {
      arr.sort((a, b) => a.card_name.localeCompare(b.card_name) * factor);
    } else if (sortBy === 'value') {
      arr.sort((a, b) => (effectivePrice(a, currency, usdToClp) - effectivePrice(b, currency, usdToClp)) * factor);
    } else if (sortBy === 'date') {
      arr.sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return (at - bt) * factor;
      });
    }
    return arr;
  }, [visibleCards, sortBy, sortDir, currency, usdToClp]);

  if (loading || authLoading || !rateReady) return <ActivityIndicator style={{ flex: 1, backgroundColor: palette.bg }} color={palette.textSecondary} />;
  if (!folder) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {selectionMode ? (
          <TouchableOpacity onPress={exitSelectionMode} style={styles.backBtn}>
            <Text style={styles.selCancelText}>Cancelar</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={palette.primary} />
            <Text style={styles.back}>Colección</Text>
          </TouchableOpacity>
        )}
        <View style={styles.headerCenter}>
          {selectionMode ? (
            <Text style={styles.title} numberOfLines={1}>
              {selectedCards.size} seleccionada{selectedCards.size !== 1 ? 's' : ''}
            </Text>
          ) : (
            <>
              <View style={[styles.folderDot, { backgroundColor: folder.color }]} />
              <Text style={styles.title} numberOfLines={1}>{folder.name}</Text>
            </>
          )}
        </View>
        <View style={styles.headerActions}>
          {selectionMode ? (
            <TouchableOpacity onPress={selectAll} style={styles.headerIconBtn} hitSlop={8}>
              <Text style={styles.selAllText}>Todas</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={() => setShowAddSheet(true)} style={styles.headerIconBtn} hitSlop={8}>
                <Ionicons name="add" size={24} color={palette.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={deleteFolder} style={styles.headerIconBtn} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={palette.danger} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {!selectionMode && (
        <>
          <Text style={styles.subtitle}>
            {totalCards} cartas{totalValue > 0 ? (
              <>{'  ·  '}<Text style={styles.subtitleValue}>{formatCurrencyValue(totalValue, currency)} {currencyLabel(currency)}</Text></>
            ) : ''}
          </Text>
          {cards.length > 1 && (
            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>Ordenar:</Text>
              {(['number', 'name', 'value', 'date'] as const).map(key => (
                <TouchableOpacity
                  key={key}
                  style={[styles.sortChip, sortBy === key && styles.sortChipActive]}
                  onPress={() => toggleSort(key)}
                >
                  <Text style={[styles.sortChipText, sortBy === key && styles.sortChipTextActive]}>
                    {key === 'number' ? 'N°' : key === 'name' ? 'Nombre' : key === 'value' ? 'Valor' : 'Fecha'}
                  </Text>
                  {sortBy === key && (
                    <Ionicons
                      name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'}
                      size={11}
                      color="#fff"
                      style={{ marginLeft: 3 }}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      <FlatList
        data={sortedCards}
        keyExtractor={item => item.id}
        numColumns={3}
        columnWrapperStyle={{ justifyContent: 'flex-start' }}
        renderItem={({ item }) => (
          <CardItem
            card={item}
            onPress={() => handleCardPress(item)}
            onLongPress={() => handleCardLongPress(item)}
            selected={selectedCards.has(item.id)}
            selectionMode={selectionMode}
            currency={currency}
            usdToClp={usdToClp}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="folder-open-outline" size={48} color={palette.surfaceAlt} />
            <Text style={styles.emptyTitle}>Carpeta vacía</Text>
            <Text style={styles.emptyText}>Toca + para agregar cartas</Text>
          </View>
        }
        contentContainerStyle={sortedCards.length === 0 ? { flex: 1 } : { padding: 8, paddingBottom: selectionMode ? 96 : 24 }}
      />

      {selectionMode && (
        <View style={styles.selectionActionBar}>
          <TouchableOpacity
            style={[styles.selActionBtn, selectedCards.size === 0 && styles.selActionBtnDisabled]}
            onPress={() => setBulkFolderOpen(true)}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="folder-outline" size={20} color={selectedCards.size > 0 ? palette.textPrimary : palette.textMuted} />
            <Text style={[styles.selActionText, selectedCards.size === 0 && styles.selActionTextDisabled]}>Mover</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selActionBtn, selectedCards.size === 0 && styles.selActionBtnDisabled]}
            onPress={bulkRemoveFromFolder}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="folder-open-outline" size={20} color={selectedCards.size > 0 ? palette.textSecondary : palette.textMuted} />
            <Text style={[styles.selActionText, selectedCards.size === 0 && styles.selActionTextDisabled]}>Quitar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selActionBtn, selectedCards.size === 0 && styles.selActionBtnDisabled]}
            onPress={() => bulkToggleField('is_foil')}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="star-outline" size={20} color={selectedCards.size > 0 ? '#93C5FD' : palette.textMuted} />
            <Text style={[styles.selActionText, selectedCards.size === 0 && styles.selActionTextDisabled]}>Foil</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selActionBtn, selectedCards.size === 0 && styles.selActionBtnDisabled]}
            onPress={() => bulkToggleField('is_published')}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="pricetag-outline" size={20} color={selectedCards.size > 0 ? palette.successAlt : palette.textMuted} />
            <Text style={[styles.selActionText, selectedCards.size === 0 && styles.selActionTextDisabled]}>Publicar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selActionBtn, styles.selActionBtnDanger, selectedCards.size === 0 && styles.selActionBtnDisabled]}
            onPress={bulkDelete}
            disabled={selectedCards.size === 0}
          >
            <Ionicons name="trash-outline" size={20} color={selectedCards.size > 0 ? palette.danger : palette.textMuted} />
            <Text style={[styles.selActionText, { color: selectedCards.size > 0 ? palette.danger : palette.textMuted }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={bulkFolderOpen} transparent animationType="slide" onRequestClose={() => setBulkFolderOpen(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setBulkFolderOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
                Mover {selectedCards.size} carta{selectedCards.size !== 1 ? 's' : ''}
              </Text>
              {allFolders.filter(f => f.id !== id).map(f => (
                <TouchableOpacity key={f.id} style={styles.sheetOption} onPress={() => bulkAssignFolder(f.id)}>
                  <FolderIcon game={null} color={f.color} boxSize={36} iconSize={20} borderRadius={8} />
                  <Text style={styles.sheetOptionText}>{f.name}</Text>
                </TouchableOpacity>
              ))}
              {allFolders.filter(f => f.id !== id).length === 0 && (
                <Text style={styles.noFoldersText}>No tienes otras carpetas.</Text>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <CardPickerModal
        visible={showPicker}
        folderId={id}
        folderColor={folder.color}
        folderGame={cards[0]?.game ?? null}
        userId={user!.id}
        onClose={() => setShowPicker(false)}
        onAdded={() => { setShowPicker(false); fetchCards(); }}
      />

      <UndoSnackbar
        visible={pendingDeleteIds.size > 0}
        message={`${pendingDeleteIds.size} carta${pendingDeleteIds.size !== 1 ? 's' : ''} eliminada${pendingDeleteIds.size !== 1 ? 's' : ''}`}
        onUndo={undoPendingDelete}
        bottomOffset={40}
      />

      <Modal visible={showAddSheet} transparent animationType="slide" onRequestClose={() => setShowAddSheet(false)}>
        <TouchableOpacity style={styles.sheetOverlay} onPress={() => setShowAddSheet(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Agregar cartas</Text>
              <TouchableOpacity style={styles.sheetOption} onPress={openSearchNewCard}>
                <Ionicons name="search-outline" size={20} color={palette.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetOptionText}>Buscar nueva carta</Text>
                  <Text style={styles.sheetOptionDesc}>Por set o por nombre</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetOption, { borderBottomWidth: 0 }]} onPress={openExistingPicker}>
                <Ionicons name="albums-outline" size={20} color={palette.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetOptionText}>De mi colección</Text>
                  <Text style={styles.sheetOptionDesc}>Mover cartas que ya tienes</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function CardPickerModal({
  visible, folderId, folderColor, folderGame, userId, onClose, onAdded,
}: {
  visible: boolean;
  folderId: string;
  folderColor: string;
  folderGame: TCGGame | null;
  userId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const dialog = useDialog();
  const { palette } = useTheme();
  const styles = useStyles();
  const [allCards, setAllCards] = useState<CardCollection[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSelected(new Set());
    setSearch('');
    let query = supabase
      .from('cards_collection')
      .select('*')
      .eq('user_id', userId)
      .or(`folder_id.is.null,folder_id.neq.${folderId}`);
    if (folderGame) query = query.eq('game', folderGame);
    query
      .order('card_name', { ascending: true })
      .then(({ data }) => { setAllCards(data ?? []); setLoading(false); });
  }, [visible, userId, folderId, folderGame]);

  const filtered = search.trim()
    ? allCards.filter(c => c.card_name.toLowerCase().includes(search.toLowerCase()))
    : allCards;

  function toggleCard(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setSaving(true);
    const ids = Array.from(selected);
    const games = allCards.filter(c => selected.has(c.id)).map(c => c.game);
    const check = await validateFolderGame(folderId, games);
    if (!check.ok) {
      setSaving(false);
      dialog.alert({ title: 'Carpeta de otro juego', message: `Esta carpeta solo acepta cartas de ${gameLabel(check.folderGame)}.` });
      return;
    }
    await supabase
      .from('cards_collection')
      .update({ folder_id: folderId })
      .in('id', ids);
    setSaving(false);
    ids.forEach(id => patchCollectionCard(id, { folder_id: folderId }));
    onAdded();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Agregar cartas</Text>
          <TouchableOpacity
            style={[styles.modalSaveBtn, { backgroundColor: folderColor }, (selected.size === 0 || saving) && { opacity: 0.4 }]}
            onPress={handleAdd}
            disabled={selected.size === 0 || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.modalSaveBtnText}>
                  {selected.size === 0 ? 'Agregar' : `Agregar ${selected.size}`}
                </Text>
            }
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.modalSearch}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar carta..."
          placeholderTextColor={palette.textMuted}
        />

        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color={palette.textSecondary} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={c => c.id}
            numColumns={3}
            columnWrapperStyle={{ justifyContent: 'flex-start' }}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id);
              const gameIcon = GAME_ICON[item.game];
              return (
                <TouchableOpacity
                  style={[styles.thumb, isSelected && { borderColor: folderColor, borderWidth: 2, backgroundColor: folderColor + '22' }]}
                  onPress={() => toggleCard(item.id)}
                  activeOpacity={0.7}
                >
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.thumbImg} contentFit="contain" />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Ionicons name={gameIcon.name} size={28} color={gameIcon.color} />
                    </View>
                  )}
                  <View style={styles.thumbFooter}>
                    {item.card_number && <Text style={styles.thumbNum}>#{item.card_number}</Text>}
                    <Text style={styles.thumbName} numberOfLines={1}>{item.card_name}</Text>
                  </View>
                  {item.quantity > 1 && !isSelected && (
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyText}>×{item.quantity}</Text>
                    </View>
                  )}
                  {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: folderColor }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  {search ? 'Sin resultados' : 'Todas tus cartas ya están en esta carpeta'}
                </Text>
              </View>
            }
            contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { padding: 8, paddingBottom: 20 }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function CardItem({ card, onPress, onLongPress, selected, selectionMode, currency = 'usd', usdToClp = 950 }: {
  card: CardCollectionWithPrice;
  onPress: () => void;
  onLongPress: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  currency?: import('@/types/database').Currency;
  usdToClp?: number;
}) {
  const styles = useStyles();
  const gameIcon = GAME_ICON[card.game];
  const price = effectivePrice(card, currency, usdToClp);
  return (
    <TouchableOpacity style={[styles.thumb, availabilityBorder(card), selected && styles.thumbSelected]} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      {card.image_url ? (
        <Image source={{ uri: card.image_url }} style={styles.thumbImg} contentFit="contain" />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Ionicons name={gameIcon.name} size={32} color={gameIcon.color} />
        </View>
      )}
      <View style={styles.thumbFooter}>
        {card.card_number && <Text style={styles.thumbNum}>#{card.card_number}</Text>}
        <Text style={styles.thumbName} numberOfLines={1}>{card.card_name}</Text>
        {price > 0 && <Text style={styles.thumbPrice}>{formatCurrencyValue(price, currency)}</Text>}
      </View>
      {card.quantity > 1 && (
        <View style={styles.qtyBadge}>
          <Text style={styles.qtyText}>×{card.quantity}</Text>
        </View>
      )}
      {selectionMode && (
        <View style={[styles.selCheckBadge, selected && styles.selCheckBadgeActive]}>
          {selected && <Ionicons name="checkmark" size={11} color="#fff" />}
        </View>
      )}
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 80 },
  back: { color: p.primary, fontSize: 15 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  folderDot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 17, fontWeight: '700', color: p.textPrimary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 80, justifyContent: 'flex-end' },
  headerIconBtn: { padding: 6 },
  subtitle: { color: p.textMuted, fontSize: 13, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  subtitleValue: { color: p.successAlt },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  sortLabel: { color: p.textMuted, fontSize: 12, fontWeight: '600' },
  sortChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: p.surface, borderWidth: 1, borderColor: p.border,
  },
  sortChipActive: { backgroundColor: p.primary, borderColor: p.primary },
  sortChipText: { color: p.textSecondary, fontSize: 12, fontWeight: '600' },
  sortChipTextActive: { color: '#fff' },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyTitle: { color: p.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: p.textMuted, fontSize: 14, textAlign: 'center' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: p.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: p.surfaceAlt, alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: p.textPrimary, padding: 16, paddingBottom: 8 },
  sheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: p.border,
  },
  sheetOptionText: { color: p.textPrimary, fontSize: 15, fontWeight: '600' },
  sheetOptionDesc: { color: p.textMuted, fontSize: 12, marginTop: 2 },

  selAllText: { color: p.primary, fontSize: 14, fontWeight: '600' },
  selCancelText: { color: p.textSecondary, fontSize: 14, fontWeight: '600' },
  selCheckBadge: {
    position: 'absolute', top: 6, left: 6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: p.bg, borderWidth: 1.5, borderColor: p.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  selCheckBadgeActive: { backgroundColor: p.primary, borderColor: p.primary },
  thumbSelected: { borderColor: p.primary, borderWidth: 2 },
  selectionActionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.border,
    flexDirection: 'row', padding: 12, paddingBottom: 28, gap: 6,
  },
  selActionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 12, gap: 4,
    backgroundColor: p.bg, borderWidth: 1, borderColor: p.border,
  },
  selActionBtnDanger: { borderColor: p.danger + '30' },
  selActionBtnDisabled: { opacity: 0.35 },
  selActionText: { color: p.textPrimary, fontSize: 11, fontWeight: '600' },
  selActionTextDisabled: { color: p.textMuted },
  noFoldersText: { color: p.textMuted, fontSize: 13, padding: 16, textAlign: 'center' },

  thumb: {
    width: CARD_WIDTH, margin: 4, alignItems: 'center',
    backgroundColor: p.surface, borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: p.border,
  },
  thumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  thumbPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 6,
    backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center',
  },
  thumbFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3 },
  thumbNum: { color: p.textMuted, fontSize: 9, fontWeight: '600', flexShrink: 0 },
  thumbName: { color: p.textPrimary, fontSize: 9, fontWeight: '600', flex: 1 },
  thumbPrice: { color: p.successAlt, fontSize: 9, fontWeight: '600', flexShrink: 0 },
  qtyBadge: {
    position: 'absolute', bottom: 28, right: 4,
    backgroundColor: p.surface, borderRadius: 8, borderWidth: 1, borderColor: p.border,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  qtyText: { color: p.textSecondary, fontSize: 9, fontWeight: '700' },
  checkBadge: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  modalContainer: { flex: 1, backgroundColor: p.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  modalCancel: { color: p.primary, fontSize: 15, minWidth: 70 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: p.textPrimary },
  modalSaveBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, minWidth: 70, alignItems: 'center' },
  modalSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalSearch: {
    margin: 12,
    backgroundColor: p.surface, borderWidth: 1, borderColor: p.border,
    borderRadius: 12, padding: 12, fontSize: 14, color: p.textPrimary,
  },
}));
