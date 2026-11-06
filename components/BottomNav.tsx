'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from '@/components/Icon';

const items: { href: string; icon: IconName; label: string }[] = [
  { href: '/home', icon: 'home', label: 'Accueil' },
  { href: '/leagues', icon: 'trophy', label: 'Ligues' },
  { href: '/players', icon: 'ball', label: 'Joueurs' },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-paper border-t border-line z-50">
      <div className="flex items-center justify-around h-16 px-4">
        {items.map(item => {
          const active = path === item.href || (item.href !== '/home' && path.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}
              className={`flex flex-col items-center gap-0.5 flex-1 py-2 rounded-xl transition-colors ${active ? 'text-brand' : 'text-ink2'}`}>
              <Icon name={item.icon} />
              <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
