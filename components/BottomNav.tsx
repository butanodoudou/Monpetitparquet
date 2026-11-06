'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from '@/components/Icon';

const items: { href: string; icon: IconName; label: string }[] = [
  { href: '/home', icon: 'home', label: 'Accueil' },
  { href: '/leagues', icon: 'trophy', label: 'Ligues' },
  { href: '/collection', icon: 'cards', label: 'Cartes' },
  { href: '/players', icon: 'ball', label: 'Joueurs' },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Navigation principale" className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-paper border-t border-line z-50">
      <div className="flex items-center justify-around h-16 px-2">
        {items.map(item => {
          const active = path === item.href || (item.href !== '/home' && path.startsWith(item.href))
            || (item.href === '/collection' && path.startsWith('/packs'));
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[48px] py-1.5 rounded-xl transition-colors ${active ? 'text-brand' : 'text-ink2'}`}>
              <Icon name={item.icon} />
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
