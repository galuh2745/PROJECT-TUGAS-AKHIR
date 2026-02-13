import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import Providers from '@/components/Providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Sistem Absensi Karyawan - CV Aswi Sentosa',
  description: 'Sistem Manajemen Absensi, Izin, Cuti, dan Lembur Karyawan',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}