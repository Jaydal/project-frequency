import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const validateSchema = z.object({
  rfid: z.string(),
  matchType: z.enum(['1v1', '2v2']),
  duration: z.number(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = validateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { rfid, duration } = result.data;

    const rfidCard = await prisma.rFIDCard.findUnique({
      where: { uid: rfid },
      include: {
        member: {
          include: { wallet: true }
        }
      }
    });

    if (!rfidCard || rfidCard.status !== 'Active') {
      return NextResponse.json({ approved: false, reason: 'Invalid or inactive RFID' }, { status: 400 });
    }

    if (rfidCard.member.status !== 'Active') {
      return NextResponse.json({ approved: false, reason: 'Member is inactive' }, { status: 400 });
    }

    const balance = rfidCard.member.wallet?.balance || 0;

    // Fetch dynamic pricing from settings
    const settingsRow = await prisma.setting.findUnique({ where: { key: 'prices' } });
    let ratePer30 = 150;
    if (settingsRow) {
       try {
         const prices = JSON.parse(settingsRow.value);
         if (prices["30"]) ratePer30 = parseInt(prices["30"]);
       } catch (e) {
         console.warn("Failed to parse prices setting, falling back to default");
       }
    }

    const multiplier = duration / 30;
    const chargeAmount = ratePer30 * multiplier;

    if (balance < chargeAmount) {
      return NextResponse.json({
        approved: false,
        remainingBalance: balance,
        chargeAmount,
        reason: 'Insufficient balance'
      }, { status: 400 });
    }

    return NextResponse.json({
      approved: true,
      remainingBalance: balance,
      chargeAmount,
      memberId: rfidCard.member.memberId
    });

  } catch (error) {
    console.error('Error validating game:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
