import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mon Petit Parquet',
  description: 'Fantasy basketball Betclic Élite entre amis',
  themeColor: '#0F172A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
