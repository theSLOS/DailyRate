/**
 * One-time client-side backfill of a signed-in user's timezone from the
 * device, run whenever a session becomes available (onboarding doesn't
 * collect it explicitly).
 */
import { useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/** Backfills profiles.timezone from the device clock, only while it's still null. */
export function useEnsureTimezone(session: Session | null): void {
  useEffect(() => {
    if (!session) return;
    const currentSession = session;

    /** Writes the device's IANA timezone to the current user's profile if unset. */
    async function backfillTimezone(): Promise<void> {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { error } = await supabase
        .from('profiles')
        .update({ timezone: deviceTz })
        .eq('id', currentSession.user.id)
        .is('timezone', null);

      if (error) {
        console.error('Error updating timezone:', error);
      }
    }

    backfillTimezone();
  }, [session]);
}
