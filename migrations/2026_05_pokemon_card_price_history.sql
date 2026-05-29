-- Versiona la tabla pokemon_card_price_history, que existía en la DB pero nunca
-- quedó en migrations/ (fue creada directo en el SQL editor). Idempotente: si ya
-- existe, no hace nada. Guarda el histórico diario de precios por carta Pokémon;
-- la escribe el sync de precios (scripts/sync-pokemon-prices.js) con service_role.

CREATE TABLE IF NOT EXISTS pokemon_card_price_history (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_id       text NOT NULL REFERENCES pokemon_cards(id) ON DELETE CASCADE,
  date          date NOT NULL DEFAULT CURRENT_DATE,
  normal_market numeric,
  normal_low    numeric,
  foil_market   numeric,
  foil_low      numeric,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, date)
);

CREATE INDEX IF NOT EXISTS idx_price_history_card_date
  ON pokemon_card_price_history (card_id, date DESC);

-- Solo el sync (service_role) escribe esta tabla; el cliente no la lee. RLS
-- habilitado sin policies => ningún rol anónimo/autenticado puede tocarla.
ALTER TABLE pokemon_card_price_history ENABLE ROW LEVEL SECURITY;
