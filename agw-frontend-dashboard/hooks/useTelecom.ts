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
    n: number; media_ms: number | null; minimo_ms: number | null;
    p50_ms: number | null; p95_ms: number | null;
    objetivo_ms: number; umbral_en_vivo_ms: number; estado: string;
  };
  /**
   * Tramas que subieron desde el buffer del borde tras un corte, no por
   * el camino en vivo. Van aparte porque promediarlas con las otras
   * daba una "latencia" de horas que no describía ninguno de los dos
   * caminos.
   */
  recuperacion_de_buffer?: { n: number; peor_horas: number | null };
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

// ── Series cruzadas ───────────────────────────────────────────
//
// Los hooks de arriba sirven una métrica cada uno. Comparar varias
// pidiéndolas por separado sale mal: cada consulta agrupa por su cuenta
// y basta que a una le falte un bucket para que las series queden
// desplazadas entre sí. `/multiserie` las agrupa contra la misma
// rejilla, así que los huecos son nulos de verdad.

export interface PuntoMultiserie {
  t: string;
  n: number;
  temperatura?: number | null;
  humedad_ambiente?: number | null;
  humedad_suelo?: number | null;
  ec?: number | null;
  tds?: number | null;
  rssi?: number | null;
  nivel_raw?: number | null;
}

export interface DiaBalance {
  dia: string;
  tramas: number;
  esperadas: number;
  rssi_medio: number | null;
  rssi_min: number | null;
  temp_media: number | null;
  hum_media: number | null;
  ec_media: number | null;
  periodo_ms: number | null;
  tramas_rssi_bajo: number;
  reinicios: number;
  ciclos_riego: number;
  min_bomba: number;
}

export interface PuntoCorrelacion { x: number; y: number; hora: number }

export interface HoraPerfil {
  hora: number;
  n: number;
  temperatura: number | null;
  humedad: number | null;
  ec: number | null;
  rssi: number | null;
  rssi_sigma: number | null;
  rssi_bajo: number;
}

export function useMultiserie(
  metricas = 'temperatura,humedad_ambiente,ec,rssi',
  dias = 7,
  bucketMin = 30,
) {
  return useQuery<{ metricas: string[]; bucket_min: number; puntos: PuntoMultiserie[] }>({
    queryKey: ['telecom', 'multiserie', metricas, dias, bucketMin],
    queryFn: async () =>
      (await apiClient.get(
        `/api/metricas/multiserie?metricas=${encodeURIComponent(metricas)}` +
        `&dias=${dias}&bucket_min=${bucketMin}`)).data,
    refetchInterval: 60_000,
  });
}

export function useDiario(dias = 21) {
  return useQuery<{ dias: DiaBalance[] }>({
    queryKey: ['telecom', 'diario', dias],
    queryFn: async () => (await apiClient.get(`/api/metricas/diario?dias=${dias}`)).data,
    // Agrega por día: refrescarlo cada 15 s no cambiaría ninguna barra.
    refetchInterval: 5 * 60_000,
  });
}

export function useCorrelacion(x = 'temperatura', y = 'ec', dias = 14, muestras = 1200) {
  return useQuery<{ x: string; y: string; r: number | null; n: number; puntos: PuntoCorrelacion[] }>({
    queryKey: ['telecom', 'correlacion', x, y, dias, muestras],
    queryFn: async () =>
      (await apiClient.get(
        `/api/metricas/correlacion?x=${x}&y=${y}&dias=${dias}&muestras=${muestras}`)).data,
    refetchInterval: 5 * 60_000,
  });
}

export function usePerfilHorario(dias = 14) {
  return useQuery<{
    horas: HoraPerfil[];
    riego_por_hora: Array<{ hora: number; ciclos: number }>;
  }>({
    queryKey: ['telecom', 'perfil-horario', dias],
    queryFn: async () =>
      (await apiClient.get(`/api/metricas/perfil-horario?dias=${dias}`)).data,
    refetchInterval: 5 * 60_000,
  });
}

// ── Fog ───────────────────────────────────────────────────────

export interface EstadoFog {
  ventana: { desde: string; hasta: string; dias: number; sin_nube: number; con_nube: number };
  autonomia: {
    dias_sin_nube: number;
    tramas_generadas_sin_nube: number;
    pct_del_historico_sin_nube: number;
  };
  decisiones_del_borde: Array<{ evento: string; n: number; primero: string; ultimo: string }>;
  riego_autonomo: { ciclos: number; minutos_bomba: number; dias_con_riego: number };
  recuperaciones: {
    n: number; mttr_s: number | null; peor_s: number | null; mejor_s: number | null;
    objetivo_s: number;
    detalle: Array<{ caida: string; vuelta: string; segundos: number }>;
  };
  huecos_de_datos: Array<{ desde: string; hasta: string; segundos: number }>;
}

export function useFog(dias = 30) {
  return useQuery<EstadoFog>({
    queryKey: ['telecom', 'fog', dias],
    queryFn: async () => (await apiClient.get(`/api/metricas/fog?dias=${dias}`)).data,
    refetchInterval: 60_000,
  });
}
