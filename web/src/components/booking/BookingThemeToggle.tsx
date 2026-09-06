'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function BookingThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      className="absolute right-3 top-3 z-30 rounded-lg border border-[var(--booking-border)] bg-[var(--booking-toggle-bg)] p-2 text-[var(--booking-muted)] backdrop-blur-sm transition-colors hover:bg-[var(--booking-toggle-hover)] hover:text-[var(--booking-text)]"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
