// ============================================================
// realtime/useRealtimeSync.ts — Supabase Realtime → React Query  (ILLUSTRATIVE EXTRACT)
// ============================================================
// Sanitized pattern from the production KonquerAI web dashboard.
//
// Updates the relevant React Query caches the instant an INSERT/UPDATE/
// DELETE lands in the database, so a change made on the user's phone shows
// up on the open laptop tab without a manual refresh. A slow polling
// `refetchInterval` (e.g. 5 min) stays as a safety net — but the hot path
// is Realtime, so the UI feels live without hammering the database.
//
// The channel filter is `user_id=eq.<id>`, which mirrors the row-level
// security policy: Realtime RESPECTS RLS, so a user only ever receives
// change events for their own rows.
// ============================================================

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase'; // see supabase.example.ts

export function useInvoicesRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`invoices-rt-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: `user_id=eq.${userId}`, // RLS-aligned: only your own rows
        },
        (payload: { new?: { id?: string }; old?: { id?: string } }) => {
          // Invalidate the list (every key under ['invoices', userId]).
          queryClient.invalidateQueries({ queryKey: ['invoices', userId] });
          // Invalidate the detail view if the changed row id is in the payload.
          const id = payload?.new?.id || payload?.old?.id;
          if (id) queryClient.invalidateQueries({ queryKey: ['invoice', id] });
          // Keep the "pending review" badge counter fresh.
          queryClient.invalidateQueries({ queryKey: ['invoices-pending-review-count', userId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}

export function useNotificationsRealtime(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-rt-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
          queryClient.invalidateQueries({ queryKey: ['notifications-unread-count', userId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
