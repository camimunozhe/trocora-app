// node scripts/sync-pokemon-prices.js
//
// Sincroniza precios de cartas Pokémon desde TCGdex (https://api.tcgdex.net).
// Reemplaza la integración previa con pokemontcg.io, que migró a Scrydex (de pago).
// TCGdex es gratis, open source (MIT) y NO requiere API key.
//
// TCGdex usa el mismo esquema de IDs que pokemontcg.io para los sets principales
// (swsh3-136, sv10-79, ecard3-47, ...), así que macheamos por `id` directo contra
// las filas existentes en pokemon_cards. Algunos sets con naming especial de
// pokemontcg.io (rsv10pt5, zsv10pt5, tk2a, ...) no existen en TCGdex y devuelven
// 404: esas cartas se saltan y conservan su precio previo (degradación elegante).
//
// El precio de TCGdex solo viene en el detalle por carta, así que iteramos los IDs
// de la DB y pedimos /v2/en/cards/{id} para cada uno, con concurrencia moderada,
// backoff en 429 y reintento ante errores de red. La escritura usa el mismo camino
// que antes: RPC batch_update_pokemon_prices + historial en pokemon_card_price_history.

const { createClient } = require('@supabase/supabase-js');
const { readFileSync }  = require('fs');
const { resolve }       = require('path');

// Load .env manually
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SUPABASE_URL     = env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE         = 'https://api.tcgdex.net/v2/en/cards';
const CONCURRENCY      = 6;     // peticiones en paralelo (TCGdex es comunitario: ser amable)
const CHUNK_DELAY_MS   = 120;   // pausa entre lotes
const FLUSH_EVERY      = 250;   // cartas con precio acumuladas antes de escribir a la DB
const MAX_RETRIES      = 3;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Mapea pricing.tcgplayer (USD) a las columnas tcgplayer_* de pokemon_cards.
// Mantiene la misma semántica que la versión pokemontcg.io: normal prioriza
// normal/unlimited; foil prioriza holofoil > reverse-holofoil > 1st-edition-holofoil.
function extractPrices(pricing) {
  const t = pricing?.tcgplayer;
  if (!t) return null;
  const normal = t.normal ?? t.unlimited ?? t['1st-edition'] ?? null;
  const foil   = t.holofoil ?? t['reverse-holofoil'] ?? t['1st-edition-holofoil'] ?? null;
  const prices = {
    normal_market: num(normal?.marketPrice),
    normal_low:    num(normal?.lowPrice),
    foil_market:   num(foil?.marketPrice),
    foil_low:      num(foil?.lowPrice),
  };
  if (Object.values(prices).every(v => v === null)) return null;
  return prices;
}

// Pide una carta a TCGdex. Devuelve { prices } | { notFound: true } | { error }.
async function fetchCard(id) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
        headers: { 'User-Agent': 'trocora-app/1.0 (+https://trocora.com)' },
      });
      if (res.status === 404) return { notFound: true };
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '', 10);
        const wait = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** attempt;
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const card = await res.json();
      return { prices: extractPrices(card?.pricing) };
    } catch (err) {
      if (attempt === MAX_RETRIES) return { error: err.message };
      await sleep(500 * 2 ** attempt);
    }
  }
  return { error: 'exhausted retries' };
}

async function flush(cardUpdates, historyRows) {
  if (cardUpdates.length > 0) {
    const payload = cardUpdates.map(c => ({
      id: c.id, nm: c.normal_market, nl: c.normal_low, fm: c.foil_market, fl: c.foil_low,
    }));
    const { error } = await supabase.rpc('batch_update_pokemon_prices', { updates: payload });
    if (error) console.error('  update error:', error.message);
  }
  if (historyRows.length > 0) {
    const { error } = await supabase
      .from('pokemon_card_price_history')
      .upsert(historyRows, { onConflict: 'card_id,date', ignoreDuplicates: false });
    if (error) console.error('  history error:', error.message);
  }
}

async function loadExistingIds() {
  const ids  = [];
  let page    = 0;
  const size  = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('pokemon_cards')
      .select('id')
      .range(page * size, page * size + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(r => ids.push(r.id));
    if (data.length < size) break;
    page++;
  }
  return ids;
}

async function main() {
  console.log('=== Pokemon price sync (TCGdex) ===');

  process.stdout.write('Loading existing card IDs from DB... ');
  const ids = await loadExistingIds();
  console.log(`${ids.length} cards in DB`);

  const today = new Date().toISOString().slice(0, 10);
  let cardUpdates = [];
  let historyRows = [];
  let priced = 0, notFound = 0, noPrice = 0, errors = 0, done = 0;

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async id => ({ id, ...(await fetchCard(id)) })));

    for (const r of results) {
      done++;
      if (r.notFound) { notFound++; continue; }
      if (r.error)    { errors++; continue; }
      if (!r.prices)  { noPrice++; continue; }
      priced++;
      cardUpdates.push({ id: r.id, ...r.prices });
      historyRows.push({
        card_id:       r.id,
        date:          today,
        normal_market: r.prices.normal_market,
        normal_low:    r.prices.normal_low,
        foil_market:   r.prices.foil_market,
        foil_low:      r.prices.foil_low,
      });
    }

    if (cardUpdates.length >= FLUSH_EVERY) {
      await flush(cardUpdates, historyRows);
      cardUpdates = [];
      historyRows = [];
    }

    if (done % 500 < CONCURRENCY) {
      process.stdout.write(
        `\r${done}/${ids.length} — priced ${priced}, no-price ${noPrice}, 404 ${notFound}, err ${errors}   `,
      );
    }
    await sleep(CHUNK_DELAY_MS);
  }

  await flush(cardUpdates, historyRows);

  console.log(
    `\n\nDone. ${priced} cards priced · ${noPrice} sin precio · ${notFound} no en TCGdex (404) · ${errors} errores.`,
  );
}

main().catch(err => { console.error(err); process.exit(1); });
