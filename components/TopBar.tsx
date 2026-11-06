'use client';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';

interface TopBarProps {
  title: string;
  back?: boolean;
  /** Si fourni, le retour mène à cette URL au lieu de l'historique. */
  backHref?: string;
  right?: React.ReactNode;
}

export default function TopBar({ title, back = false, backHref, right }: TopBarProps) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between px-4 py-4 bg-paper border-b border-line sticky top-0 z-40">
      <div className="flex items-center gap-3">
        {(back || backHref) && (
          <button onClick={() => (backHref ? router.push(backHref) : router.back())}
            className="text-ink2 text-xl p-1 -ml-1 active:scale-90 transition-transform">
            <Icon name="back" />
          </button>
        )}
        <h1 className="font-display text-xl font-bold text-ink">{title}</h1>
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}
