import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Frontera entre lo público y lo privado.
 *
 * `/` es la portada: qué es el cultivo, qué planta lleva y cómo está
 * montado el sistema. Se puede leer sin cuenta y no enseña ninguna
 * medición en vivo ni ningún mando. Todo lo demás —el panel, los
 * dispositivos, el control— exige la cookie de sesión.
 *
 * Antes `/` redirigía al panel, así que un visitante sin cuenta
 * aterrizaba directamente en el login sin saber de qué iba el sitio.
 */
const PUBLICAS = ['/', '/login'];

export function middleware(request: NextRequest) {
  const token = request.cookies.get('jwt')?.value;
  const ruta = request.nextUrl.pathname;
  const esPublica = PUBLICAS.includes(ruta);

  if (!token && !esPublica) {
    const destino = new URL('/login', request.url);
    // Para volver a donde iba una vez entre. Solo rutas internas: un
    // `next` con host ajeno sería una redirección abierta.
    if (ruta !== '/') destino.searchParams.set('next', ruta);
    return NextResponse.redirect(destino);
  }

  if (token && ruta === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Lo que lleva extensión es un archivo estático de `public/` y no
  // pasa por la sesión.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
