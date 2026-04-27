import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  title: string;
  back?: boolean;
  right?: React.ReactNode;
}

export default function TopBar({ title, back = false, right }: TopBarProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between px-4 py-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        {back && (
          <button
            onClick={() => navigate(-1)}
            className="text-slate-400 text-xl p-1 -ml-1 active:scale-90 transition-transform"
          >
            ←
          </button>
        )}
        <h1 className="text-lg font-bold text-slate-100">{title}</h1>
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}
