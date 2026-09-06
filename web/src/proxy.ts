import { NextResponse, type NextRequest } from 'next/server'
import { isPublicPath } from '@/lib/supabase/public-routes'

export async function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request })
  }

  // Keep Supabase SSR out of the public proxy bundle. Protected routes load it
  // only when they actually need session validation.
  const { updateSession } = await import('@/lib/supabase/middleware')
  return updateSession(request)
}

export const config = {
  matcher: [
    // Do not compile/load the Supabase proxy for public routes. This keeps the
    // landing page independent from Auth and prevents first-request stalls.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|login(?:/.*)?$|forgot-password(?:/.*)?$|update-password(?:/.*)?$|api/controller(?:/.*)?$|api/public(?:/.*)?$|api/health(?:/.*)?$|api/mqtt(?:/.*)?$|api/board(?:/.*)?$|api/courts(?:/.*)?$|api/queue/events$|health(?:/.*)?$|terminal(?:/.*)?$|book(?:/.*)?$|$).*)',
  ],
}
