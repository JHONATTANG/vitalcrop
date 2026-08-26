import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title:       'VitalCrop AGW — Panel de control',
  description: 'Monitoreo y control del cultivo en ambiente controlado, '
             + 'con analitica de telecomunicaciones del enlace IoT.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className={`${inter.variable} font-sans bg-bg-primary text-text-primary antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
