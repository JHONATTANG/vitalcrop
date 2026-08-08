import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export function useUser() {
  return useQuery<User>({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/users/me');
      return data; // Assuming it returns the user object directly, adjust if it's `{ data: User }`
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry if it fails (e.g. 401)
  });
}
