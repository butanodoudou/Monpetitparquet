import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!getAuth(req)) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const week = url.searchParams.get('week');
  const limit = parseInt(url.searchParams.get('limit') ?? '20');

  const supabase = db();
  let query = supabase.from('matches').select('*').order('match_date', { ascending: true }).limit(limit);

  if (status) query = query.eq('status', status);
  if (week) query = query.eq('week', parseInt(week));

  const { data } = await query;
  return NextResponse.json(data ?? []);
}
