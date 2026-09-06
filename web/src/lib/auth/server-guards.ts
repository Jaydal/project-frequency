import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasMatchingApiKey, hasStaffRole } from './authorization';

export async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!hasStaffRole(user)) {
    return { supabase, user, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { supabase, user, response: undefined };
}

export async function requireStaffOrController(request: Request) {
  if (hasMatchingApiKey(request.headers.get('x-api-key'), process.env.CONTROLLER_API_KEY)) {
    return { controller: true as const, supabase: null, user: null, response: undefined };
  }
  const result = await requireStaff();
  return { ...result, controller: false as const };
}
