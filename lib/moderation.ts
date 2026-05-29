import { supabase } from '@/lib/supabase';
import type { ReportReason } from '@/types/database';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'scam', label: 'Estafa o fraude' },
  { value: 'inappropriate', label: 'Contenido inapropiado' },
  { value: 'harassment', label: 'Acoso o lenguaje abusivo' },
  { value: 'fake', label: 'Cuenta falsa o suplantación' },
  { value: 'other', label: 'Otro' },
];

export async function fetchBlockedIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', userId);
  return (data ?? []).map((r) => r.blocked_id);
}

export function blockUser(blockerId: string, blockedId: string) {
  return supabase.from('user_blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
}

export function unblockUser(blockerId: string, blockedId: string) {
  return supabase.from('user_blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
}

export function reportUser(args: {
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
  meetupId?: string;
}) {
  return supabase.from('user_reports').insert({
    reporter_id: args.reporterId,
    reported_user_id: args.reportedUserId,
    reason: args.reason,
    details: args.details ?? null,
    meetup_id: args.meetupId ?? null,
  });
}
