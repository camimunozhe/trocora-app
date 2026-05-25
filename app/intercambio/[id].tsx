import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { resolveEnabledGames } from '@/lib/enabledGames';
import type { Meetup, CardCollection, CollectionFolder, Message, TCGGame } from '@/types/database';
import { FolderIcon } from '@/lib/folderIcon';
import { ProBadge } from '@/lib/ProBadge';

type CardWithMeta = CardCollection & {
  meetup_card_id: string;
  side: 'proposer' | 'receiver';
};

type MeetupFull = Meetup & {
  proposer: { username: string; avatar_url: string | null; created_at: string; premium_status: string | null } | null;
  receiver: { username: string; avatar_url: string | null; created_at: string; premium_status: string | null } | null;
};

function memberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const month = d.toLocaleDateString('es', { month: 'short' }).replace('.', '');
  return `Miembro desde ${month} ${d.getFullYear()}`;
}

type ZoomedCard = {
  id: string;
  card_name: string;
  set_name: string | null;
  image_url: string | null;
};

type CardInfo = { id: string; name: string; img: string | null; side: 'proposer' | 'receiver' };
type Snapshot = {
  event: 'proposed' | 'modified';
  added: CardInfo[];
  removed: CardInfo[];
};

function parseSnapshot(body: string): Snapshot | null {
  const prefix = '__TRADE_SNAPSHOT__:';
  if (!body.startsWith(prefix)) return null;
  try {
    const parsed = JSON.parse(body.slice(prefix.length));
    if (!parsed || typeof parsed.event !== 'string') return null;
    // Legacy snapshot format used a "cards" array — treat as everything added
    if (Array.isArray(parsed.cards) && !Array.isArray(parsed.added)) {
      return { event: parsed.event, added: parsed.cards, removed: [] };
    }
    if (Array.isArray(parsed.added) && Array.isArray(parsed.removed)) {
      return parsed as Snapshot;
    }
    return null;
  } catch {
    return null;
  }
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendiente',  color: '#FACC15' },
  countered: { label: 'Pendiente',  color: '#FACC15' },
  confirmed: { label: 'Confirmado', color: '#4ADE80' },
  completed: { label: 'Completado', color: '#64748B' },
  cancelled: { label: 'Cancelado',  color: '#EF4444' },
};

