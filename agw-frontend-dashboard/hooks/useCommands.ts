import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { DeviceCommand, SendCommandPayload } from '@/types/command';

export function useCommands(deviceId?: string) {
  return useQuery<DeviceCommand[]>({
    queryKey: ['commands', deviceId],
    queryFn: async () => {
      const params = deviceId ? { device_id: deviceId } : {};
      const { data } = await apiClient.get('/api/iot/commands', { params });
      return data.data;
    },
    staleTime: 15_000,
  });
}

export function useSendCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SendCommandPayload) => {
      const { data } = await apiClient.post('/api/iot/commands', payload);
      return data.data as DeviceCommand;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commands'] });
    },
  });
}
