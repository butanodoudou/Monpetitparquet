import type { Metadata, Viewport } from 'next';
import './globals.css';
import ClientOnly from '@/components/ClientOnly';
import { bodyFont, displayFont } from '@/lib/fonts';

export const metadata: Metadata = {
  title: 'Mon Petit Parquet',
  description: 'Fantasy basketball LNB Élite entre amis',
};

export const viewport: Viewport = {
  themeColor: '#F2F4F7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <ClientOnly>{children}</ClientOnly>
        </div>
      </body>
    </html>
  );
}
