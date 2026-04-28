'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { token, setAuth } = useAuthStore();
  const router = useRouter();

  useEffect(() => { if (token) router.replace('/home'); }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login' ? { email: form.email, password: form.password } : form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setAuth(data.token, data.user);
      router.replace('/home');
    } catch { setError('Erreur réseau'); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col min-h-dvh bg-slate-900">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <div className="mb-8 text-center">
          <div className="text-7xl mb-4">🏀</div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">
            Mon Petit<br /><span className="text-brand">Parquet</span>
          </h1>
          <p className="text-slate-400 text-sm mt-2">Fantasy Betclic Élite entre amis</p>
        </div>

        <div className="flex bg-slate-800 rounded-xl p-1 mb-6 w-full max-w-xs">
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === m ? 'bg-brand text-slate-900' : 'text-slate-400'}`}>
              {m === 'login' ? 'Connexion' : 'Inscription'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="w-full max-w-xs space-y-3">
          {mode === 'register' && (
            <input className="input-field" placeholder="Pseudo" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} autoComplete="username" />
          )}
          <input className="input-field" type="email" placeholder="Email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoComplete="email" />
          <input className="input-field" type="password" placeholder="Mot de passe" value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '…' : mode === 'login' ? 'Se connecter' : 'Créer un compte'}
          </button>
        </form>
      </div>
      <div className="pb-8 text-center text-xs text-slate-600">Betclic Élite Fantasy · Saison 2024-25</div>
    </div>
  );
}
