/** Carte de manager de la page d'accueil : le pseudo s'y écrit pendant la saisie. */
export default function ManagerCard({ name }: { name: string }) {
  const clean = name.trim();
  // Le pseudo tient sur une ligne jusqu'à 20 caractères
  const size = clean.length > 15 ? '7.5cqw' : clean.length > 10 ? '9.5cqw' : '12cqw';

  return (
    <div className="mc-stage" aria-hidden="true">
      <div className="mc-back mc-back-silver" />
      <div className="mc-back mc-back-elite" />
      <div className="mc">
        <div className="mc-role">Mon Petit Parquet</div>
        <div className="mc-window">{clean ? clean[0].toUpperCase() : '?'}</div>
        <div className={`mc-name ${clean ? '' : 'mc-name-empty'}`} style={{ fontSize: clean ? size : '9.5cqw' }}>
          {clean || 'Ton nom ici'}
        </div>
        <div className="mc-season">Saison 2026-27</div>
      </div>
    </div>
  );
}
