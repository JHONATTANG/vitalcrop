/**
 * Inventario de aparatos.
 *
 * Este hook pedía `/api/devices`, que devolvía 404: la API solo exponía
 * `/api/devices/gateways` y `/gateways/{uuid}/nodes`. Por eso el
 * dashboard y la página de dispositivos salían vacíos aunque el gateway
 * y el nodo llevaran dados de alta desde el primer día — no era que no
 * hubiera aparatos, es que se preguntaba en una puerta que no existía.
 *
 * Ahora la API sirve el inventario agregado en esa ruta, con el estado
 * deducido del silencio y la última lectura incluida.
 */
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { IoTDevice } from '@/types/device';

/** Lo que la API adjunta a cada nodo para no exigir una segunda llamada. */
export interface UltimaLectura {
  temperatura: number | null;
  humedad: number | null;
  ec: number | null;
  rssi: number | null;
  agua: boolean | null;
  uptime_ms: number | null;
}

export interface Dispositivo extends IoTDevice {
  /** Segundos desde la última trama. null = nunca publicó. */
  silencio_s?: number | null;
  ultima_lectura?: UltimaLectura;
}

export function useDevices() {
  return useQuery<Dispositivo[]>({
    queryKey: ['devices'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/devices');
      return Array.isArray(data) ? data : [];
    },
    // El estado se deduce del silencio, así que envejece solo: hay que
    // volver a preguntar aunque nadie toque la página, o un nodo caído
    // seguiría pintándose en verde indefinidamente.
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/**
 * Un aparato suelto.
 *
 * Se resuelve filtrando el inventario en lugar de pedir
 * `/api/devices/{id}`: ese endpoint no existe, y el inventario completo
 * son dos filas. Una petición por aparato no compraría nada.
 */
export function useDevice(deviceId: string) {
  const todos = useDevices();
  return {
    ...todos,
    data: todos.data?.find(
      (d) => d.id === deviceId || d.device_uid === deviceId || d.sensor_id === deviceId,
    ),
  };
}

/** Solo los nodos ESP32, sin el gateway. Lo que pintan las gráficas. */
export function useNodos() {
  const todos = useDevices();
  return {
    ...todos,
    data: todos.data?.filter((d) => d.device_type !== 'GATEWAY'),
  };
}
