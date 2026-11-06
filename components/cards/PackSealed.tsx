'use client';
import './cards.css';

/** Paquet fermé : feuille d'encre, bande de laiton. `tearing` joue la déchirure. */
export default function PackSealed({ tearing = false, idle = false, label = 'Paquet' }: { tearing?: boolean; idle?: boolean; label?: string }) {
  return (
    <div className={`pack-wrap ${idle ? 'pack-idle' : ''}`} aria-hidden="true">
      <div className={`pack ${tearing ? 'pack-tearing' : ''}`}>
        <i className="rings" />
        <i className="crimp" />
        <i className="band" />
        <div className="mark">
          <span className="mono">MPP</span>
          <span className="cap">{label}</span>
        </div>
        {!tearing && <i className="shine" />}
        <i className="pack-flash" />
      </div>
    </div>
  );
}
