import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Basalt PWA',
  description: 'AbsurderSQL-powered Obsidian rebuild (Next.js PWA).',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
