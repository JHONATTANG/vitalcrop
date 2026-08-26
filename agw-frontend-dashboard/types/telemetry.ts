/**
 * Telemetria tal como la sirve la Cloud API.
 *
 * Refleja las columnas de `telemetria_indoor` despues de la migracion
 * 002, que añadio lo que el nodo ya publicaba y la ingesta descartaba.
 * Casi todo es opcional porque un modulo de sensor apagado omite su
 * campo en vez de mandar un cero — asi el gateway distingue "sensor
 * inactivo" de "cero real".
 */

export interface TelemetryData {
  id?: number;
  created_at?: string;
  /** Instante de recepcion en el gateway. Con created_at da la latencia de subida. */
  t_rx?: string;

  /** ID del GATEWAY (Raspberry), no del ESP32. */
  node_id: string;
  /** ID del NODO ESP32. */
  sensor_id?: string;

  temperatura?: number | null;
  humedad_ambiente?: number | null;
  humedad_suelo?: number | null;
  ph?: number | null;

  rssi?: number | null;
  ec?: number | null;
  tds?: number | null;
  agua?: boolean | null;
  nivel_raw?: number | null;

  fw?: string;
  uptime_ms?: number;
  periodo_ms?: number;
  estado_actuadores?: string | null;
  origen?: 'directo' | 'backfill';

  /**
   * Nombres en ingles que usan las graficas. Obligatorios porque los
   * componentes los leen sin comprobar; el adaptador de la API es quien
   * debe rellenarlos.
   */
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
  soil_moisture: number | null;
  is_watering: boolean;

  /**
   * Estado de actuadores desglosado. La API lo sirve como cadena en
   * `estado_actuadores`; estos campos son los que el adaptador debe
   * producir para que los controles reflejen el estado real.
   */
  pump_active?: boolean;
  valve_1_open?: boolean;
  valve_2_open?: boolean;
  water_level?: number | null;
  /** Temperatura de la solucion. Sin sonda sumergida todavia. */
  water_temp?: number | null;
}

export interface SensorReading {
  label: string;
  value: number | null;
  unit: string;
  timestamp?: string;
}

/**
 * Alias historico. Varios componentes lo importan con este nombre; en
 * vez de renombrarlos todos y arriesgar un despiste, se exporta el
 * mismo tipo con los dos nombres.
 */
export type TelemetryRecord = TelemetryData;

/**
 * Punto agregado por ventana, tal como lo sirve /api/metricas/series.
 * La agregacion se hace en SQL: mandar la serie cruda para agrupar en
 * el navegador son 31.000 filas por viaje.
 */
export interface TelemetryBucket {
  t: string;
  /** Alias del instante que usa TelemetryChart. */
  bucket?: string;
  media: number;
  minimo: number;
  maximo: number;
  n: number;
}
