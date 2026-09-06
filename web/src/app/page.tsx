import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/utils/timeout";
import LandingExperience from "@/components/landing/LandingExperience";

// Prices are public kiosk configuration and do not need to block every request.
// Revalidate periodically while keeping the page responsive when Supabase is slow.
export const revalidate = 60;

async function getPrices(): Promise<Record<string, number>> {
  try {
    const supabase = await withTimeout(
      createClient(),
      500,
      () => { throw new Error('createClient timeout'); }
    );
    const { data, error } = await withTimeout(
      supabase.from('settings').select('value').eq('key', 'prices').single(),
      1200,
      () => ({ data: null, error: { message: 'timeout' } } as any)
    );
    if (data?.value && !error) return JSON.parse(data.value);
  } catch {}
  return { "10": 10, "25": 150, "55": 300, "85": 450 };
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  if (code) {
    redirect(`/update-password?code=${code}`);
  }

  const prices = await getPrices();
  const rateEntries = Object.entries(prices) as [string, number][];

  return <LandingExperience rateEntries={rateEntries} />;
}
