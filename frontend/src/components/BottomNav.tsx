import { NavLink } from 'react-router-dom';

const items = [
  { to: '/home', icon: '🏠', label: 'Accueil' },
  { to: '/leagues', icon: '🏆', label: 'Ligues' },
  { to: '/players', icon: '🏀', label: 'Joueurs' },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-slate-900 border-t border-slate-700 z-50">
      <div className="flex items-center justify-around h-16 px-4">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 flex-1 py-2 rounded-xl transition-colors ${
                isActive ? 'text-brand' : 'text-slate-400'
              }`
            }
          >
            <span className="text-2xl leading-none">{item.icon}</span>
            <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
