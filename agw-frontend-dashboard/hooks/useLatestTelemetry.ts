import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { TelemetryRecord } from '@/types/telemetry';

export function useLatestTelemetry(deviceId: string) {
  return useQuery<TelemetryRecord>({
    queryKey: ['telemetry', deviceId, 'latest'],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/api/iot/telemetry/${deviceId}/latest`
      );
      return data.data;
    },
    refetchInterval: 30_000,  // Live polling every 30 s
    staleTime:       25_000,
    enabled:         !!deviceId,
  });
}
