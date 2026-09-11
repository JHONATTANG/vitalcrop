'use client';

/**
 * Comunidad: un foro que todavía no guarda nada.
 *
 * Temas, hilos con comentarios y un formulario para responder. Todo
 * vive en memoria: al recargar vuelve a lo de muestra. Se dice en la
 * propia interfaz, porque un formulario que parece guardar y no guarda
 * es la peor de las mentiras de una web.
 *
 * Los comentarios de muestra son inventados, con preguntas reales del
 * cultivo en ambiente controlado en Colombia.
 */
import { useState } from 'react';
import { MessageCircle, ThumbsUp, Send, Info, Hash } from 'lucide-react';

interface Comentario {
  id: number;
  autor: string;
  lugar: string;
  hace: string;
  texto: string;
  gracias: number;
  propio?: boolean;
}

interface Hilo {
  id: string;
  tema: string;
  titulo: string;
  comentarios: Comentario[];
}

const TEMAS = ['Hidroponía en casa', 'Aromáticas', 'Riego y sensores', 'Plagas y hongos', 'Semilla y esqueje'];

const HILOS_INICIALES: Hilo[] = [
  {
    id: 'raiz', tema: 'Hidroponía en casa',
    titulo: '¿Cada cuánto debe correr la bomba en raíz flotante?',
    comentarios: [
      { id: 1, autor: 'Camila R.', lugar: 'Chía', hace: 'hace 3 días', gracias: 12,
        texto: 'Tengo lechugas en un tanque de 60 L con bomba de aire. La dejo prendida todo el día. ¿Es demasiado?' },
      { id: 2, autor: 'Jhonattan G.', lugar: 'Bogotá', hace: 'hace 3 días', gracias: 28,
        texto: 'Con aire continuo no hay problema, es lo más seguro. Nosotros usamos bomba de recirculación y no de aire: 3 minutos cada 15 de día y cada hora de noche. De noche la raíz respira menos y el agua se mantiene más fría si se mueve menos.' },
      { id: 3, autor: 'Andrés M.', lugar: 'Rionegro', hace: 'ayer', gracias: 5,
        texto: 'Ojo con la temperatura del agua en tanque pequeño: pasa de 24 °C en una tarde de sol y ahí empieza la pudrición de raíz. Sombra al tanque, no solo a la planta.' },
    ],
  },
  {
    id: 'hierbabuena', tema: 'Aromáticas',
    titulo: 'La hierbabuena crece pero huele a poco',
    comentarios: [
      { id: 4, autor: 'Luisa P.', lugar: 'Facatativá', hace: 'hace 5 días', gracias: 9,
        texto: 'Hojas grandes y verdes pero sin aroma. Está en fibra de coco con goteo, EC 2,4.' },
      { id: 5, autor: 'Diego T.', lugar: 'Madrid, Cund.', hace: 'hace 4 días', gracias: 31,
        texto: 'Demasiado nitrógeno: la planta hace hoja y no aceite. Baja la EC a 1,6–1,8 y dale más luz. Y corta seguido: el aroma está en el rebrote joven, no en la hoja vieja.' },
    ],
  },
  {
    id: 'sensores', tema: 'Riego y sensores',
    titulo: 'Sensor de humedad de suelo que marca siempre cero',
    comentarios: [
      { id: 6, autor: 'Mateo V.', lugar: 'Tunja', hace: 'hace 2 días', gracias: 7,
        texto: 'Un capacitivo en ESP32 que lee 0 aunque lo meta en agua. ¿Está dañado?' },
      { id: 7, autor: 'Jhonattan G.', lugar: 'Bogotá', hace: 'ayer', gracias: 14,
        texto: 'Casi siempre es el cableado o el pin: los capacitivos leen entre 1.500 y 3.500 en el ADC, nunca 0 exacto. Cero es «no hay señal». Revisa que esté en ADC1 (GPIO 32–39) si usas WiFi: el ADC2 deja de funcionar con la radio encendida.' },
    ],
  },
  {
    id: 'hongos', tema: 'Plagas y hongos',
    titulo: 'Polvo blanco en la albahaca de invernadero',
    comentarios: [
      { id: 8, autor: 'Sara L.', lugar: 'Pereira', hace: 'hace 6 días', gracias: 4,
        texto: 'Manchas blancas como talco en el haz de la hoja, y las de abajo se caen.' },
      { id: 9, autor: 'Andrés M.', lugar: 'Rionegro', hace: 'hace 5 días', gracias: 22,
        texto: 'Oídio. Humedad alta y poco aire. Antes que fungicida: ventilar, separar plantas y quitar hoja afectada. Bicarbonato de potasio al 0,5 % funciona en hoja que se come; el azufre mojable también, pero no en flor.' },
    ],
  },
];

