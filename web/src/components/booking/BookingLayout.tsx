import type { ReactNode } from 'react';
import { BookingBrandPanel } from './BookingBrandPanel';
import { BookingThemeToggle } from './BookingThemeToggle';

interface Props {
  children: ReactNode;
  sidebar?: ReactNode;
}

export function BookingLayout({ children, sidebar }: Props) {
  return (
    <div className="booking-shell min-h-[100dvh] bg-[var(--booking-bg)] flex items-center justify-center sm:p-4">
      <div className="w-full min-h-[100dvh] sm:h-auto sm:max-h-[600px] sm:min-h-0 sm:max-w-[900px] sm:aspect-[5/3] bg-[var(--booking-surface)] sm:rounded-2xl sm:border sm:border-[var(--booking-border)] overflow-hidden relative flex flex-col">
        <BookingThemeToggle />
        <img
          src="/secondary-logo.svg"
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          className="pointer-events-none absolute -right-40 -bottom-28 z-0 w-[620px] max-w-none rotate-[-10deg] opacity-[0.035]"
        />
        {sidebar ? (
          <div className="relative z-10 h-full w-full flex flex-col sm:flex-row overflow-y-auto sm:overflow-hidden">
            <div className="order-1 flex min-h-[min(100dvh,720px)] min-w-0 flex-1 flex-col overflow-y-auto sm:order-1 sm:min-h-0 sm:overflow-y-auto">
              {children}
            </div>
            <div className="order-2 flex w-full shrink-0 flex-col border-t border-[var(--booking-border)] bg-[var(--booking-panel)] sm:order-2 sm:w-[240px] sm:border-l sm:border-t-0">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--booking-border)]">
                <img
                  src="/brand/primary-logo.svg"
                  alt="Paddle Point"
                  width={112}
                  height={72}
                  loading="eager"
                  decoding="async"
                  className="h-12 sm:h-14 w-auto max-w-[210px] object-contain object-left"
                />
              </div>
              <BookingBrandPanel />
              <div className="min-h-0 flex-1">{sidebar}</div>
            </div>
          </div>
        ) : (
          <div className="relative z-10 h-full w-full flex flex-col items-center justify-center p-4">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
