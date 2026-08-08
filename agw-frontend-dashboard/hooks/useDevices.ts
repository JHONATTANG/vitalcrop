import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { IoTDevice } from '@/types/device';

export function useDevices() {
  return useQuery<IoTDevice[]>({
    queryKey: ['devices'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/devices');
      return data;
    },
    staleTime: 60_000,
  });
}

export function useDevice(deviceId: string) {
  return useQuery<IoTDevice>({
    queryKey: ['devices', deviceId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/devices/${deviceId}`);
      return data;
    },
    enabled: !!deviceId,
    staleTime: 30_000,
  });
}
