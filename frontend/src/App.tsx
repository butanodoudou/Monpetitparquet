import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import api from './api/client';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import LeaguesPage from './pages/LeaguesPage';
import LeagueDetailPage from './pages/LeagueDetailPage';
import DraftPage from './pages/DraftPage';
import TeamPage from './pages/TeamPage';
import PlayersPage from './pages/PlayersPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token);
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { token, setAuth, logout } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    api.get('/auth/me')
      .then(({ data }) => setAuth(token, data))
      .catch(() => { logout(); navigate('/'); });
  }, []);

  return (
    <Routes>
      <Route path="/" element={token ? <Navigate to="/home" replace /> : <AuthPage />} />
      <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
      <Route path="/leagues" element={<RequireAuth><LeaguesPage /></RequireAuth>} />
      <Route path="/leagues/:id" element={<RequireAuth><LeagueDetailPage /></RequireAuth>} />
      <Route path="/leagues/:id/draft" element={<RequireAuth><DraftPage /></RequireAuth>} />
      <Route path="/leagues/:id/team" element={<RequireAuth><TeamPage /></RequireAuth>} />
      <Route path="/players" element={<RequireAuth><PlayersPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
