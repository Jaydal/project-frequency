import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/server-guards';

export async function PUT(request: Request) {
  const { key, value } = await request.json();
  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'key required' }, { status: 400 });
  }

  const auth = await requireStaff();
  if (auth.response) return auth.response;
  const supabase = auth.supabase;
  const { error } = await supabase.from('settings').upsert(
    { key, value },
    { onConflict: 'key' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const auth = await requireStaff();
  if (auth.response) return auth.response;
  const supabase = auth.supabase;
  const { data, error } = await supabase.from('settings').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