export default function Comunidad() {
  const [hilos, setHilos] = useState<Hilo[]>(HILOS_INICIALES);
  const [tema, setTema] = useState<string | 'todos'>('todos');
  const [abierto, setAbierto] = useState<string>(HILOS_INICIALES[0].id);
  const [nombre, setNombre] = useState('');
  const [texto, setTexto] = useState('');
  const [avisado, setAvisado] = useState(false);

  const lista = hilos.filter((h) => tema === 'todos' || h.tema === tema);
  const hilo = hilos.find((h) => h.id === abierto) ?? lista[0];

  const publicar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim() || !hilo) return;
    const nuevo: Comentario = {
      id: Date.now(), autor: nombre.trim() || 'Alguien', lugar: '', hace: 'ahora',
      texto: texto.trim(), gracias: 0, propio: true,
    };
    setHilos((hs) => hs.map((h) => h.id === hilo.id ? { ...h, comentarios: [...h.comentarios, nuevo] } : h));
    setTexto(''); setAvisado(true);
  };

  const gracias = (cid: number) =>
    setHilos((hs) => hs.map((h) => ({
      ...h, comentarios: h.comentarios.map((c) => c.id === cid ? { ...c, gracias: c.gracias + 1 } : c),
    })));

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      {/* ── Temas e hilos ─────────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button onClick={() => setTema('todos')}
            className={`rounded-full px-3 py-1 text-xs font-medium border ${
              tema === 'todos' ? 'bg-campo-azul text-white border-campo-azul' : 'border-campo-linea text-campo-tinta-2'}`}>
            Todo
          </button>
          {TEMAS.map((t) => (
            <button key={t} onClick={() => setTema(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${
                tema === t ? 'bg-campo-azul text-white border-campo-azul' : 'border-campo-linea text-campo-tinta-2 hover:border-campo-tinta-3'}`}>
              {t}
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {lista.map((h) => (
            <li key={h.id}>
              <button onClick={() => setAbierto(h.id)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  hilo?.id === h.id ? 'border-campo-azul bg-campo-azul-suave' : 'border-campo-linea bg-campo-papel hover:border-campo-tinta-3'}`}>
                <span className="text-[10px] uppercase tracking-wider text-campo-tinta-3 flex items-center gap-1"><Hash size={10} /> {h.tema}</span>
                <span className="block text-sm font-semibold text-campo-tinta mt-0.5 leading-snug">{h.titulo}</span>
                <span className="text-[11px] text-campo-tinta-3 flex items-center gap-1 mt-1.5">
                  <MessageCircle size={11} /> {h.comentarios.length} respuesta{h.comentarios.length === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Hilo abierto ──────────────────────────────────────── */}
      {hilo && (
        <div className="rounded-2xl border border-campo-linea bg-campo-papel overflow-hidden">
          <header className="px-5 py-4 border-b border-campo-linea">
            <p className="text-[10px] uppercase tracking-wider text-campo-tinta-3">{hilo.tema}</p>
            <h3 className="font-display text-xl text-campo-tinta mt-1">{hilo.titulo}</h3>
          </header>

          <ol className="divide-y divide-campo-linea">
            {hilo.comentarios.map((c) => (
              <li key={c.id} className={`px-5 py-4 ${c.propio ? 'bg-campo-verde-suave' : ''}`}>
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="w-7 h-7 rounded-full bg-campo-verde-claro text-campo-verde-oscuro font-semibold
                                   flex items-center justify-center text-[11px] shrink-0 self-center">
                    {c.autor[0]}
                  </span>
                  <span className="font-semibold text-campo-tinta">{c.autor}</span>
                  {c.lugar && <span className="text-campo-tinta-3">· {c.lugar}</span>}
                  <span className="text-campo-tinta-3 ml-auto">{c.hace}</span>
                </div>
                <p className="text-sm text-campo-tinta-2 leading-relaxed mt-2 pl-9">{c.texto}</p>
                <button onClick={() => gracias(c.id)}
                  className="ml-9 mt-2 inline-flex items-center gap-1 text-[11px] text-campo-tinta-3 hover:text-campo-azul transition-colors">
                  <ThumbsUp size={11} /> Útil · {c.gracias}
                </button>
              </li>
            ))}
          </ol>

          <form onSubmit={publicar} className="px-5 py-4 border-t border-campo-linea bg-campo-hueso/50">
            <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre"
                className="rounded-lg border border-campo-linea bg-campo-papel px-3 py-2 text-sm text-campo-tinta
                           placeholder:text-campo-tinta-3 focus:outline-none focus:border-campo-azul" />
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responde al hilo…" rows={2}
                className="rounded-lg border border-campo-linea bg-campo-papel px-3 py-2 text-sm text-campo-tinta
                           placeholder:text-campo-tinta-3 focus:outline-none focus:border-campo-azul resize-y" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
              <p className="text-[11px] text-campo-tinta-3 flex items-center gap-1.5">
                <Info size={12} className="shrink-0" />
                {avisado
                  ? 'Publicado solo en esta pestaña: al recargar desaparece. La comunidad aún no guarda.'
                  : 'Comentarios de muestra. Esta comunidad todavía no guarda nada.'}
              </p>
              <button type="submit" disabled={!texto.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-campo-azul px-4 py-2 text-sm font-medium text-white
                           hover:opacity-90 disabled:opacity-40 transition-opacity">
                <Send size={14} /> Responder
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
