// Soft limits for the free plan. Premium = unlimited.
// "Grandfather" policy: when a user downgrades from premium, existing content
// stays — they just can't add MORE until under the limit.

export const FREE_LIMITS = {
  folders: 3,
  regions: 1,
  publishedCards: 30,
  activeTrades: 5,
} as const;

type CanResult = { allowed: true } | { allowed: false; limit: number; current: number };

export function canCreate(
  current: number,
  isPremium: boolean,
  limit: number,
): CanResult {
  if (isPremium) return { allowed: true };
  if (current < limit) return { allowed: true };
  return { allowed: false, limit, current };
}

export function canCreateFolder(current: number, isPremium: boolean): CanResult {
  return canCreate(current, isPremium, FREE_LIMITS.folders);
}

export function canPublishCard(currentPublished: number, isPremium: boolean): CanResult {
  return canCreate(currentPublished, isPremium, FREE_LIMITS.publishedCards);
}

export function canAddRegion(currentSelected: number, isPremium: boolean): CanResult {
  return canCreate(currentSelected, isPremium, FREE_LIMITS.regions);
}

export function canCreateTrade(currentActive: number, isPremium: boolean): CanResult {
  return canCreate(currentActive, isPremium, FREE_LIMITS.activeTrades);
}

export function limitReachedMessage(
  feature: 'folders' | 'regions' | 'publishedCards' | 'activeTrades',
  current: number,
  limit: number,
): { title: string; message: string } {
  const titles: Record<typeof feature, string> = {
    folders: 'Límite de carpetas',
    regions: 'Límite de regiones',
    publishedCards: 'Límite de publicaciones',
    activeTrades: 'Límite de intercambios activos',
  };
  const messages: Record<typeof feature, string> = {
    folders: `Tu plan Free permite ${limit} carpetas (tienes ${current}). Pásate a Trocora Pro para crear las que quieras.`,
    regions: `Tu plan Free permite ${limit} región (tienes ${current} marcadas). Trocora Pro te deja seleccionar todas.`,
    publishedCards: `Tu plan Free permite ${limit} cartas publicadas (tienes ${current}). Despublica algunas o pásate a Trocora Pro para publicar las que quieras.`,
    activeTrades: `Tu plan Free permite ${limit} intercambios activos (tienes ${current}). Cierra alguno o pásate a Trocora Pro para tener ilimitados.`,
  };
  return { title: titles[feature], message: messages[feature] };
}
