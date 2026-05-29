-- Versiona la RPC batch_update_pokemon_prices, que existía en la DB pero nunca
-- quedó en migrations/. Actualiza en lote los precios tcgplayer_* de pokemon_cards
-- a partir de un array JSON [{id, nm, nl, fm, fl}, ...]. La invoca el sync de
-- precios (scripts/sync-pokemon-prices.js). SECURITY DEFINER: la corre el script
-- con service_role; no está expuesta a roles cliente.

CREATE OR REPLACE FUNCTION public.batch_update_pokemon_prices(updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE pokemon_cards SET
    tcgplayer_normal_market = (u->>'nm')::numeric,
    tcgplayer_normal_low    = (u->>'nl')::numeric,
    tcgplayer_foil_market   = (u->>'fm')::numeric,
    tcgplayer_foil_low      = (u->>'fl')::numeric,
    price_updated_at        = now()
  FROM jsonb_array_elements(updates) AS u
  WHERE pokemon_cards.id = u->>'id';
END;
$function$;
