import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createFetchWithTimeout } from '../utils/fetch'
import { withTimeout } from '../utils/timeout'

/**
 * If using Fluid compute: Don't put this client in a global variable. Always create a new client within each
 * function when using it.
 */
export async function createClient() {
  const cookieStore = await withTimeout(
    cookies(),
    10000,
    () => { throw new Error('cookies() timeout'); }
  );

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
          }
        },
      },
      global: {
        fetch: createFetchWithTimeout(10000),
      },
    }
  );

  return client;
}
