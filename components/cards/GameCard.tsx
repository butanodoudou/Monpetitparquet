'use client';
import { useRef, useState } from 'react';
import { RARITY_CONFIG } from '@/lib/cards';
import type { CardView } from '@/lib/card-view';
import { formatPoints } from '@/lib/format';
import { positionName } from '@/components/cards/labels';
import './cards.css';

export type CardSize = 'mini' | 'medium' | 'reveal';

/** Largeur par défaut de chaque taille. Le contenu s'adapte tout seul à la largeur réelle (container queries). */
const SIZE_WIDTH: Record<CardSize, number> = { mini: 96, medium: 164, reveal: 260 };

interface Props {
  card: CardView;
  size?: CardSize;
  /** Remplit la largeur du parent au lieu de la largeur de la taille. */
  fluid?: boolean;
  /** Le reflet suit le doigt. */
  tilt?: boolean;
  /** Joue le reflet de révélation (Gold) ou le halo (Platine). */
  moment?: boolean;
  className?: string;
}

/**
 * La carte d'un joueur. Un seul balisage pour les trois tailles : tout est dimensionné en cqw.
 * Le niveau du joueur n'apparaît jamais : la carte montre sa rareté et sa moyenne.
 */
export default function GameCard({ card, size = 'medium', fluid = false, tilt = false, moment = false, className = '' }: Props) {
  const { player, rarity } = card;
  const cfg = RARITY_CONFIG[rarity];
  const tiltRef = useRef<HTMLDivElement>(null);
  const [noPhoto, setNoPhoto] = useState(!player.photo_url);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!tilt || !el) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.classList.add('live');
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--ry', `${(px - 0.5) * 16}deg`);
    el.style.setProperty('--rx', `${(0.5 - py) * 12}deg`);
  };
  const onLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.classList.remove('live');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  const label = `${player.name}, ${player.team}, ${positionName(player.position)}, ${cfg.label}, moyenne ${formatPoints(player.season_avg_fantasy)}`;

  return (
    <div className={`gc-wrap ${className}`} style={fluid ? undefined : { width: SIZE_WIDTH[size], maxWidth: '100%' }}
      role="img" aria-label={label}>
      <div ref={tiltRef} className="gc-tilt" onPointerMove={onMove} onPointerLeave={onLeave} onPointerCancel={onLeave}
        onPointerUp={tilt ? onLeave : undefined}>
        <div className={`gc t-${rarity}`} aria-hidden="true">
          <i className="gc-grain" />
          <i className="gc-guil" />
          <i className="gc-rule" />

          <div className="gc-top">
            <div className="gc-row1">
              <span className="gc-tier">{cfg.label}</span>
              <span className="gc-pips">
                {[1, 2, 3, 4].map(n => <i key={n} className={n <= cfg.level ? 'on' : ''} />)}
              </span>
            </div>
            <div className="gc-row2">
              <div>
                <span className="gc-score">{formatPoints(player.season_avg_fantasy)}</span>
                <span className="gc-scorelbl">moyenne</span>
              </div>
              <span className="gc-pos">{positionName(player.position)}</span>
            </div>
          </div>

          <div className="gc-win">
            {noPhoto ? (
              <div className="gc-nophoto">
                <b>{player.jersey_number != null ? player.jersey_number : '–'}</b>
                <span>maillot</span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.photo_url ?? ''} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setNoPhoto(true)} />
            )}
            <i className="fade" />
            <i className="tint" />
          </div>

          <div className="gc-foot">
            <div className="gc-name">{player.name}</div>
            <div className="gc-club">{player.team}</div>
          </div>

          <i className="gc-sheen" />
          <i className="gc-pearl" />
          {moment && rarity === 'gold' && <i className="glint" />}
        </div>
      </div>
    </div>
  );
}

/** Dos de carte : neutre, il ne trahit pas la rareté. */
export function CardBack({ size = 'medium', fluid = false }: { size?: CardSize; fluid?: boolean }) {
  return (
    <div className="gc-wrap" style={fluid ? undefined : { width: SIZE_WIDTH[size], maxWidth: '100%' }} aria-hidden="true">
      <div className="gc gc-back"><i className="ring"><span className="mono">MPP</span></i></div>
    </div>
  );
}

/** Place vide dans une composition. */
export function EmptyCard({ label }: { label: string }) {
  return (
    <div className="gc-wrap">
      <div className="gc-empty">
        <svg width="22%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span style={{ fontSize: '11cqw', fontWeight: 600 }}>{label}</span>
      </div>
    </div>
  );
}
