import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { Alert } from '@/types/alert';

export function useAlerts(onlyUnread = false) {
  return useQuery<Alert[]>({
    queryKey: ['alerts', { onlyUnread }],
    queryFn: async () => {
      const params = onlyUnread ? { is_read: false } : {};
      const { data } = await apiClient.get('/api/iot/alerts', { params });
      return data.data;
    },
    refetchInterval: 60_000,
    staleTime:       30_000,
  });
}

export function useMarkAlertsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertIds: string[]) => {
      await apiClient.patch('/api/iot/alerts/read', { alert_ids: alertIds });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
