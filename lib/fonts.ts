import { Fraunces, Hanken_Grotesk } from 'next/font/google';

export const displayFont = Fraunces({ subsets: ['latin'], variable: '--font-display', axes: ['opsz'], style: ['normal', 'italic'] });
export const bodyFont = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body' });
