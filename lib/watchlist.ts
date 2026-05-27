import { supabase } from '@/lib/supabase';
import type { CardWatchlist, TCGGame } from '@/types/database';

export type WatchlistEntry = CardWatchlist;

export type AddWatchlistInput = {
  userId: string;
  game: TCGGame;
  catalogCardId: string;
  cardName: string;
  setName: string | null;
  imageUrl: string | null;
};

export async function addToWatchlist(input: AddWatchlistInput): Promise<{ error: string | null }> {
  const base = {
    user_id: input.userId,
    card_name: input.cardName,
    set_name: input.setName,
    image_url: input.imageUrl,
    pokemon_card_id: input.game === 'pokemon' ? input.catalogCardId : null,
    magic_card_id: input.game === 'magic' ? input.catalogCardId : null,
  };
  if (!base.pokemon_card_id && !base.magic_card_id) {
    return { error: 'Juego no soportado para watchlist' };
  }

  const { error } = await supabase.from('card_watchlist').insert(base);
  return { error: error?.message ?? null };
}

export async function removeFromWatchlist(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('card_watchlist').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export async function isInWatchlist(
  userId: string,
  game: TCGGame,
  catalogCardId: string,
): Promise<boolean> {
  const col = game === 'pokemon' ? 'pokemon_card_id' : 'magic_card_id';
  const { count } = await supabase
    .from('card_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq(col, catalogCardId);
  return (count ?? 0) > 0;
}
