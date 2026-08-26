/**
 * Hooks del panel de telecomunicaciones (MCD §9).
 *
 * Todos apuntan a /api/metricas/*, donde las agregaciones ya vienen
 * hechas en SQL. Aquí no se calcula ninguna métrica: si la definición
 * de "pérdida" viviera también en TypeScript, habría dos definiciones
 * distintas en el sistema y ninguna sería la de referencia.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';

const REFRESCO = Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || 15_000;

// ── Tipos que devuelve la API ─────────────────────────────────

export interface ResumenTelecom {
  ventana_dias: number;
  cobertura: {
    tramas: number;
    desde: string | null;
    hasta: string | null;
    nodos: number;
    versiones_fw: number;
  };
  rssi: {
    media: number | null; minimo: number | null; maximo: number | null;
    sigma: number | null; p05: number | null; p50: number | null;
    p95: number | null; pct_bajo_umbral: number | null; objetivo_dbm: number;
  };
  perdida: {
    esperadas: number; recibidas: number; perdidas: number;
    pct: number | null; objetivo_pct: number;
  };
  jitter_por_cadencia: Array<{
    cadencia_s: number; n: number; media_s: number;
    sigma_s: number; min_s: number; max_s: number;
  }>;
  reinicios_nodo: { n: number; ultimo: string | null };
  latencia_subida: {
    n: number; media_ms: number | null; p95_ms: number | null;
    objetivo_ms: number; estado: string;
  };
  no_instrumentado: Record<string, string>;
}

export interface CeldaHeatmap {
  dia: string; hora: number; valor: number | null; muestras: number;
}

export interface BinDistribucion {
  desde: number; hasta: number; n: number; pct: number; cdf: number;
}

export interface PuntoSerie {
  t: string; media: number; minimo: number; maximo: number; n: number;
}

export interface EventoNodo {
  ts: string; sensor_id: string; evento: string; detalle: Record<string, unknown>;
}

export interface DiaRiego {
  dia: string; ciclos: number; min_bomba: number; s_min: number; s_max: number;
}

export interface EstadoGateway {
  ultima_trama: string | null;
  silencio_s: number;
  estado: string;
  ingesta_en_vivo: number;
  por_origen: Array<{ origen: string; n: number; desde: string; hasta: string }>;
  eventos_recientes: Array<{ ts: string; evento: string; sensor_id: string }>;
}

// ── Hooks ─────────────────────────────────────────────────────

export function useResumenTelecom(dias = 7) {
  return useQuery<ResumenTelecom>({
    queryKey: ['telecom', 'resumen', dias],
    queryFn: async () =>
      (await apiClient.get(`/api/metricas/resumen?dias=${dias}`)).data,
    refetchInterval: REFRESCO,
  });
}

export function useHeatmap(metrica = 'rssi', dias = 14) {
  return useQuery<{ metrica: string; celdas: CeldaHeatmap[]; min: number; max: number }>({
    queryKey: ['telecom', 'heatmap', metrica, dias],
    queryFn: async () =>
      (await apiClient.get(`/api/metricas/heatmap?metrica=${metrica}&dias=${dias}`)).data,
    // El mapa de calor agrega por hora: refrescarlo cada 15 s no cambia
    // nada y son 335 celdas por viaje.
    refetchInterval: 5 * 60_000,
  });
}

export function useDistribucion(metrica = 'rssi', dias = 30, bins = 24) {
  return useQuery<{ metrica: string; n: number; min: number; max: number; bins: BinDistribucion[] }>({
    queryKey: ['telecom', 'distribucion', metrica, dias, bins],
    queryFn: async () =>
      (await apiClient.get(
        `/api/metricas/distribucion?metrica=${metrica}&dias=${dias}&bins=${bins}`)).data,
    refetchInterval: 5 * 60_000,
  });
}

export function useSerie(metrica = 'rssi', dias = 7, bucketMin = 30) {
  return useQuery<{ metrica: string; bucket_min: number; puntos: PuntoSerie[] }>({
    queryKey: ['telecom', 'serie', metrica, dias, bucketMin],
    queryFn: async () =>
      (await apiClient.get(
        `/api/metricas/series?metrica=${metrica}&dias=${dias}&bucket_min=${bucketMin}`)).data,
    refetchInterval: 60_000,
  });
}

export function useEventos(dias = 7, tipo?: string) {
  const q = tipo ? `&tipo=${encodeURIComponent(tipo)}` : '';
  return useQuery<{ resumen: Array<{ evento: string; n: number; ultimo: string }>; eventos: EventoNodo[] }>({
    queryKey: ['telecom', 'eventos', dias, tipo],
    queryFn: async () =>
      (await apiClient.get(`/api/metricas/eventos?dias=${dias}${q}`)).data,
    refetchInterval: REFRESCO,
  });
}

export function useRiego(dias = 14) {
  return useQuery<{ por_dia: DiaRiego[] }>({
    queryKey: ['telecom', 'riego', dias],
    queryFn: async () => (await apiClient.get(`/api/metricas/riego?dias=${dias}`)).data,
    refetchInterval: 60_000,
  });
}

export function useGateway() {
  return useQuery<EstadoGateway>({
    queryKey: ['telecom', 'gateway'],
    queryFn: async () => (await apiClient.get('/api/metricas/gateway')).data,
    refetchInterval: REFRESCO,
  });
}
