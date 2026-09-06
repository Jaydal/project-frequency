export function isPublicPath(path: string): boolean {
  return path.startsWith('/login') ||
         path.startsWith('/forgot-password') ||
         path.startsWith('/update-password') ||
         path.startsWith('/api/controller') ||
         path.startsWith('/api/terminal') ||
         path.startsWith('/api/public') ||
         path.startsWith('/api/guest-booking-requests') ||
         path === '/api/queue' ||
         path.startsWith('/api/queue/') && path !== '/api/queue/events' ||
         path.startsWith('/api/health') ||
         path.startsWith('/api/mqtt') ||
         path.startsWith('/api/board') ||
         path.startsWith('/api/courts') ||
         path === '/api/bookings/availability' ||
         path === '/api/queue/events' ||
         path.startsWith('/health') ||
         path === '/booking' ||
         path.startsWith('/booking/') ||
         path === '/' ||
         path === '/book';
}
