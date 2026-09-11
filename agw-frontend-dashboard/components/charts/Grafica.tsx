'use client';

/**
 * `ReactECharts` que se redimensiona con su contenedor.
 *
 * `echarts-for-react` solo escucha el `resize` de la ventana. Una
 * gráfica que se monta dentro de una pestaña, de un grid que cambia de
 * columnas o de un panel que aún mide cero en el primer render se
 * queda con ese ancho para siempre: la barra de color sale cortada,
 * el eje se recorta a la mitad y la nube de puntos queda fuera del
 * área visible. Se vio en la ficha de un nodo, con la correlación
 * dentro de la pestaña «Lecturas».
 *
 * Un `ResizeObserver` sobre el contenedor lo resuelve para todas las
 * gráficas de una vez. Es un reemplazo directo de `ReactECharts`:
 * mismas props, misma `ref`.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsReactProps } from 'echarts-for-react';

const Grafica = forwardRef<ReactECharts, EChartsReactProps>(function Grafica(props, ref) {
  const interno = useRef<ReactECharts>(null);
  const caja = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => interno.current as ReactECharts);

  useEffect(() => {
    const el = caja.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Solo si el ancho cambió de verdad. `resize()` toca el canvas, el
    // canvas es hijo del contenedor observado, y sin esta guarda el
    // observer se dispara a sí mismo en bucle.
    let ancho = el.clientWidth;
    const ro = new ResizeObserver((entradas) => {
      const nuevo = Math.round(entradas[0]?.contentRect.width ?? el.clientWidth);
      if (nuevo === ancho || nuevo === 0) return;
      ancho = nuevo;
      interno.current?.getEchartsInstance().resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={caja} style={{ width: '100%' }}>
      <ReactECharts ref={interno} {...props} />
    </div>
  );
});

export default Grafica;
