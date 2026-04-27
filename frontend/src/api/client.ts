import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

export const positionColors: Record<string, string> = {
  PG: 'bg-blue-500/20 text-blue-400',
  SG: 'bg-purple-500/20 text-purple-400',
  SF: 'bg-green-500/20 text-green-400',
  PF: 'bg-orange-500/20 text-orange-400',
  C: 'bg-red-500/20 text-red-400',
};

export const positionLabels: Record<string, string> = {
  PG: 'Meneur',
  SG: 'Arrière',
  SF: 'Ailier',
  PF: 'Ailier-fort',
  C: 'Pivot',
};

export const teamColors: Record<string, string> = {
  'ASVEL': '#C8102E',
  'Paris Basketball': '#002855',
  'Monaco': '#DA1D26',
  'JL Bourg': '#F7941D',
  'Strasbourg': '#003087',
  'Nanterre 92': '#E31837',
  'Le Mans': '#F59E0B',
  'Limoges CSP': '#C8102E',
};

export function getTeamInitials(team: string): string {
  return team.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
}
