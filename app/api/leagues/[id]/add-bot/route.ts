import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { DRAFT_BUDGET } from '@/lib/fantasy';

const BOT_PERSONAS = [
  { username: 'LeBOT 🤖', email: 'bot-lebot@system.internal', color: '#64748B' },
  { username: 'Bot Curry 🤖', email: 'bot-curry@system.internal', color: '#475569' },
  { username: 'Bot Durant 🤖', email: 'bot-durant@system.internal', color: '#334155' },
];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, draft_status, max_teams')
    .eq('id', leagueId)
    .single();

  if (!league) return NextResponse.json({ error: 'Ligue introuvable' }, { status: 404 });
  if (league.commissioner_id !== auth.userId) return NextResponse.json({ error: 'Réservé au commissaire' }, { status: 403 });
  if (league.draft_status !== 'pending') return NextResponse.json({ error: 'La draft a déjà commencé' }, { status: 400 });

  // Get current members with emails to detect bots
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, user:users(email)')
    .eq('league_id', leagueId);

  if ((members?.length ?? 0) >= (league.max_teams ?? 8)) {
    return NextResponse.json({ error: 'Ligue pleine' }, { status: 400 });
  }

  const botCount = (members ?? []).filter(m => (m.user as any)?.email?.endsWith('@system.internal')).length;

  if (botCount >= BOT_PERSONAS.length) {
    return NextResponse.json({ error: 'Maximum 3 bots par ligue' }, { status: 400 });
  }

  const persona = BOT_PERSONAS[botCount];

  // Get or create the bot user
  let { data: botUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', persona.email)
    .maybeSingle();

  if (!botUser) {
    const { data: newBot, error: createErr } = await supabase
      .from('users')
      .insert({
        username: persona.username,
        email: persona.email,
        password_hash: 'INVALID_BOT_NO_LOGIN',
        avatar_color: persona.color,
      })
      .select('id')
      .single();

    if (createErr) return NextResponse.json({ error: 'Erreur création bot' }, { status: 500 });
    botUser = newBot;
  }

  if (!botUser) return NextResponse.json({ error: 'Erreur bot' }, { status: 500 });

  // Check bot not already in this league
  const { data: existing } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', botUser.id)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: 'Ce bot est déjà dans la ligue' }, { status: 409 });

  const { error: joinErr } = await supabase.from('league_members').insert({
    league_id: leagueId,
    user_id: botUser.id,
    team_name: persona.username,
    draft_credits: DRAFT_BUDGET,
  });

  if (joinErr) return NextResponse.json({ error: 'Erreur ajout bot' }, { status: 500 });

  return NextResponse.json({ ok: true, bot: { id: botUser.id, username: persona.username } });
}
