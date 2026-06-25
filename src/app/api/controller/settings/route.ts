import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const settingsRows = await prisma.setting.findMany();

    const settings = settingsRows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {} as Record<string, string>);

    return NextResponse.json({
      operatingHours: settings['operatingHours'] || '06:00-22:00',
      prices: settings['prices'] || '{"30":150,"60":300,"90":450}',
      preparationTime: settings['preparationTime'] || '120',
      cooldownTime: settings['cooldownTime'] || '60',
      nightMode: settings['nightMode'] || '18:00',
      bellDuration: settings['bellDuration'] || '3'
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
