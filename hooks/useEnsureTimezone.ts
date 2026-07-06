import { useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export function useEnsureTimezone(session: Session | null): void {
  useEffect(() => {
    if (!session) return;
    const currentSession = session;

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
