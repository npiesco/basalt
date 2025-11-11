import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { RegisterServiceWorker } from './register-sw';

export const metadata: Metadata = {
  title: 'Basalt PWA',
  description: 'AbsurderSQL-powered Obsidian rebuild (Next.js PWA).',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Basalt',
  },
};

export const viewport: Viewport = {
  themeColor: '#1e40af',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1e40af" />
      </head>
      <body>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
