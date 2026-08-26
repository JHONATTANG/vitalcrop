import { cn } from '@/lib/utils';

/**
 * Envoltura de cada pantalla: márgenes, ancho máximo y —lo importante—
 * el scroll.
 *
 * El layout del panel es `h-screen overflow-hidden` para que la barra
 * lateral no se desplace con el contenido. Eso significa que la única
 * región que puede desplazarse es esta, y que una página que no use
 * este componente queda atrapada: se renderiza entera pero solo se ve
 * lo que cabe en la altura de la ventana, sin forma de llegar al resto.
 *
 * Es exactamente lo que les pasaba a las pantallas de telecomunicaciones
 * y del nodo fog, que devolvían un `<div>` pelado. Se veía el primer
 * gráfico y nada más, y el contenido además tocaba los bordes por la
 * falta del padding que va aquí.
 */

interface Props {
  children: React.ReactNode;
  className?: string;
  /**
   * `ancho` da aire a las pantallas de análisis. Los paneles densos con
   * gráficas a dos columnas se quedan estrechos en 80rem, mientras que
   * el texto de las pantallas de gestión se vuelve incómodo de leer si
   * se estira más.
   */
  ancho?: 'normal' | 'amplio';
}

export default function PageContainer({ children, className, ancho = 'normal' }: Props) {
  return (
    <main
      className={cn(
        'flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-bg-primary',
        'px-4 py-5 sm:px-6 sm:py-6',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto animate-fadeIn',
          ancho === 'amplio' ? 'max-w-[104rem]' : 'max-w-7xl',
        )}
      >
        {children}
      </div>
    </main>
  );
}
