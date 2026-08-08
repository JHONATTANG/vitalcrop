import axios from 'axios';
import { getCookie } from 'cookies-next';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// ── Request: inject JWT automatically ──────────────────────
apiClient.interceptors.request.use((config) => {
  let token;
  if (typeof window !== 'undefined') {
    // Client side
    token = getCookie('jwt');
  } else {
    // Server side - we might not have direct access to cookies here without passing them
    // but typically apiClient is used client-side for React Query.
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response: redirect to /login on 401 ────────────────────
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
