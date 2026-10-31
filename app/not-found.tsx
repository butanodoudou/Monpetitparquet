import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-900 px-6 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h1 className="text-2xl font-black text-slate-100 mb-2">Page introuvable</h1>
      <p className="text-slate-400 text-sm mb-6">Cette page n'existe pas ou a été déplacée.</p>
      <Link href="/home" className="btn-primary max-w-xs block text-center">Retour à l'accueil</Link>
    </div>
  );
}
