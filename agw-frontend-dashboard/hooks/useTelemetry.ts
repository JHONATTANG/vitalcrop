import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';

export interface TelemetryData {
  timestamp: string;
  temperature: number;
  humidity: number;
  soil_moisture: number;
  ph: number;
  light_level: number;
  is_watering: boolean;
}

export function useTelemetry(nodeId: string | null) {
  return useQuery<TelemetryData[]>({
    queryKey: ['telemetry', nodeId],
    queryFn: async () => {
      if (!nodeId) return [];
      const { data } = await apiClient.get(`/api/telemetria/${nodeId}`);
      return data; // Adjust based on actual API response format, usually data or data.items
    },
    enabled: !!nodeId,
    refetchInterval: 30_000, // Refresh every 30s for live data
  });
}
