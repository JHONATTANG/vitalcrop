import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { TelemetryBucket } from '@/types/telemetry';

export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

const BUCKET_MAP: Record<TimeRange, string> = {
  '1h':  '5 minutes',
  '6h':  '15 minutes',
  '24h': '1 hour',
  '7d':  '6 hours',
  '30d': '1 day',
};

const INTERVAL_MAP: Record<TimeRange, number> = {
  '1h':   1 * 60 * 60 * 1000,
  '6h':   6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':   7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function useTelemetryHistory(deviceId: string, range: TimeRange = '24h') {
  const to   = new Date();
  const from = new Date(to.getTime() - INTERVAL_MAP[range]);

  return useQuery<TelemetryBucket[]>({
    queryKey: ['telemetry', deviceId, 'history', range],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/api/iot/telemetry/${deviceId}/history`, {
          params: {
            from:   from.toISOString(),
            to:     to.toISOString(),
            bucket: BUCKET_MAP[range],
          },
        }
      );
      return data.data;
    },
    enabled:   !!deviceId,
    staleTime: 60_000,
  });
}
