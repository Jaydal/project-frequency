import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const heartbeatSchema = z.object({
  status: z.string(),
  firmwareVersion: z.string(),
  ipAddress: z.string(),
  temperature: z.number().optional()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = heartbeatSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { status, firmwareVersion, ipAddress, temperature } = result.data;

    await prisma.controllerLog.create({
      data: {
        status,
        firmwareVersion,
        ipAddress,
        temperature,
        lastSync: new Date()
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error recording heartbeat:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
