import type { Viewport } from 'next';
import { Fraunces, Hanken_Grotesk } from 'next/font/google';
import './auth.css';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', axes: ['opsz'], style: ['normal', 'italic'] });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body' });

export const viewport: Viewport = { themeColor: '#F2F4F7' };

// Premier écran passé au thème clair : le reste de l'app suivra écran par écran.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className={`auth-light ${display.variable} ${body.variable}`}>{children}</div>;
}