export default function EncuentroDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const router = useRouter();

  const [meetup, setMeetup] = useState<MeetupFull | null>(null);
  const [cards, setCards] = useState<CardWithMeta[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Chat
  const [messageDraft, setMessageDraft] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Card zoom + summary
  const [zoomedCard, setZoomedCard] = useState<ZoomedCard | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [myCollection, setMyCollection] = useState<CardCollection[]>([]);
  const [myFolders, setMyFolders] = useState<CollectionFolder[]>([]);
  const [editMyCardIds, setEditMyCardIds] = useState<Set<string>>(new Set());
  const [counterPrice, setCounterPrice] = useState('');

  // Rating
  const [myRating, setMyRating] = useState<'positive' | 'negative' | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [ratingChoice, setRatingChoice] = useState<'positive' | 'negative' | null>(null);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const load = useCallback(async () => {
    const [meetupRes, cardsRes, messagesRes, ratingRes] = await Promise.all([
      supabase
        .from('meetups')
        .select('*, proposer:proposer_id(username, avatar_url, created_at, premium_status), receiver:receiver_id(username, avatar_url, created_at, premium_status)')
        .eq('id', id)
        .single(),
      supabase
        .from('meetup_cards')
        .select('id, side, card_id, cards_collection(*, id)')
        .eq('meetup_id', id),
      supabase
        .from('messages')
        .select('*')
        .eq('meetup_id', id)
        .order('created_at', { ascending: true }),
      user
        ? supabase
            .from('meetup_ratings')
            .select('rating')
            .eq('meetup_id', id)
            .eq('rater_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setMeetup(meetupRes.data as MeetupFull);
    const mapped: CardWithMeta[] = ((cardsRes.data ?? []) as any[]).map(row => ({
      ...(row.cards_collection as CardCollection),
      meetup_card_id: row.id,
      side: row.side,
    }));
    setCards(mapped);
    setMessages((messagesRes.data ?? []) as Message[]);
    const rate = (ratingRes as any)?.data?.rating ?? null;
    setMyRating(rate);
  }, [id, user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Jump to the bottom of the chat once everything is loaded
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    return () => clearTimeout(t);
  }, [loading]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`meetup-messages:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `meetup_id=eq.${id}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#0F172A' }} color="#94A3B8" />;
  if (!meetup) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/encuentros')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={24} color="#6366F1" />
          </TouchableOpacity>
          <Text style={styles.headerUsername}>Intercambio</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <Ionicons name="alert-circle-outline" size={48} color="#475569" />
          <Text style={{ color: '#94A3B8', fontSize: 15, textAlign: 'center', maxWidth: 280 }}>
            No encontramos este intercambio. Puede que haya sido eliminado o ya no tengas acceso.
          </Text>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/encuentros')}
            style={{ marginTop: 8, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}
          >
            <Text style={{ color: '#A5B4FC', fontSize: 14, fontWeight: '600' }}>Volver a intercambios</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isProposer = meetup.proposer_id === user?.id;
  const other = isProposer ? meetup.receiver : meetup.proposer;
  const otherId = isProposer ? meetup.receiver_id : meetup.proposer_id;
  const myCards = cards.filter(c => c.side === (isProposer ? 'proposer' : 'receiver'));
  const theirCards = cards.filter(c => c.side === (isProposer ? 'receiver' : 'proposer'));
  const status = STATUS_LABEL[meetup.status] ?? { label: meetup.status, color: '#94A3B8' };
  const canRespond = !isProposer && meetup.status === 'pending';
  const canEdit = meetup.status === 'pending';
  const isConfirmed = meetup.status === 'confirmed';
  const isCompleted = meetup.status === 'completed';
  const canRate = isCompleted && !myRating && !!user && !!otherId;
  const myCheckedIn = isProposer ? meetup.proposer_checked_in : meetup.receiver_checked_in;
  const chatEnabled = meetup.status !== 'cancelled';

  async function openEditModal() {
    if (!user) return;
    setShowEdit(true);
    setLoadingEdit(true);

    const enabled = resolveEnabledGames(profile?.enabled_games);
    const meetupGame = cards[0]?.game;
    const gameFilter = meetupGame ? [meetupGame] : enabled;
    const [cardsRes, foldersRes] = await Promise.all([
      supabase
        .from('cards_collection')
        .select('*')
        .eq('user_id', user.id)
        .in('game', gameFilter)
        .order('card_name'),
      supabase
        .from('collection_folders')
        .select('*')
        .eq('user_id', user.id)
        .order('name'),
    ]);

    setMyCollection(cardsRes.data ?? []);
    setMyFolders(foldersRes.data ?? []);
    setEditMyCardIds(new Set(myCards.map(c => c.id)));
    setCounterPrice(meetup!.agreed_price?.toString() ?? '');
    setLoadingEdit(false);
  }

  async function submitEdit() {
    setSaving(true);
    const price = counterPrice.trim() ? parseFloat(counterPrice) : null;
    const mySide: 'proposer' | 'receiver' = isProposer ? 'proposer' : 'receiver';

    await supabase.from('meetups').update({
      agreed_price: price,
      agreed_price_currency: profile?.currency ?? 'usd',
      agreed_price_payer: price != null ? mySide : null,
      last_modified_by: user?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    // Only touch my own side — the other side stays as is
    await supabase.from('meetup_cards').delete().eq('meetup_id', id).eq('side', mySide);

    const newMyIds = Array.from(editMyCardIds);
    if (newMyIds.length > 0) {
      await supabase.from('meetup_cards').insert(
        newMyIds.map(cardId => ({ meetup_id: id, card_id: cardId, side: mySide })),
      );
    }

    const previousMySideIds = new Set(myCards.map(c => c.id));
    const newMyIdSet = new Set(newMyIds);

    const added: CardInfo[] = newMyIds
      .filter(cid => !previousMySideIds.has(cid))
      .map(cid => myCollection.find(c => c.id === cid))
      .filter((c): c is CardCollection => !!c)
      .map(c => ({ id: c.id, name: c.card_name, img: c.image_url, side: mySide }));

    const removed: CardInfo[] = myCards
      .filter(c => !newMyIdSet.has(c.id))
      .map(c => ({ id: c.id, name: c.card_name, img: c.image_url, side: mySide }));

    if (added.length > 0 || removed.length > 0) {
      const snapshotBody = `__TRADE_SNAPSHOT__:${JSON.stringify({ event: 'modified', added, removed })}`;
      await supabase.from('messages').insert({
        meetup_id: id,
        sender_id: user!.id,
        body: snapshotBody,
      });
    }

    await load();
    setShowEdit(false);
    setSaving(false);
  }

  async function updateStatus(newStatus: string) {
    setSaving(true);
    await supabase.from('meetups').update({
      status: newStatus,
      last_modified_by: user?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setMeetup(m => m ? { ...m, status: newStatus as any } : m);
    setSaving(false);
  }

  async function checkIn() {
    setSaving(true);
    const field = isProposer ? 'proposer_checked_in' : 'receiver_checked_in';
    await supabase.from('meetups').update({ [field]: true }).eq('id', id);

    const { data: updated } = await supabase
      .from('meetups')
      .select('proposer_checked_in, receiver_checked_in')
      .eq('id', id)
      .single();

    if (updated?.proposer_checked_in && updated?.receiver_checked_in) {
      await supabase.rpc('transfer_trade_cards', { p_meetup_id: id });
      await supabase.from('meetups').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
    }

    await load();
    setSaving(false);
  }

  function openRating() {
    setRatingChoice(null);
    setRatingComment('');
    setShowRating(true);
  }

  async function submitRating() {
    if (!ratingChoice || !user || !otherId) return;
    setSubmittingRating(true);
    const { error } = await supabase.from('meetup_ratings').insert({
      meetup_id: id as string,
      rater_id: user.id,
      rated_id: otherId,
      rating: ratingChoice,
      comment: ratingComment.trim() ? ratingComment.trim() : null,
    });
    setSubmittingRating(false);
    if (error) {
      Alert.alert('No se pudo enviar', error.message);
      return;
    }
    setMyRating(ratingChoice);
    setShowRating(false);
  }

  async function sendMessage() {
    const body = messageDraft.trim();
    if (!body || sendingMsg || !user) return;
    setSendingMsg(true);
    setMessageDraft('');
    const { error } = await supabase.from('messages').insert({
      meetup_id: id,
      sender_id: user.id,
      body,
    });
    if (error) {
      setMessageDraft(body);
      Alert.alert('No se pudo enviar', error.message);
    }
    setSendingMsg(false);
  }

  function toggleMy(cardId: string) {
    setEditMyCardIds(prev => { const s = new Set(prev); s.has(cardId) ? s.delete(cardId) : s.add(cardId); return s; });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/encuentros')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color="#6366F1" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerUser}
          onPress={() => {
            const otherId = isProposer ? meetup.receiver_id : meetup.proposer_id;
            if (otherId) router.push({ pathname: '/user/[id]', params: { id: otherId } });
          }}
          activeOpacity={0.7}
        >
          <View style={styles.headerAvatar}>
            {other?.avatar_url
              ? <Image source={{ uri: other.avatar_url }} style={styles.headerAvatarImg} />
              : <Ionicons name="person-outline" size={16} color="#64748B" />}
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.headerUsernameRow}>
              <Text style={styles.headerUsername} numberOfLines={1}>@{other?.username ?? '—'}</Text>
              <ProBadge status={other?.premium_status as any} />
            </View>
            <Text style={styles.headerRole}>
              {isProposer ? 'Receptor' : 'Proponente'}
              {memberSince(other?.created_at) ? ` · ${memberSince(other?.created_at)}` : ''}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowSummary(true)}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          style={styles.detailBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="reader-outline" size={14} color="#A5B4FC" />
          <Text style={styles.detailBtnText}>Detalle</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >

          {/* Chat (initial note lives as a synthetic first bubble; snapshots come from messages) */}
          {(meetup.notes || messages.length > 0) && (
            <View style={{ gap: 6 }}>
              {meetup.notes && (
                <MessageBubble
                  message={{
                    id: 'initial-note',
                    meetup_id: meetup.id,
                    sender_id: meetup.proposer_id,
                    body: meetup.notes,
                    created_at: meetup.created_at,
                  }}
                  isMine={meetup.proposer_id === user?.id}
                />
              )}
              {messages.map(msg => {
                const snapshot = parseSnapshot(msg.body);
                if (snapshot) {
                  return (
                    <TradeSnapshotBubble
                      key={msg.id}
                      message={msg}
                      snapshot={snapshot}
                      isMine={msg.sender_id === user?.id}
                      isProposer={isProposer}
                      onZoom={c => setZoomedCard(c)}
                    />
                  );
                }
                return (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isMine={msg.sender_id === user?.id}
                  />
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Compact action bar (above the input) */}
        {(canRespond || canEdit || isConfirmed || isCompleted) && (
          <View style={styles.actionBar}>
            {canRate && (
              <CompactAction icon="thumbs-up-outline" label="Calificar" color="#6366F1" onPress={openRating} disabled={saving} />
            )}
            {isCompleted && myRating && (
              <View style={styles.ratedBadge}>
                <Ionicons
                  name={myRating === 'positive' ? 'thumbs-up' : 'thumbs-down'}
                  size={14}
                  color={myRating === 'positive' ? '#4ADE80' : '#EF4444'}
                />
                <Text style={styles.ratedBadgeText}>
                  Ya calificaste a @{other?.username ?? '—'}
                </Text>
              </View>
            )}
            {canRespond && (
              <>
                <CompactAction icon="checkmark-outline" label="Aceptar" color="#22C55E" onPress={() => updateStatus('confirmed')} disabled={saving} />
                <CompactAction icon="git-compare-outline" label="Modificar" color="#6366F1" onPress={openEditModal} disabled={saving} />
                <CompactAction icon="close-outline" label="Rechazar" color="#EF4444" onPress={() => Alert.alert('Rechazar', '¿Rechazar este intercambio?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Rechazar', style: 'destructive', onPress: () => updateStatus('cancelled') },
                ])} disabled={saving} />
              </>
            )}
            {isProposer && canEdit && (
              <>
                <CompactAction icon="git-compare-outline" label="Modificar" color="#6366F1" onPress={openEditModal} disabled={saving} />
                <CompactAction icon="close-outline" label="Cancelar" color="#EF4444" onPress={() => Alert.alert('Cancelar', '¿Cancelar este intercambio?', [
                  { text: 'Volver', style: 'cancel' },
                  { text: 'Cancelar intercambio', style: 'destructive', onPress: () => updateStatus('cancelled') },
                ])} disabled={saving} />
              </>
            )}
            {isConfirmed && !myCheckedIn && (
              <CompactAction icon="qr-code-outline" label="Check-in" color="#6366F1" onPress={checkIn} disabled={saving} />
            )}
            {isConfirmed && myCheckedIn && (
              <View style={styles.checkedInCompact}>
                <Ionicons name="checkmark-circle" size={14} color="#4ADE80" />
                <Text style={styles.checkedInCompactText}>Check-in registrado — esperando al otro</Text>
              </View>
            )}
          </View>
        )}

        {/* Chat input fixed at the bottom */}
        {chatEnabled && (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.chatInput}
              value={messageDraft}
              onChangeText={setMessageDraft}
              placeholder="Escribe un mensaje…"
              placeholderTextColor="#475569"
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendIconBtn, (!messageDraft.trim() || sendingMsg) && styles.sendIconBtnDisabled]}
              onPress={sendMessage}
              disabled={!messageDraft.trim() || sendingMsg}
            >
              {sendingMsg
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <SummaryModal
        visible={showSummary}
        onClose={() => setShowSummary(false)}
        proposer={{
          username: meetup.proposer?.username ?? '—',
          avatar_url: meetup.proposer?.avatar_url ?? null,
          isMe: isProposer,
        }}
        receiver={{
          username: meetup.receiver?.username ?? '—',
          avatar_url: meetup.receiver?.avatar_url ?? null,
          isMe: !isProposer,
        }}
        proposerSideCards={cards.filter(c => c.side === 'proposer')}
        receiverSideCards={cards.filter(c => c.side === 'receiver')}
        price={meetup.agreed_price}
        priceCurrency={meetup.agreed_price_currency}
        pricePayer={meetup.agreed_price_payer}
        counterNotes={meetup.counter_notes}
        statusLabel={status.label}
        statusColor={status.color}
        onZoom={c => setZoomedCard({ id: c.id, card_name: c.card_name, set_name: c.set_name, image_url: c.image_url })}
      />

      <CardZoomModal card={zoomedCard} onClose={() => setZoomedCard(null)} />

      {/* ── Edit / Counter-propose modal ── */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaProvider>
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowEdit(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-outline" size={26} color="#94A3B8" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Modificar intercambio</Text>
            <TouchableOpacity
              style={[styles.sendBtn, (saving || loadingEdit) && { opacity: 0.5 }]}
              onPress={submitEdit}
              disabled={saving || loadingEdit}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.sendBtnText}>Enviar</Text>}
            </TouchableOpacity>
          </View>

          {loadingEdit ? (
            <ActivityIndicator style={{ flex: 1 }} color="#94A3B8" />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>

              <View>
                <Text style={styles.editTitle}>Tus cartas en el intercambio</Text>
                <Text style={styles.editSub}>
                  {editMyCardIds.size} seleccionada{editMyCardIds.size !== 1 ? 's' : ''}
                </Text>
                {myCollection.length === 0 ? (
                  <Text style={styles.emptyCol}>No tienes cartas en tu colección</Text>
                ) : (
                  <FoldersGrid
                    cards={myCollection}
                    folders={myFolders}
                    selectedIds={editMyCardIds}
                    onToggle={toggleMy}
                    meetupGame={(cards[0]?.game ?? null) as TCGGame | null}
                  />
                )}
              </View>

              {(meetup.type === 'purchase' || meetup.agreed_price != null) && (
                <View>
                  <Text style={styles.editTitle}>
                    Precio ({(profile?.currency ?? 'usd').toUpperCase()})
                  </Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={counterPrice}
                    onChangeText={setCounterPrice}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#475569"
                  />
                </View>
              )}

            </ScrollView>
          )}
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      {/* Rating modal */}
      <Modal visible={showRating} transparent animationType="fade" onRequestClose={() => setShowRating(false)}>
        <TouchableOpacity style={styles.ratingOverlay} activeOpacity={1} onPress={() => setShowRating(false)}>
          <View style={styles.ratingSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.ratingTitle}>Calificar intercambio</Text>
            <Text style={styles.ratingSub}>¿Cómo fue tu experiencia con @{other?.username ?? '—'}?</Text>

            <View style={styles.ratingChoices}>
              <TouchableOpacity
                style={[styles.ratingChoice, ratingChoice === 'positive' && styles.ratingChoicePositiveActive]}
                onPress={() => setRatingChoice('positive')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={ratingChoice === 'positive' ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={32}
                  color={ratingChoice === 'positive' ? '#4ADE80' : '#94A3B8'}
                />
                <Text style={[styles.ratingChoiceText, ratingChoice === 'positive' && { color: '#4ADE80' }]}>Buena</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.ratingChoice, ratingChoice === 'negative' && styles.ratingChoiceNegativeActive]}
                onPress={() => setRatingChoice('negative')}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={ratingChoice === 'negative' ? 'thumbs-down' : 'thumbs-down-outline'}
                  size={32}
                  color={ratingChoice === 'negative' ? '#EF4444' : '#94A3B8'}
                />
                <Text style={[styles.ratingChoiceText, ratingChoice === 'negative' && { color: '#EF4444' }]}>Mala</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.ratingComment}
              value={ratingComment}
              onChangeText={setRatingComment}
              placeholder="Comentario (opcional)"
              placeholderTextColor="#475569"
              multiline
              maxLength={300}
            />

            <View style={styles.ratingActions}>
              <TouchableOpacity style={styles.ratingCancel} onPress={() => setShowRating(false)} disabled={submittingRating}>
                <Text style={styles.ratingCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ratingSubmit, (!ratingChoice || submittingRating) && styles.ratingSubmitDisabled]}
                onPress={submitRating}
                disabled={!ratingChoice || submittingRating}
              >
                {submittingRating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.ratingSubmitText}>Enviar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function CompactAction({ icon, label, color, onPress, disabled }: {
  icon: any; label: string; color: string;
  onPress: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.compactAction, { borderColor: color + '55' }, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.compactActionText, { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function MessageBubble({ message, isMine }: { message: Message; isMine: boolean }) {
  const time = new Date(message.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>{message.body}</Text>
        <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs]}>{time}</Text>
      </View>
    </View>
  );
}

function FoldersGrid({ cards, folders, selectedIds, onToggle, meetupGame }: {
  cards: CardCollection[];
  folders: CollectionFolder[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  meetupGame: TCGGame | null;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleFolder = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const groups: { key: string; folder: CollectionFolder | null; cards: CardCollection[] }[] = [];
  for (const folder of folders) {
    const folderCards = cards.filter(c => c.folder_id === folder.id);
    if (folderCards.length > 0) groups.push({ key: folder.id, folder, cards: folderCards });
  }
  const looseCards = cards.filter(c => !c.folder_id);
  if (looseCards.length > 0) groups.push({ key: 'loose', folder: null, cards: looseCards });

  return (
    <View style={{ gap: 14 }}>
      {groups.map(({ key, folder, cards }) => {
        const isCollapsed = collapsed.has(key);
        const selectedInFolder = cards.filter(c => selectedIds.has(c.id)).length;
        const folderGame: TCGGame | null = folder?.game ?? meetupGame;
        return (
          <View key={key}>
            <TouchableOpacity
              style={styles.folderHeader}
              onPress={() => toggleFolder(key)}
              activeOpacity={0.7}
            >
              <FolderIcon
                game={folderGame}
                color={folder?.color ?? '#64748B'}
                boxSize={28}
                iconSize={16}
                borderRadius={8}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.folderName}>{folder?.name ?? 'Sin carpeta'}</Text>
                <Text style={styles.folderCount}>
                  {cards.length} carta{cards.length !== 1 ? 's' : ''}
                  {selectedInFolder > 0 ? ` · ${selectedInFolder} seleccionada${selectedInFolder !== 1 ? 's' : ''}` : ''}
                </Text>
              </View>
              <Ionicons
                name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                size={18}
                color="#64748B"
              />
            </TouchableOpacity>
            {!isCollapsed && (
              <SelectableGrid cards={cards} selectedIds={selectedIds} onToggle={onToggle} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function SelectableGrid({ cards, selectedIds, onToggle }: {
  cards: CardCollection[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.selGrid}>
      {cards.map(card => {
        const sel = selectedIds.has(card.id);
        return (
          <TouchableOpacity
            key={card.id}
            style={[styles.selCard, sel && styles.selCardOn]}
            onPress={() => onToggle(card.id)}
            activeOpacity={0.75}
          >
            {card.image_url
              ? <Image source={{ uri: card.image_url }} style={styles.selCardImg} contentFit="contain" />
              : <View style={styles.selCardPlaceholder}><Ionicons name="albums-outline" size={20} color="#64748B" /></View>}
            {sel && (
              <View style={styles.selCheck}>
                <Ionicons name="checkmark-circle" size={20} color="#4ADE80" />
              </View>
            )}
            <Text style={styles.selCardName} numberOfLines={2}>{card.card_name}</Text>
            <Text style={styles.selCardSub}>{card.set_name ?? card.game}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CardRow({ cards, onPress }: { cards: CardWithMeta[]; onPress: (card: CardWithMeta) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
      {cards.map(card => (
        <TouchableOpacity
          key={card.meetup_card_id}
          style={styles.cardThumb}
          onPress={() => onPress(card)}
          activeOpacity={0.7}
        >
          {card.image_url
            ? <Image source={{ uri: card.image_url }} style={styles.cardThumbImg} contentFit="contain" />
            : <View style={styles.cardThumbPlaceholder}><Ionicons name="albums-outline" size={18} color="#64748B" /></View>}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

type ParticipantInfo = { username: string; avatar_url: string | null; isMe: boolean };

function SummaryModal({
  visible, onClose, proposer, receiver, proposerSideCards, receiverSideCards,
  price, priceCurrency, pricePayer, counterNotes, statusLabel, statusColor, onZoom,
}: {
  visible: boolean;
  onClose: () => void;
  proposer: ParticipantInfo;
  receiver: ParticipantInfo;
  proposerSideCards: CardWithMeta[];
  receiverSideCards: CardWithMeta[];
  price: number | null;
  priceCurrency: 'usd' | 'clp';
  pricePayer: 'proposer' | 'receiver' | null;
  counterNotes: string | null;
  statusLabel: string;
  statusColor: string;
  onZoom: (card: CardWithMeta) => void;
}) {
  const empty = proposerSideCards.length === 0 && receiverSideCards.length === 0 && price == null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.summaryContainer}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>Detalle del intercambio</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-outline" size={26} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>

          <View style={[styles.statusPill, styles.summaryStatusPill, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          {empty && (
            <Text style={styles.summaryEmpty}>Aún no hay nada en el intercambio</Text>
          )}

          <ParticipantCard
            user={proposer}
            role="Proponente"
            cards={proposerSideCards}
            price={pricePayer === 'proposer' ? price : null}
            priceCurrency={priceCurrency}
            onZoom={onZoom}
          />

          <View style={styles.summaryDivider}>
            <Ionicons name="swap-vertical-outline" size={16} color="#64748B" />
          </View>

          <ParticipantCard
            user={receiver}
            role="Receptor"
            cards={receiverSideCards}
            price={pricePayer === 'receiver' ? price : null}
            priceCurrency={priceCurrency}
            onZoom={onZoom}
          />

          {price != null && pricePayer == null && (
            <View style={styles.summaryDetailCard}>
              <View style={styles.summaryDetailRow}>
                <Ionicons name="wallet-outline" size={16} color="#4ADE80" />
                <Text style={styles.summaryDetailLabel}>Precio acordado</Text>
                <Text style={styles.summaryDetailValue}>${price} {priceCurrency.toUpperCase()}</Text>
              </View>
            </View>
          )}

          {counterNotes && (
            <View style={styles.summaryDetailCard}>
              <Text style={[styles.noteLabel, { color: '#FB923C' }]}>Modificación</Text>
              <Text style={styles.noteText}>{counterNotes}</Text>
            </View>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}

function ParticipantCard({ user, role, cards, price, priceCurrency, onZoom }: {
  user: ParticipantInfo;
  role: string;
  cards: CardWithMeta[];
  price: number | null;
  priceCurrency: 'usd' | 'clp';
  onZoom: (card: CardWithMeta) => void;
}) {
  return (
    <View style={styles.participantCard}>
      <View style={styles.participantHeader}>
        <View style={styles.participantAvatar}>
          {user.avatar_url
            ? <Image source={{ uri: user.avatar_url }} style={styles.participantAvatarImg} />
            : <Ionicons name="person-outline" size={18} color="#64748B" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.participantName}>
            @{user.username}
            {user.isMe && <Text style={styles.participantYou}>  · Tú</Text>}
          </Text>
          <Text style={styles.participantRole}>{role}</Text>
        </View>
      </View>

      <Text style={styles.participantAports}>Aporta</Text>

      {cards.length === 0 && price == null ? (
        <Text style={styles.participantEmpty}>Nada todavía</Text>
      ) : (
        <>
          {cards.length > 0 && (
            <View style={styles.summaryGrid}>
              {cards.map(card => (
                <TouchableOpacity
                  key={card.meetup_card_id}
                  style={styles.summaryCard}
                  onPress={() => onZoom(card)}
                  activeOpacity={0.7}
                >
                  {card.image_url
                    ? <Image source={{ uri: card.image_url }} style={styles.summaryCardImg} contentFit="contain" />
                    : <View style={styles.summaryCardPlaceholder}><Ionicons name="albums-outline" size={24} color="#64748B" /></View>}
                  <Text style={styles.summaryCardName} numberOfLines={2}>{card.card_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {price != null && (
            <View style={styles.participantPriceRow}>
              <Ionicons name="wallet-outline" size={16} color="#4ADE80" />
              <Text style={styles.participantPriceText}>${price} {priceCurrency.toUpperCase()}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function TradeSnapshotBubble({ message, snapshot, isMine, isProposer, onZoom }: {
  message: Message;
  snapshot: Snapshot;
  isMine: boolean;
  isProposer: boolean;
  onZoom: (card: ZoomedCard) => void;
}) {
  const time = new Date(message.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const label = snapshot.event === 'proposed' ? 'Intercambio inicial' : 'Modificó el intercambio';
  const isModified = snapshot.event === 'modified';

  const renderCardList = (cards: CardInfo[]) => (
    <View style={styles.snapshotCards}>
      {cards.map(c => (
        <TouchableOpacity
          key={c.id}
          onPress={() => onZoom({ id: c.id, card_name: c.name, set_name: null, image_url: c.img })}
          activeOpacity={0.7}
        >
          {c.img
            ? <Image source={{ uri: c.img }} style={styles.snapshotCardImg} contentFit="contain" />
            : <View style={styles.snapshotCardPlaceholder}><Ionicons name="albums-outline" size={16} color="#64748B" /></View>}
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      <View style={[styles.snapshotBubble, isMine ? styles.snapshotBubbleMine : styles.snapshotBubbleTheirs]}>
        <Text style={[styles.snapshotLabel, isMine && styles.snapshotLabelMine]}>{label}</Text>

        {isModified ? (
          <>
            {snapshot.added.length > 0 && (
              <View style={styles.snapshotSection}>
                <Text style={[styles.snapshotSubLabel, isMine && styles.snapshotSubLabelMine]}>+ Agregó</Text>
                {renderCardList(snapshot.added)}
              </View>
            )}
            {snapshot.removed.length > 0 && (
              <View style={styles.snapshotSection}>
                <Text style={[styles.snapshotSubLabel, isMine && styles.snapshotSubLabelMine]}>− Quitó</Text>
                {renderCardList(snapshot.removed)}
              </View>
            )}
          </>
        ) : (
          (() => {
            const proposerSideCards = snapshot.added.filter(c => c.side === 'proposer');
            const receiverSideCards = snapshot.added.filter(c => c.side === 'receiver');
            const myCards = isProposer ? proposerSideCards : receiverSideCards;
            const theirCards = isProposer ? receiverSideCards : proposerSideCards;
            const myLabel = isProposer ? 'Ofrezco' : 'Me piden';
            const theirLabel = isProposer ? 'Pido' : 'Me ofrecen';
            return (
              <>
                {theirCards.length > 0 && (
                  <View style={styles.snapshotSection}>
                    <Text style={[styles.snapshotSubLabel, isMine && styles.snapshotSubLabelMine]}>{theirLabel}</Text>
                    {renderCardList(theirCards)}
                  </View>
                )}
                {myCards.length > 0 && (
                  <View style={styles.snapshotSection}>
                    <Text style={[styles.snapshotSubLabel, isMine && styles.snapshotSubLabelMine]}>{myLabel}</Text>
                    {renderCardList(myCards)}
                  </View>
                )}
              </>
            );
          })()
        )}

        <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs]}>{time}</Text>
      </View>
    </View>
  );
}

function CardZoomModal({ card, onClose }: { card: ZoomedCard | null; onClose: () => void }) {
  if (!card) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.zoomBackdrop} activeOpacity={1} onPress={onClose}>
        {card.image_url ? (
          <Image source={{ uri: card.image_url }} style={styles.zoomImage} contentFit="contain" />
        ) : (
          <View style={styles.zoomPlaceholder}>
            <Ionicons name="albums-outline" size={80} color="#475569" />
          </View>
        )}
        <View style={styles.zoomCaption}>
          <Text style={styles.zoomCaptionName}>{card.card_name}</Text>
          {card.set_name && <Text style={styles.zoomCaptionSet}>{card.set_name}</Text>}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  back: { color: '#6366F1', fontSize: 15 },
  headerUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  headerAvatarImg: { width: 32, height: 32 },
  headerUsername: { color: '#F1F5F9', fontSize: 14, fontWeight: '700' },
  headerUsernameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerRole: { color: '#64748B', fontSize: 11 },
  statusPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  detailBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#6366F122', borderRadius: 10,
    borderWidth: 1, borderColor: '#6366F155',
  },
  detailBtnText: { color: '#A5B4FC', fontSize: 12, fontWeight: '700' },
  scroll: { flex: 1 },

  noteLabel: { color: '#64748B', fontSize: 11, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  noteText: { color: '#CBD5E1', fontSize: 14, lineHeight: 20 },

  cardThumb: {
    width: 52, backgroundColor: '#1E293B', borderRadius: 6,
    borderWidth: 1, borderColor: '#334155',
  },
  cardThumbImg: { width: '100%', aspectRatio: 0.715, borderRadius: 5 },
  cardThumbPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 5,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },

  // Summary modal
  summaryContainer: { flex: 1, backgroundColor: '#0F172A' },
  summaryHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  summaryTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '800' },
  summaryStatusPill: { alignSelf: 'flex-start' },
  summaryEmpty: { color: '#475569', fontSize: 14, textAlign: 'center', paddingVertical: 40 },
  summarySectionLabel: {
    color: '#94A3B8', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  summaryDivider: { alignItems: 'center', paddingVertical: 2 },

  participantCard: {
    backgroundColor: '#1E293B', borderRadius: 14,
    borderWidth: 1, borderColor: '#334155',
    padding: 14, gap: 10,
  },
  participantHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  participantAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  participantAvatarImg: { width: 36, height: 36 },
  participantName: { color: '#F1F5F9', fontSize: 14, fontWeight: '700' },
  participantYou: { color: '#A5B4FC', fontSize: 11, fontWeight: '600' },
  participantRole: { color: '#64748B', fontSize: 11, fontWeight: '500' },
  participantAports: {
    color: '#94A3B8', fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  participantEmpty: { color: '#475569', fontSize: 13, fontStyle: 'italic' },
  participantPriceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: '#0F172A', borderRadius: 10,
    borderWidth: 1, borderColor: '#4ADE8044',
  },
  participantPriceText: { color: '#4ADE80', fontSize: 15, fontWeight: '700' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCard: {
    width: '31%', backgroundColor: '#1E293B', borderRadius: 10,
    borderWidth: 1, borderColor: '#334155', padding: 6, gap: 4, alignItems: 'center',
  },
  summaryCardImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  summaryCardPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 6,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  summaryCardName: { color: '#F1F5F9', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  summaryDetailCard: {
    backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#334155',
    padding: 14, gap: 10,
  },
  summaryDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryDetailLabel: { color: '#64748B', fontSize: 13, width: 110 },
  summaryDetailValue: { color: '#F1F5F9', fontSize: 14, fontWeight: '600', flex: 1 },

  // Card zoom modal
  zoomBackdrop: {
    flex: 1, backgroundColor: '#000000DD',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  zoomImage: { width: '100%', aspectRatio: 0.715, maxHeight: '85%' },
  zoomPlaceholder: { width: '90%', aspectRatio: 0.715, alignItems: 'center', justifyContent: 'center' },
  zoomCaption: { position: 'absolute', bottom: 56, alignItems: 'center', paddingHorizontal: 24 },
  zoomCaptionName: { color: '#F1F5F9', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  zoomCaptionSet: { color: '#94A3B8', fontSize: 13, marginTop: 4 },

  // Compact action bar (above input)
  actionBar: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  compactAction: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, backgroundColor: '#1E293B',
  },
  compactActionText: { fontSize: 12, fontWeight: '700' },
  checkedInCompact: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8,
  },
  checkedInCompactText: { color: '#4ADE80', fontSize: 12, fontWeight: '600' },

  // Chat
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: '#6366F1', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 19 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: '#F1F5F9' },
  bubbleTime: { fontSize: 10, marginTop: 3, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: '#C7D2FE' },
  bubbleTimeTheirs: { color: '#64748B' },

  // Trade snapshot bubble
  snapshotBubble: {
    maxWidth: '85%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
    gap: 8,
  },
  snapshotBubbleMine: { backgroundColor: '#6366F1', borderBottomRightRadius: 4 },
  snapshotBubbleTheirs: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderBottomLeftRadius: 4 },
  snapshotLabel: { color: '#F1F5F9', fontSize: 13, fontWeight: '700' },
  snapshotLabelMine: { color: '#fff' },
  snapshotSection: { gap: 4 },
  snapshotSubLabel: {
    color: '#94A3B8', fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  snapshotSubLabelMine: { color: '#C7D2FE' },
  snapshotCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  snapshotCardImg: { width: 42, height: 59, borderRadius: 4 },
  snapshotCardPlaceholder: {
    width: 42, height: 59, borderRadius: 4,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 10, borderTopWidth: 1, borderTopColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  chatInput: {
    flex: 1, maxHeight: 100, minHeight: 40,
    backgroundColor: '#1E293B', borderRadius: 20, borderWidth: 1, borderColor: '#334155',
    paddingHorizontal: 14, paddingVertical: 10,
    color: '#F1F5F9', fontSize: 14,
  },
  sendIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
  },
  sendIconBtnDisabled: { backgroundColor: '#334155' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#0F172A' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#F1F5F9' },
  sendBtn: {
    backgroundColor: '#6366F1', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8,
  },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  editTitle: { color: '#F1F5F9', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  editSub: { color: '#64748B', fontSize: 12, marginBottom: 10 },
  emptyCol: { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 20 },

  folderHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8,
    paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: '#1E293B', borderRadius: 10,
    borderWidth: 1, borderColor: '#334155',
  },
  folderName: { color: '#F1F5F9', fontSize: 14, fontWeight: '700' },
  folderCount: { color: '#64748B', fontSize: 11, fontWeight: '500' },

  selGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selCard: {
    width: '31%', backgroundColor: '#1E293B', borderRadius: 10,
    borderWidth: 1.5, borderColor: '#334155', padding: 6, alignItems: 'center', gap: 3,
  },
  selCardOn: { borderColor: '#6366F1', backgroundColor: '#6366F115' },
  selCardImg: { width: '100%', aspectRatio: 0.715, borderRadius: 6 },
  selCardPlaceholder: {
    width: '100%', aspectRatio: 0.715, borderRadius: 6,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  selCardName: { color: '#F1F5F9', fontSize: 9, fontWeight: '600', textAlign: 'center' },
  selCardSub: { color: '#475569', fontSize: 8, textAlign: 'center' },
  selCheck: { position: 'absolute', top: 4, right: 4 },

  fieldInput: {
    backgroundColor: '#0F172A', borderRadius: 10, borderWidth: 1,
    borderColor: '#334155', padding: 12, color: '#F1F5F9', fontSize: 14,
  },

  // Rating
  ratedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#1E293B', borderRadius: 10,
    borderWidth: 1, borderColor: '#334155',
    flex: 1,
  },
  ratedBadgeText: { color: '#94A3B8', fontSize: 12, fontWeight: '600', flex: 1 },
  ratingOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  ratingSheet: {
    width: '100%', maxWidth: 400,
    backgroundColor: '#1E293B', borderRadius: 16,
    borderWidth: 1, borderColor: '#334155',
    padding: 20, gap: 14,
  },
  ratingTitle: { color: '#F1F5F9', fontSize: 18, fontWeight: '800' },
  ratingSub: { color: '#94A3B8', fontSize: 13, marginTop: -8 },
  ratingChoices: { flexDirection: 'row', gap: 12, marginTop: 4 },
  ratingChoice: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, gap: 6,
    backgroundColor: '#0F172A', borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
  },
  ratingChoicePositiveActive: { borderColor: '#4ADE80', backgroundColor: 'rgba(74,222,128,0.08)' },
  ratingChoiceNegativeActive: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.08)' },
  ratingChoiceText: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  ratingComment: {
    backgroundColor: '#0F172A', borderRadius: 10,
    borderWidth: 1, borderColor: '#334155',
    padding: 12, color: '#F1F5F9', fontSize: 14,
    minHeight: 70, textAlignVertical: 'top',
  },
  ratingActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  ratingCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155',
    alignItems: 'center',
  },
  ratingCancelText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  ratingSubmit: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
  },
  ratingSubmitDisabled: { opacity: 0.5 },
  ratingSubmitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
