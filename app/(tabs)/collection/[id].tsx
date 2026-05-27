import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity,
  ScrollView, ActivityIndicator, Modal, FlatList,
  TextInput, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDialog } from '@/lib/AppDialog';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { patchCollectionCard, removeCollectionCard } from '@/lib/collectionRefresh';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { usePremium } from '@/lib/usePremium';
import { assertCanPublish } from '@/lib/publishGate';
import { uploadCardPhoto, deleteCardPhoto, MAX_CUSTOM_PHOTOS } from '@/lib/cardPhotos';
import { PhotoLightbox } from '@/lib/PhotoLightbox';
import * as ImagePicker from 'expo-image-picker';
import type { CardCollection, CollectionFolder, TCGGame, CardLanguage } from '@/types/database';
import { formatPrice, currencyLabel, convertCurrency } from '@/lib/currency';
import { getUsdToClp } from '@/lib/exchangeRate';
import { validateFolderGame, gameLabel } from '@/lib/folderValidation';
import { marketPriceUsd, type CardWithCatalog } from '@/lib/cardPrice';
import { makeStyles } from '@/lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const GAME_LABELS: Record<TCGGame, string> = {
  pokemon: 'Pokémon', magic: 'Magic: The Gathering', yugioh: 'Yu-Gi-Oh!',
  onepiece: 'One Piece', digimon: 'Digimon', lorcana: 'Lorcana', other: 'Otro',
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

const CONDITION_LABELS: Record<string, string> = {
  mint: 'Nueva', near_mint: 'Casi Nueva', excellent: 'Excelente',
  good: 'Buena', played: 'Jugada', poor: 'Dañada',
};

const CONDITIONS: { value: import('@/types/database').CardCondition; label: string }[] = [
  { value: 'mint', label: 'Nueva' },
  { value: 'near_mint', label: 'Casi Nueva' },
  { value: 'excellent', label: 'Excelente' },
  { value: 'good', label: 'Buena' },
  { value: 'played', label: 'Jugada' },
  { value: 'poor', label: 'Dañada' },
];

