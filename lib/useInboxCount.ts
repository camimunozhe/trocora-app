import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Cuenta de items en el inbox: meetups donde soy receiver pendiente de
// responder + meetups con mensajes sin leer. La RPC `get_inbox_count`
// hace el join y deduplica para que un mismo meetup no se cuente doble.
export function useInboxCount(userId: string | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }

    const id: string = userId;
    let cancelled = false;

    async function refresh() {
      const { data } = await supabase.rpc('get_inbox_count', { p_user_id: id });
      if (!cancelled) setCount((data as number | null) ?? 0);
    }

    refresh();

    const channel = supabase
      .channel(`inbox-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetups', filter: `receiver_id=eq.${id}` },
        () => { refresh(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetups', filter: `proposer_id=eq.${id}` },
        () => { refresh(); },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { refresh(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
