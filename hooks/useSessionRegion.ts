import { supabase } from '@/lib/supabase';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { RegionResult, Region } from '@/types/region';
import * as Location from 'expo-location';

export function useSessionRegion(
  userId: string | undefined,
  // callers gate this so the OS location prompt only fires when the user does
  // something location-shaped, per the lazy call-site decision
  enabled: boolean = true
): UseQueryResult<RegionResult, Error> {
  return useQuery({
    queryKey: ['region', { userId }],
    enabled: userId !== undefined && enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<RegionResult> => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return { status: 'unavailable', reason: 'permission-denied' };
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });

      const { data, error } = await supabase.rpc('resolve_region', {
        lng: pos.coords.longitude,
        lat: pos.coords.latitude,
      });

      if (error) {
        throw new Error(error.message);
      }

      const row = data?.[0];
      if (!row) {
        return { status: 'unavailable', reason: 'no-match' };
      }

      const region: Region = {
        countryCode: row.country_code,
        stateCode: row.state_code,
        placeLabel: row.place_label,
      };

      return { status: 'resolved', region };
    },
  });
}
