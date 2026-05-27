import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function usePendingMeetupsCount(userId: string | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    const id: string = userId;
    let cancelled = false;

    async function fetchCount() {
      const { count: c } = await supabase
        .from('meetups')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', id)
        .eq('status', 'pending');
      if (!cancelled) setCount(c ?? 0);
    }

    fetchCount();

    const channel = supabase
      .channel(`meetups-pending-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetups', filter: `receiver_id=eq.${id}` },
        () => { fetchCount(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
