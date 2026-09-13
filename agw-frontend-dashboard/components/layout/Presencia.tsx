'use client';

/**
 * Presencia: le dice al gateway que hay alguien mirando.
 *
 * El gateway sube datos cada 30 min si nadie mira el panel y cada
 * 2 min si alguien lo mira. «Alguien mira» se define aquí, y solo
 * aquí: sesión iniciada (este componente vive dentro del layout
 * privado), pestaña visible, y alguna interacción —ratón, teclado,
 * toque, scroll— en los últimos 5 minutos. Mientras se cumpla, cada
 * minuto sale un latido a la API, que lo reenvía firmado al gateway
 * del usuario con un vencimiento de 3 min. Sin latidos, el gateway
 * vuelve a dormir solo; no hay que avisarle de que uno se fue.
 *
 * Cuando el usuario se ausenta pasan dos cosas más, y las dos
 * importan: dejan de salir latidos (el gateway duerme) y el panel deja
 * de consultar la API (`onlineManager` de TanStack en «offline» pausa
 * todos los refetch), porque un panel abierto sondeando cada 30 s
 * mantendría despierta la base igual que el gateway. Al volver, se
 * reanuda y las consultas caducadas se refrescan solas.
 *
 * El indicador del header sale de aquí: dice en qué modo está el
 * gateway según la última respuesta de la API, no según lo que el
 * panel cree.
 */
import { useEffect, useRef, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { Radio, Moon } from 'lucide-react';
import apiClient from '@/lib/api';

const LATIDO_MS = 60_000;          // cada cuánto se manda estando activo
const AUSENTE_MS = 5 * 60_000;     // sin interacción -> ausente
const PRESENCIA_S = 180;           // cuánto pide mantener despierto el gateway

type Estado = 'activo' | 'ausente' | 'oculto';

export function usePresencia() {
  const [estado, setEstado] = useState<Estado>('activo');
  const [gatewayDespierto, setGatewayDespierto] = useState<boolean | null>(null);
  const ultimaInteraccion = useRef<number>(Date.now());
  const ultimoLatido = useRef<number>(0);

  useEffect(() => {
    const marcar = () => { ultimaInteraccion.current = Date.now(); };
    const eventos: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }));

    const latir = async () => {
      ultimoLatido.current = Date.now();
      try {
        const { data } = await apiClient.post('/api/iot/presencia', { segundos: PRESENCIA_S });
        const r = Object.values((data?.gateways ?? {}) as Record<string, string>);
        setGatewayDespierto(r.length ? r.every((x) => x === 'entregado') : null);
      } catch {
        setGatewayDespierto(null);
      }
    };

    const evaluar = () => {
      const visible = document.visibilityState === 'visible';
      const reciente = Date.now() - ultimaInteraccion.current < AUSENTE_MS;
      const nuevo: Estado = !visible ? 'oculto' : reciente ? 'activo' : 'ausente';
      setEstado((prev) => {
        if (prev !== nuevo) {
          // Ausente u oculto: el panel deja de consultar. Activo: reanuda
          // y las consultas caducadas se refrescan solas.
          onlineManager.setOnline(nuevo === 'activo');
        }
        return nuevo;
      });
      if (nuevo === 'activo' && Date.now() - ultimoLatido.current >= LATIDO_MS) {
        void latir();
      }
    };

    evaluar();
    const timer = setInterval(evaluar, 5_000);
    document.addEventListener('visibilitychange', evaluar);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', evaluar);
      eventos.forEach((e) => window.removeEventListener(e, marcar));
      onlineManager.setOnline(true);
    };
  }, []);

  return { estado, gatewayDespierto };
}

/** El indicador del header. */
export default function Presencia() {
  const { estado, gatewayDespierto } = usePresencia();
  const activo = estado === 'activo';
  const texto = activo
    ? (gatewayDespierto === false ? 'En vivo · gateway sin webhook' : 'En vivo · el gateway sube cada 2 min')
    : 'Ausente · el gateway sube cada 30 min';
  return (
    <span
      title={activo
        ? 'Hay alguien mirando: el gateway sube cada 2 minutos mientras sigas aquí.'
        : 'Sin actividad 5 min: el panel deja de consultar y el gateway vuelve a subir cada 30 min. Mueve el ratón para reanudar.'}
      className={`hidden md:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        activo ? 'border-brand-green/40 text-brand-green bg-brand-green/10'
               : 'border-brand-border text-text-muted bg-bg-card'}`}
    >
      {activo ? <Radio size={11} className="animate-pulse" /> : <Moon size={11} />}
      {texto}
    </span>
  );
}
