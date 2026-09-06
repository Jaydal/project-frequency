import { describe, expect, it } from 'vitest';
import { BOOKING_STEPS, BOOKING_STEPPER_MIN_WIDTH_CLASS } from './BookingStepper';
import { TERMINAL_BRAND_MOTION_CLASS, BookingBrandPanel } from './BookingBrandPanel';
import { GUEST_BOOKING_STEP_LABELS, GUEST_MOBILE_GRID_CLASS } from './GuestBookingForm';

describe('guided terminal booking wizard', () => {
  it('defines the four touch-first booking steps', () => {
    expect(BOOKING_STEPS.map((step) => step.label)).toEqual(['Court', 'Format', 'Duration', 'Review']);
  });

  it('keeps the decorative brand panel outside the accessibility tree', () => {
    expect(TERMINAL_BRAND_MOTION_CLASS).toContain('motion-reduce');
    expect(BookingBrandPanel).toBeTypeOf('function');
  });

  it('uses the same four-step structure for guest bookings', () => {
    expect(GUEST_BOOKING_STEP_LABELS).toEqual(['Contact', 'Court & time', 'Format', 'Review']);
  });

  it('keeps the wizard readable on narrow screens', () => {
    expect(BOOKING_STEPPER_MIN_WIDTH_CLASS).toContain('overflow-x-auto');
    expect(GUEST_MOBILE_GRID_CLASS).toContain('min-[380px]:grid-cols-2');
  });

  it('includes the schedule-success confirmation screen', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/booking/BookingKiosk.tsx'), 'utf8');
    expect(source).toContain('schedule-success');
    expect(source).toContain('CalendarCheck');
    expect(source).toContain('Booking Scheduled');
  });

  it('uses an emphasized responsive logo on the landing header', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/landing/LandingExperience.tsx'), 'utf8');
    expect(source).toContain('h-28 md:h-36');
  });

  it('uses the primary logo in the booking identity header', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const stepper = fs.readFileSync(path.join(process.cwd(), 'src/components/booking/BookingStepper.tsx'), 'utf8');
    expect(stepper).toContain('src="/brand/primary-logo.svg"');
    expect(stepper).toContain('h-8 sm:h-10');
  });

  it('enlarges the terminal sidebar primary logo', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/booking/BookingLayout.tsx'), 'utf8');
    expect(source).toContain('h-12 sm:h-14');
  });
});

