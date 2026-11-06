// Niveau de rareté : losanges et nom écrit, lisibles sans la couleur.

const LEVELS: Record<string, { level: number; max: number; label: string; color: string }> = {
  elite: { level: 4, max: 4, label: 'Élite', color: '#5B3FA6' },
  gold: { level: 3, max: 4, label: 'Gold', color: '#7E5409' },
  silver: { level: 2, max: 4, label: 'Silver', color: '#5E6C7B' },
  bronze: { level: 1, max: 4, label: 'Bronze', color: '#8A5A33' },
  star: { level: 2, max: 3, label: 'Star', color: '#7E5409' },
  basique: { level: 1, max: 3, label: 'Basique', color: '#5E6C7B' },
};

export default function TierPips({ tier, showLabel = true }: { tier: string; showLabel?: boolean }) {
  const t = tier === 'elite' ? { ...LEVELS.elite } : LEVELS[tier];
  if (!t) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: t.color }}>
      <span className="inline-flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: t.max }, (_, i) => (
          <span key={i} className="block w-[6px] h-[6px] rotate-45 border"
            style={{ borderColor: t.color, backgroundColor: i < t.level ? t.color : 'transparent' }} />
        ))}
      </span>
      {showLabel && t.label}
    </span>
  );
}
