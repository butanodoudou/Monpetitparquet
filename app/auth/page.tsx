'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, type AuthUser } from '@/store/authStore';
import { extractLoginToken, loginUrl } from '@/lib/login-link';
import LoginLinkBox from '@/components/LoginLinkBox';
import ManagerCard from '@/components/auth/ManagerCard';

interface Invite { leagueName: string; commissioner: string | null; memberCount: number }

export default function AuthPage() {
  const [mode, setMode] = useState<'register' | 'link'>('register');
  const [username, setUsername] = useState('');
  const [pasted, setPasted] = useState('');
  const [newLink, setNewLink] = useState('');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { token, setAuth } = useAuthStore();
  const router = useRouter();
  const linking = useRef(false);

  // Retour vers la page d'origine (ex. lien d'invitation) : chemin interne uniquement
  const nextUrl = () => {
    const next = new URLSearchParams(window.location.search).get('next');
    return next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
  };

  const loginWith = async (loginToken: string) => {
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginToken }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setMode('link'); return; }
      setAuth(data.token, data.user as AuthUser);
      router.replace(nextUrl());
    } catch { setError('Erreur réseau, réessaie dans un instant.'); }
    finally { setLoading(false); linking.current = false; }
  };

  // Ouverture d'un lien personnel : il prime sur une session déjà ouverte
  useEffect(() => {
    const fromUrl = extractLoginToken(window.location.hash);
    if (!fromUrl) return;
    linking.current = true;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    loginWith(fromUrl);
  }, []);

  useEffect(() => {
    if (token && !linking.current && !newLink) router.replace(nextUrl());
  }, [token, newLink]);

  // Arrivée par une invitation : on dit qui invite et dans quelle ligue
  useEffect(() => {
    const code = new URLSearchParams(nextUrl().split('?')[1] ?? '').get('join');
    if (!code) return;
    fetch(`/api/leagues/invite/${encodeURIComponent(code)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setInvite(data); })
      .catch(() => { /* sans aperçu, l'accueil standard reste valable */ });
  }, []);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      // Le lien s'affiche avant la redirection : c'est le seul moyen de revenir sur ce compte
      setNewLink(loginUrl(data.loginToken));
      setAuth(data.token, data.user as AuthUser);
    } catch { setError('Erreur réseau, réessaie dans un instant.'); }
    finally { setLoading(false); }
  };

  const submitLink = (e: React.FormEvent) => {
    e.preventDefault();
    const found = extractLoginToken(pasted);
    if (!found) { setError('Ce texte ne contient pas de lien personnel.'); return; }
    linking.current = true;
    loginWith(found);
  };

  if (newLink) {
    return (
      <main className="auth-page">
        <ManagerCard name={username} />
        <div className="auth-copy">
          <h1 className="auth-title">Bienvenue sur le parquet, {username.trim()}.</h1>
          <p className="auth-sub">
            Pas de mot de passe ici. Ce lien te ramène sur ton compte depuis un autre appareil : garde-le pour toi, dans tes notes par exemple.
          </p>
        </div>
        <div className="auth-form">
          <LoginLinkBox link={newLink} shareText="Mon lien Mon Petit Parquet, à garder pour moi" />
          <button type="button" className="btn-primary" onClick={() => router.replace(`/packs?next=${encodeURIComponent(nextUrl())}`)}>
            Ouvrir mes paquets
          </button>
          <p className="auth-foot">Cinq paquets de bienvenue t&apos;attendent. Tu retrouveras ton lien sur l&apos;accueil de l&apos;app.</p>
        </div>
      </main>
    );
  }

  const others = invite ? invite.memberCount - 1 : 0;

  return (
    <main className="auth-page">
      <ManagerCard name={mode === 'register' ? username : ''} />

      <div className="auth-copy">
        {invite ? (
          <>
            <h1 className="auth-title">
              {invite.commissioner ? `${invite.commissioner} t'a gardé une place.` : 'Une place t’attend.'}
            </h1>
            <p className="auth-sub">
              {others > 0
                ? `Dans « ${invite.leagueName} », ${others} ${others > 1 ? 'autres managers sont déjà là' : 'autre manager est déjà là'}. Il ne manque plus que toi.`
                : `Choisis ton nom de manager et rejoins « ${invite.leagueName} ».`}
            </p>
          </>
        ) : mode === 'register' ? (
          <>
            <h1 className="auth-title">Ton équipe, tes potes, la LNB Élite.</h1>
            <p className="auth-sub">Ouvre tes paquets, aligne ton cinq et défie tes amis chaque semaine.</p>
          </>
        ) : (
          <>
            <h1 className="auth-title">Content de te revoir.</h1>
            <p className="auth-sub">Colle le lien personnel que tu as gardé à ton inscription.</p>
          </>
        )}
      </div>

      <form onSubmit={mode === 'register' ? register : submitLink} className="auth-form">
        {mode === 'register' ? (
          <input className="input-field" placeholder="Ton nom de manager" aria-label="Ton nom de manager" value={username}
            maxLength={20} onChange={e => setUsername(e.target.value)} autoComplete="nickname" />
        ) : (
          <input className="input-field" placeholder="Ton lien personnel" aria-label="Ton lien personnel" value={pasted}
            onChange={e => setPasted(e.target.value)} autoComplete="off" />
        )}

        {error && <div className="auth-error" role="alert">{error}</div>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? '…' : mode === 'register' ? 'Entrer sur le parquet' : 'Me reconnecter'}
        </button>

        <button type="button" className="auth-switch"
          onClick={() => { setMode(mode === 'register' ? 'link' : 'register'); setError(''); }}>
          {mode === 'register' ? "J'ai déjà un compte" : 'Je suis nouveau'}
        </button>
      </form>
    </main>
  );
}
