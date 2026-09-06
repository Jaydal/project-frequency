import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { withTimeout } from '../utils/timeout'
export { isPublicPath } from './public-routes'
import { isPublicPath } from './public-routes'

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (isPublicPath(path)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  let user: Awaited<ReturnType<ReturnType<typeof createServerClient>['auth']['getUser']>>['data']['user'] = null;
  const authStart = Date.now();
  try {
    const result = await withTimeout(
      supabase.auth.getUser(),
      5000,
      () => { throw new Error('Supabase auth timeout'); }
    );
    user = result.data.user;
    console.log(`[middleware] auth getUser OK in ${Date.now() - authStart}ms, user=${user?.email ?? 'null'}`);
  } catch (err) {
    console.log(`[middleware] auth getUser failed in ${Date.now() - authStart}ms:`, err instanceof Error ? err.message : err);
    user = null;
  }

  console.log(`[middleware] path=${path} user=${user !== null} public=false`);

  if (!user) {
    if (request.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
