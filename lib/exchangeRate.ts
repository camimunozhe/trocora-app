import AsyncStorage from '@react-native-async-storage/async-storage';

// Fallback solo si nunca hubo una cotización real (ni en memoria, ni persistida, ni red).
const FALLBACK_RATE = 970;
const TTL_MS = 6 * 60 * 60 * 1000; // 6 horas
const STORAGE_KEY = 'usd_clp_rate';

type Entry = { rate: number; ts: number };

let memo: Entry | null = null;
let inFlight: Promise<number> | null = null;

async function readStored(): Promise<Entry | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.rate === 'number' && parsed.rate > 0 && typeof parsed.ts === 'number') {
      return parsed as Entry;
    }
  } catch {}
  return null;
}

async function resolveRate(): Promise<number> {
  // Cache persistido fresco (sobrevive a relanzar la app dentro del TTL).
  const stored = await readStored();
  if (stored && Date.now() - stored.ts < TTL_MS) {
    memo = stored;
    return stored.rate;
  }

  // Refrescar de la red.
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await res.json();
    const rate = json?.rates?.CLP;
    if (typeof rate === 'number' && rate > 0) {
      const entry: Entry = { rate, ts: Date.now() };
      memo = entry;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entry)).catch(() => {});
      return rate;
    }
  } catch {}

  // Falló la red: usar el último valor persistido aunque esté vencido.
  // No seteamos memo con el fallback para que el próximo llamado reintente.
  if (stored) return stored.rate;
  return FALLBACK_RATE;
}

export async function getUsdToClp(): Promise<number> {
  if (memo && Date.now() - memo.ts < TTL_MS) return memo.rate;
  if (inFlight) return inFlight;
  inFlight = resolveRate();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