const LANGUAGES: { value: CardLanguage; label: string }[] = [
  { value: 'en', label: 'Inglés' },
  { value: 'es', label: 'Español' },
  { value: 'jp', label: 'Japonés' },
  { value: 'pt', label: 'Portugués' },
  { value: 'fr', label: 'Francés' },
  { value: 'de', label: 'Alemán' },
  { value: 'it', label: 'Italiano' },
  { value: 'ko', label: 'Coreano' },
  { value: 'other', label: 'Otro' },
];

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const { palette } = useTheme();
  const { isPremium } = usePremium();
  const currency = profile?.currency ?? 'usd';
  const router = useRouter();
  const dialog = useDialog();
  const styles = useStyles();
  type CardWithPrice = CardWithCatalog;
  const [card, setCard] = useState<CardWithPrice | null>(null);
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showConditionPicker, setShowConditionPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [imageZoom, setImageZoom] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [priceSaving, setPriceSaving] = useState(false);
  const [usdToClp, setUsdToClp] = useState<number | null>(null);
  const qtySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qtyTargetRef = useRef<number | null>(null);

  const fetchFolders = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('collection_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setFolders(data ?? []);
  }, [user]);

  useEffect(() => {
    Promise.all([
      supabase.from('cards_collection')
        .select('*, pokemon_cards(tcgplayer_normal_market, tcgplayer_foil_market), magic_cards(tcgplayer_normal_market, tcgplayer_foil_market)')
        .eq('id', id).single()
        .then(({ data }) => setCard(data as unknown as CardWithPrice)),
      fetchFolders(),
    ]).finally(() => setLoading(false));
  }, [id, fetchFolders]);

  useEffect(() => {
    if (currency !== 'clp') return;
    let mounted = true;
    getUsdToClp().then(r => {
      if (mounted) setUsdToClp(r);
    });
    return () => { mounted = false; };
  }, [currency]);

  useEffect(() => {
    if (!card) return;
    const val = card.price_reference;
    if (val == null) { setPriceInput(''); return; }
    const displayVal = convertCurrency(val, card.price_reference_currency, currency, usdToClp ?? 950);
    setPriceInput(currency === 'clp'
      ? String(Math.round(displayVal))
      : (displayVal % 1 === 0 ? String(displayVal) : displayVal.toFixed(2)));
  }, [card?.id, currency, usdToClp]);

  async function handleDelete() {
    dialog.confirm({
      title: 'Eliminar carta',
      message: '¿Estás seguro?',
      confirmText: 'Eliminar',
      destructive: true,
      onConfirm: async () => {
        await supabase.from('cards_collection').delete().eq('id', id);
        removeCollectionCard(id);
        const folderId = card?.folder_id;
        if (router.canGoBack()) {
          router.back();
        } else if (folderId) {
          router.replace(`/(tabs)/collection/folder/${folderId}`);
        } else {
          router.replace('/(tabs)/collection');
        }
      },
    });
  }

  async function toggleBoost() {
    if (!card) return;
    if (!isPremium) {
      dialog.confirm({
        title: 'Boost es Pro',
        message: 'Con Trocora Pro tus publicaciones aparecen primero en Explorar.',
        confirmText: 'Pasarme a Pro',
        cancelText: 'Más tarde',
        onConfirm: () => router.push('/paywall'),
      });
      return;
    }
    const newValue = !card.is_boosted;
    await supabase.from('cards_collection').update({ is_boosted: newValue }).eq('id', id);
    setCard(c => c ? { ...c, is_boosted: newValue } : c);
    patchCollectionCard(id, { is_boosted: newValue });
  }

  async function toggleField(field: 'is_published', value: boolean) {
    if (field === 'is_published' && value && user) {
      const ok = await assertCanPublish({
        userId: user.id,
        isPremium,
        addCount: 1,
        dialog,
        onUpgrade: () => router.push('/paywall'),
      });
      if (!ok) return;
    }
    await supabase.from('cards_collection').update({ [field]: value }).eq('id', id);
    setCard(c => c ? { ...c, [field]: value } : c);
    patchCollectionCard(id, { [field]: value });
  }

  async function savePrice() {
    setPriceSaving(true);
    const inputNum = priceInput.trim() ? parseFloat(priceInput) : null;
    const storeVal = inputNum !== null && !isNaN(inputNum) ? inputNum : null;
    const update = { price_reference: storeVal, price_reference_currency: currency };
    await supabase.from('cards_collection').update(update).eq('id', id);
    setCard(c => c ? { ...c, ...update } : c);
    patchCollectionCard(id, update);
    setPriceSaving(false);
  }

  async function clearToMarketPrice() {
    setPriceInput('');
    setPriceSaving(true);
    await supabase.from('cards_collection').update({ price_reference: null }).eq('id', id);
    setCard(c => c ? { ...c, price_reference: null } : c);
    patchCollectionCard(id, { price_reference: null });
    setPriceSaving(false);
  }

  async function saveCondition(condition: import('@/types/database').CardCondition) {
    await supabase.from('cards_collection').update({ condition }).eq('id', id);
    setCard(c => c ? { ...c, condition } : c);
    patchCollectionCard(id, { condition });
    setShowConditionPicker(false);
  }

  async function saveLanguage(language: CardLanguage) {
    await supabase.from('cards_collection').update({ language }).eq('id', id);
    setCard(c => c ? { ...c, language } : c);
    patchCollectionCard(id, { language });
    setShowLanguagePicker(false);
  }

  async function toggleFoil(value: boolean) {
    await supabase.from('cards_collection').update({ is_foil: value }).eq('id', id);
    setCard(c => c ? { ...c, is_foil: value } : c);
    patchCollectionCard(id, { is_foil: value });
  }

  function changeQty(delta: number) {
    setCard(c => {
      if (!c) return c;
      const next = Math.max(1, c.quantity + delta);
      if (next === c.quantity) return c;
      qtyTargetRef.current = next;
      if (qtySaveTimer.current) clearTimeout(qtySaveTimer.current);
      qtySaveTimer.current = setTimeout(async () => {
        const final = qtyTargetRef.current;
        if (final == null) return;
        patchCollectionCard(id, { quantity: final });
        await supabase.from('cards_collection').update({ quantity: final }).eq('id', id);
      }, 400);
      return { ...c, quantity: next };
    });
  }

  useEffect(() => () => { if (qtySaveTimer.current) clearTimeout(qtySaveTimer.current); }, []);

  async function assignFolder(folderId: string | null) {
    if (folderId && card) {
      const check = await validateFolderGame(folderId, [card.game]);
      if (!check.ok) {
        dialog.alert({ title: 'Carpeta de otro juego', message: `Esta carpeta solo acepta cartas de ${gameLabel(check.folderGame)}.` });
        return;
      }
    }
    await supabase.from('cards_collection').update({ folder_id: folderId }).eq('id', id);
    setCard(c => c ? { ...c, folder_id: folderId } : c);
    patchCollectionCard(id, { folder_id: folderId });
    setShowFolderPicker(false);
  }

  if (loading || authLoading) return <ActivityIndicator style={{ flex: 1 }} color={palette.textSecondary} />;
  if (!card) return null;

  const gameIcon = GAME_ICON[card.game];
  const currentFolder = folders.find(f => f.id === card.folder_id);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Volver</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color={palette.danger} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          {card.image_url ? (
            <TouchableOpacity onPress={() => setImageZoom(true)} activeOpacity={0.85}>
              <Image source={{ uri: card.image_url }} style={styles.heroImage} contentFit="contain" />
            </TouchableOpacity>
          ) : (
            <Ionicons name={gameIcon.name} size={72} color={gameIcon.color} style={styles.heroIcon} />
          )}
          <Text style={styles.heroName}>{card.card_name}</Text>
          <Text style={styles.heroGame}>{GAME_LABELS[card.game]}</Text>
          {card.is_foil && (
            <View style={styles.foilBadge}>
              <Ionicons name="star-outline" size={13} color="#93C5FD" />
              <Text style={styles.foilText}>Foil</Text>
            </View>
          )}
        </View>

        <View style={styles.details}>
          <DetailRow label="Set" value={card.set_name ?? '-'} />
          <DetailRow label="Número" value={card.card_number ?? '-'} />
          <TouchableOpacity style={styles.detailRow} onPress={() => setShowConditionPicker(true)}>
            <Text style={styles.detailLabel}>Condición</Text>
            <View style={styles.folderValue}>
              <Text style={styles.detailValue}>{CONDITION_LABELS[card.condition]}</Text>
              <Ionicons name="chevron-forward-outline" size={14} color={palette.textMuted} />
            </View>
          </TouchableOpacity>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Cantidad</Text>
            <View style={styles.qtyStepper}>
              <TouchableOpacity
                style={[styles.qtyBtn, card.quantity <= 1 && styles.qtyBtnDisabled]}
                onPress={() => changeQty(-1)}
                disabled={card.quantity <= 1}
                hitSlop={6}
              >
                <Ionicons name="remove" size={18} color={card.quantity <= 1 ? palette.textMuted : palette.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{card.quantity}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => changeQty(1)} hitSlop={6}>
                <Ionicons name="add" size={18} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={styles.detailRow} onPress={() => setShowLanguagePicker(true)}>
            <Text style={styles.detailLabel}>Idioma</Text>
            <View style={styles.folderValue}>
              <Text style={styles.detailValue}>
                {LANGUAGES.find(l => l.value === card.language)?.label ?? '—'}
              </Text>
              <Ionicons name="chevron-forward-outline" size={14} color={palette.textMuted} />
            </View>
          </TouchableOpacity>
          {(() => {
            const marketPrice = marketPriceUsd(card);
            return (
              <View style={styles.priceBlock}>
                {marketPrice != null && (
                  <View style={styles.marketRow}>
                    <Text style={styles.detailLabel}>Precio mercado</Text>
                    <Text style={styles.marketValue}>
                      {formatPrice(marketPrice, currency, usdToClp ?? 950)} {currencyLabel(currency)}
                    </Text>
                  </View>
                )}
                <View style={styles.myPriceRow}>
                  <Text style={styles.detailLabel}>Tu precio ({currencyLabel(currency)})</Text>
                  <View style={styles.myPriceInputRow}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={priceInput}
                      onChangeText={setPriceInput}
                      keyboardType="decimal-pad"
                      placeholder={marketPrice != null
                        ? (currency === 'clp'
                            ? String(Math.round(marketPrice * (usdToClp ?? 950)))
                            : (marketPrice % 1 === 0 ? String(marketPrice) : marketPrice.toFixed(2)))
                        : (currency === 'clp' ? '0' : '0.00')}
                      placeholderTextColor={palette.textMuted}
                      returnKeyType="done"
                      onSubmitEditing={savePrice}
                      selectionColor={palette.primary}
                      underlineColorAndroid="transparent"
                    />
                    <TouchableOpacity onPress={savePrice} disabled={priceSaving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      {priceSaving
                        ? <ActivityIndicator size="small" color={palette.textSecondary} />
                        : <Ionicons name="checkmark-circle-outline" size={22} color={palette.primary} />}
                    </TouchableOpacity>
                  </View>
                </View>
                {marketPrice != null && card.price_reference != null && (
                  <TouchableOpacity style={styles.useMarketRow} onPress={clearToMarketPrice}>
                    <Ionicons name="trending-up-outline" size={13} color={palette.primary} />
                    <Text style={styles.useMarketText}>Usar precio de mercado</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}
          <TouchableOpacity style={styles.detailRow} onPress={() => setShowFolderPicker(true)}>
            <Text style={styles.detailLabel}>Carpeta</Text>
            <View style={styles.folderValue}>
              {currentFolder ? (
                <>
                  <View style={[styles.folderDot, { backgroundColor: currentFolder.color }]} />
                  <Text style={styles.detailValue}>{currentFolder.name}</Text>
                </>
              ) : (
                <Text style={[styles.detailValue, { color: palette.textMuted }]}>Sin carpeta</Text>
              )}
              <Ionicons name="chevron-forward-outline" size={14} color={palette.textMuted} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.switches}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelRow}>
              <Ionicons name="star-outline" size={16} color="#93C5FD" />
              <Text style={styles.switchLabel}>Foil / Holo</Text>
            </View>
            <Switch
              value={card.is_foil}
              onValueChange={toggleFoil}
              trackColor={{ true: '#3B82F6' }}
            />
          </View>
          <View style={[styles.switchRow, card.is_published ? null : styles.switchRowLast]}>
            <View style={styles.switchLabelRow}>
              <Ionicons name="pricetag-outline" size={16} color={palette.successAlt} />
              <Text style={styles.switchLabel}>Publicar</Text>
            </View>
            <Switch
              value={card.is_published}
              onValueChange={v => toggleField('is_published', v)}
              trackColor={{ true: palette.primary }}
            />
          </View>
          {card.is_published && (
            <TouchableOpacity
              style={[styles.switchRow, styles.switchRowLast]}
              onPress={toggleBoost}
              activeOpacity={0.7}
            >
              <View style={[styles.switchLabelRow, { flex: 1, marginRight: 12 }]}>
                <Ionicons name="rocket" size={16} color={palette.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Boost en Explorar</Text>
                  <Text style={styles.switchHint} numberOfLines={2}>
                    {isPremium
                      ? 'Tu carta aparece primero en la grilla'
                      : 'Función Pro · aparece primero en Explorar'}
                  </Text>
                </View>
              </View>
              {isPremium ? (
                <Switch
                  value={card.is_boosted}
                  onValueChange={() => toggleBoost()}
                  trackColor={{ true: palette.warning }}
                />
              ) : (
                <View style={styles.proLock}>
                  <Ionicons name="star" size={11} color={palette.warning} />
                  <Text style={styles.proLockText}>Pro</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        <CardPhotosSection
          card={card}
          isPremium={isPremium}
          onChange={(photos) => setCard(c => c ? { ...c, custom_photos: photos } : c)}
        />

        {card.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notas</Text>
            <Text style={styles.notesText}>{card.notes}</Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showConditionPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowConditionPicker(false)} activeOpacity={1}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Condición</Text>
            <FlatList
              data={CONDITIONS}
              keyExtractor={item => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.folderOption, card.condition === item.value && styles.folderOptionActive]}
                  onPress={() => saveCondition(item.value)}
                >
                  <Text style={styles.folderOptionText}>{item.label}</Text>
                  {card.condition === item.value && (
                    <Ionicons name="checkmark-outline" size={18} color={palette.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showLanguagePicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowLanguagePicker(false)} activeOpacity={1}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Idioma</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={item => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.folderOption, card.language === item.value && styles.folderOptionActive]}
                  onPress={() => saveLanguage(item.value)}
                >
                  <Text style={styles.folderOptionText}>{item.label}</Text>
                  {card.language === item.value && (
                    <Ionicons name="checkmark-outline" size={18} color={palette.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showFolderPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowFolderPicker(false)} activeOpacity={1}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Mover a carpeta</Text>
            <FlatList
              data={[{ id: null as string | null, name: 'Sin carpeta', color: palette.textMuted }, ...folders]}
              keyExtractor={item => item.id ?? 'none'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.folderOption, card.folder_id === item.id && styles.folderOptionActive]}
                  onPress={() => assignFolder(item.id)}
                >
                  <View style={[styles.folderOptionDot, { backgroundColor: item.color }]} />
                  <Text style={styles.folderOptionText}>{item.name}</Text>
                  {card.folder_id === item.id && (
                    <Ionicons name="checkmark-outline" size={18} color={palette.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={imageZoom} transparent animationType="fade" onRequestClose={() => setImageZoom(false)}>
        <TouchableOpacity style={styles.zoomOverlay} activeOpacity={1} onPress={() => setImageZoom(false)}>
          {card.image_url && (
            <Image source={{ uri: card.image_url }} style={styles.zoomImage} contentFit="contain" />
          )}
          <TouchableOpacity style={styles.zoomClose} onPress={() => setImageZoom(false)} hitSlop={12}>
            <Ionicons name="close" size={28} color={palette.textPrimary} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function CardPhotosSection({
  card, isPremium, onChange,
}: {
  card: CardCollection;
  isPremium: boolean;
  onChange: (photos: string[]) => void;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const { palette } = useTheme();
  const styles = useStyles();
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const photos = card.custom_photos ?? [];

  async function addPhoto() {
    if (!isPremium) {
      dialog.confirm({
        title: 'Fotos propias son Pro',
        message: 'Con Trocora Pro puedes subir hasta 5 fotos reales de tu carta para mostrar su estado.',
        confirmText: 'Pasarme a Pro',
        cancelText: 'Más tarde',
        onConfirm: () => router.push('/paywall'),
      });
      return;
    }
    if (photos.length >= MAX_CUSTOM_PHOTOS) {
      dialog.alert({ title: 'Máximo alcanzado', message: `Puedes subir hasta ${MAX_CUSTOM_PHOTOS} fotos por carta.` });
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      dialog.alert({ title: 'Permiso requerido', message: 'Necesitamos acceso a tu galería.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    const asset = result.assets[0];
    const res = await uploadCardPhoto({ userId: card.user_id, cardId: card.id, uri: asset.uri });
    if ('error' in res) {
      setUploading(false);
      dialog.alert({ title: 'Error', message: res.error });
      return;
    }
    const next = [...photos, res.url];
    const { error: upErr } = await supabase
      .from('cards_collection')
      .update({ custom_photos: next })
      .eq('id', card.id);
    setUploading(false);
    if (upErr) { dialog.alert({ title: 'Error', message: upErr.message }); return; }
    onChange(next);
  }

  function confirmDelete(index: number) {
    dialog.confirm({
      title: 'Eliminar foto',
      message: '¿Borrar esta foto?',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      destructive: true,
      onConfirm: () => deletePhotoAt(index),
    });
  }

  async function deletePhotoAt(index: number) {
    const url = photos[index];
    if (!url) return;
    const next = photos.filter((_, i) => i !== index);
    const { error: upErr } = await supabase
      .from('cards_collection')
      .update({ custom_photos: next })
      .eq('id', card.id);
    if (upErr) { dialog.alert({ title: 'Error', message: upErr.message }); return; }
    onChange(next);
    void deleteCardPhoto(url);
  }

  if (!isPremium && photos.length === 0 && !card.is_published) return null;

  return (
    <View style={styles.photosSection}>
      <View style={styles.photosHeader}>
        <Text style={styles.photosTitle}>
          Fotos propias {photos.length > 0 ? `(${photos.length}/${MAX_CUSTOM_PHOTOS})` : ''}
        </Text>
        {!isPremium && photos.length === 0 && (
          <View style={styles.proLock}>
            <Ionicons name="star" size={11} color={palette.warning} />
            <Text style={styles.proLockText}>Pro</Text>
          </View>
        )}
      </View>
      <Text style={styles.photosHint}>
        {photos.length === 0
          ? isPremium
            ? 'Muestra el estado real de tu carta con fotos propias.'
            : 'Función Pro · sube fotos reales para generar más confianza.'
          : 'Toca una foto para ampliarla. Mantenlas actualizadas.'}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosScroll}>
        {photos.map((url, i) => (
          <TouchableOpacity
            key={`${url}-${i}`}
            style={styles.photoTile}
            onPress={() => setLightboxIndex(i)}
            onLongPress={() => confirmDelete(i)}
            activeOpacity={0.85}
          >
            <Image source={{ uri: url }} style={styles.photoImg} contentFit="cover" />
            <TouchableOpacity
              style={styles.photoDelete}
              onPress={() => confirmDelete(i)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close-circle" size={20} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
        {photos.length < MAX_CUSTOM_PHOTOS && (
          <TouchableOpacity
            style={[styles.photoTile, styles.photoAdd]}
            onPress={addPhoto}
            disabled={uploading}
            activeOpacity={0.7}
          >
            {uploading ? (
              <ActivityIndicator color={palette.textSecondary} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={28} color={palette.textSecondary} />
                <Text style={styles.photoAddText}>Agregar</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      <PhotoLightbox
        visible={lightboxIndex !== null}
        photos={photos}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />
    </View>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, highlight && styles.detailValueHighlight]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((p) => ({
  container: { flex: 1, backgroundColor: p.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  back: { color: p.primary, fontSize: 15 },
  scroll: { flex: 1 },
  heroCard: {
    alignItems: 'center', padding: 32,
    borderBottomWidth: 1, borderBottomColor: p.surface,
  },
  heroImage: { width: 180, height: 252, borderRadius: 10, marginBottom: 16 },
  heroIcon: { marginBottom: 12 },
  zoomOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  zoomImage: { width: '92%', aspectRatio: 0.715, borderRadius: 12 },
  zoomClose: { position: 'absolute', top: 50, right: 20, padding: 8 },
  heroName: { fontSize: 22, fontWeight: '800', color: p.textPrimary, textAlign: 'center' },
  heroGame: { fontSize: 14, color: p.textMuted, marginTop: 4 },
  foilBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, backgroundColor: '#1E3A5F',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4,
  },
  foilText: { color: '#93C5FD', fontSize: 13, fontWeight: '600' },
  details: {
    margin: 16, backgroundColor: p.surface,
    borderRadius: 12, borderWidth: 1, borderColor: p.border,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: p.border,
  },
  detailLabel: { color: p.textMuted, fontSize: 14 },
  detailValue: { color: p.textPrimary, fontSize: 14, fontWeight: '600' },
  detailValueHighlight: { color: p.successAlt },
  priceBlock: { borderBottomWidth: 1, borderBottomColor: p.border },
  marketRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.border,
  },
  marketValue: { color: p.successAlt, fontSize: 14, fontWeight: '600' },
  myPriceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  myPriceInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencySymbol: { color: p.textSecondary, fontSize: 14, fontWeight: '600' },
  priceInput: {
    color: p.textPrimary, fontSize: 14, fontWeight: '600',
    width: 110, textAlign: 'right', paddingVertical: 4, paddingHorizontal: 8,
    backgroundColor: p.bg, borderRadius: 8, borderWidth: 1, borderColor: p.border,
  },
  useMarketRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  useMarketText: { color: p.primary, fontSize: 12, fontWeight: '600' },
  folderValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  folderDot: { width: 8, height: 8, borderRadius: 4 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: p.bg, borderWidth: 1, borderColor: p.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnDisabled: { opacity: 0.4 },
  qtyValue: { color: p.textPrimary, fontSize: 16, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  switches: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: p.surface, borderRadius: 12, borderWidth: 1, borderColor: p.border,
  },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: p.border,
  },
  switchRowLast: { borderBottomWidth: 0 },
  switchLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { color: p.textPrimary, fontSize: 14 },
  switchHint: { color: p.textMuted, fontSize: 11, marginTop: 2 },

  photosSection: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: p.surface, borderRadius: 12,
    borderWidth: 1, borderColor: p.border,
    padding: 14,
  },
  photosHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  photosTitle: { color: p.textPrimary, fontSize: 14, fontWeight: '700' },
  photosHint: { color: p.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  photosScroll: { gap: 8, paddingTop: 12 },
  photoTile: {
    width: 100, height: 100, borderRadius: 10,
    backgroundColor: p.bg, borderWidth: 1, borderColor: p.border,
    overflow: 'hidden', position: 'relative',
  },
  photoImg: { width: '100%', height: '100%' },
  photoDelete: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12,
  },
  photoAdd: {
    alignItems: 'center', justifyContent: 'center',
    borderStyle: 'dashed',
  },
  photoAddText: { color: p.textSecondary, fontSize: 11, marginTop: 4, fontWeight: '600' },
  proLock: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.5)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  proLockText: { color: p.warning, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  notes: { margin: 16, backgroundColor: p.surface, borderRadius: 12, padding: 14 },
  notesLabel: { color: p.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  notesText: { color: p.textPrimary, fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: p.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32, maxHeight: '60%',
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: p.surfaceAlt, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: p.textPrimary, padding: 16, paddingBottom: 8 },
  folderOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderBottomWidth: 1, borderBottomColor: p.border,
  },
  folderOptionActive: { backgroundColor: p.bg },
  folderOptionDot: { width: 12, height: 12, borderRadius: 6 },
  folderOptionText: { flex: 1, color: p.textPrimary, fontSize: 15 },
}));
