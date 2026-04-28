import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { randomBytes } from 'crypto';

export async function GET(req: NextRequest) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const { data: memberships } = await supabase
    .from('league_members')
    .select('league_id, team_name, draft_position')
    .eq('user_id', auth.userId);

  if (!memberships?.length) return NextResponse.json([]);

  const leagueIds = memberships.map(m => m.league_id);
  const { data: leagues } = await supabase
    .from('leagues')
    .select('*, commissioner:users!leagues_commissioner_id_fkey(username)')
    .in('id', leagueIds)
    .order('created_at', { ascending: false });

  // Attach member count and my team info
  const result = await Promise.all((leagues ?? []).map(async l => {
    const { count } = await supabase
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', l.id);
    const membership = memberships.find(m => m.league_id === l.id);
    return {
      ...l,
      commissioner_name: (l.commissioner as any)?.username,
      member_count: count ?? 0,
      team_name: membership?.team_name,
      draft_position: membership?.draft_position,
    };
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { name, teamName, maxTeams = 8, picksPerTeam = 5 } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Nom de ligue requis' }, { status: 400 });
  if (!teamName?.trim()) return NextResponse.json({ error: "Nom d'équipe requis" }, { status: 400 });

  const supabase = db();
  const inviteCode = randomBytes(4).toString('hex').toUpperCase();

  const { data: league, error } = await supabase
    .from('leagues')
    .insert({ name: name.trim(), invite_code: inviteCode, commissioner_id: auth.userId, max_teams: maxTeams, picks_per_team: picksPerTeam })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Erreur création ligue' }, { status: 500 });

  await supabase.from('league_members').insert({ league_id: league.id, user_id: auth.userId, team_name: teamName.trim() });

  return NextResponse.json(league);
}
