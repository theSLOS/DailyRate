/**
 * Resolves the device's current region (state/country) from GPS, via the
 * server-proxied resolve_region RPC. Permission and location reads stay
 * entirely client-side; only the RPC call itself is proxied.
 */
import { apiGet } from '@/lib/apiClient';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import type { RegionResult, Region } from '@/types/region';
import * as Location from 'expo-location';

// mirrors Database['public']['Functions']['resolve_region']['Returns'][number]
// exactly, including its (technically wrong — see types/region.ts) non-null
// state_code, rather than hand-correcting it a second time in a second place
type ResolveRegionRow = {
  country_code: string;
  state_code: string;
  place_label: string;
};

/** Requests location permission, reads GPS, and resolves it to a region via the server. */
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

      // device location stays entirely client-side — the server has no way
      // to read it — only the resulting RPC call is proxied through it
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });

      const row = await apiGet<ResolveRegionRow | null>(
        `/api/region?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
      );

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
