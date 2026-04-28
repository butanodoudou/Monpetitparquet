import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { inviteCode, teamName } = await req.json();
  if (!inviteCode?.trim()) return NextResponse.json({ error: "Code d'invitation requis" }, { status: 400 });
  if (!teamName?.trim()) return NextResponse.json({ error: "Nom d'équipe requis" }, { status: 400 });

  const supabase = db();
  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .eq('invite_code', inviteCode.trim().toUpperCase())
    .single();

  if (!league) return NextResponse.json({ error: 'Code invalide' }, { status: 404 });
  if (league.draft_status !== 'pending') {
    return NextResponse.json({ error: 'La draft a déjà commencé' }, { status: 400 });
  }

  const { count } = await supabase
    .from('league_members')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league.id);

  if ((count ?? 0) >= league.max_teams) {
    return NextResponse.json({ error: 'Ligue complète' }, { status: 400 });
  }

  const { error } = await supabase
    .from('league_members')
    .insert({ league_id: league.id, user_id: auth.userId, team_name: teamName.trim() });

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'Vous êtes déjà dans cette ligue' }, { status: 409 });
  }

  return NextResponse.json({ leagueId: league.id, name: league.name });
}
