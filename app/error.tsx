'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      <h1 className="text-2xl font-black text-ink mb-2">Oups, faute technique</h1>
      <p className="text-ink2 text-sm mb-6">Une erreur est survenue. Réessaie ou reviens à l'accueil.</p>
      <div className="w-full max-w-xs space-y-2">
        <button className="btn-primary" onClick={reset}>Réessayer</button>
        <a href="/home" className="btn-secondary block text-center">Accueil</a>
      </div>
    </div>
  );
}
