import { NextResponse } from 'next/server';
import { getCourtStatuses } from '@/lib/mqtt';

export async function GET() {
  return NextResponse.json(getCourtStatuses());
}
