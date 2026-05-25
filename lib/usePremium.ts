import { useAuth } from '@/context/AuthContext';

type PremiumStatus = 'free' | 'active' | 'in_grace' | 'expired';

export type PremiumState = {
  isPremium: boolean;
  status: PremiumStatus;
  until: Date | null;
  productId: string | null;
};

export function usePremium(): PremiumState {
  const { profile } = useAuth();
  const status = (profile?.premium_status ?? 'free') as PremiumStatus;
  const until = profile?.premium_until ? new Date(profile.premium_until) : null;
  // Defensive: if the webhook is missed/delayed, don't keep granting Pro after
  // expiration. Premium is active only if state says so AND `until` is in the future.
  const notExpired = !until || until.getTime() > Date.now();
  const isPremium = (status === 'active' || status === 'in_grace') && notExpired;
  return {
    isPremium,
    status,
    until,
    productId: profile?.premium_product_id ?? null,
  };
}
