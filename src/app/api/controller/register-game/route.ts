import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const registerSchema = z.object({
  courtName: z.string(),
  matchType: z.string(),
  duration: z.number(),
  players: z.array(z.object({
    rfid: z.string(),
    team: z.string().optional(),
    chargeAmount: z.number()
  }))
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { courtName, matchType, duration, players } = result.data;

    const court = await prisma.court.findUnique({
      where: { name: courtName }
    });

    if (!court) {
      return NextResponse.json({ error: 'Court not found' }, { status: 404 });
    }

    const game = await prisma.$transaction(async (tx) => {
      const playerRecords = [];
      let totalChargeAmount = 0;

      for (const p of players) {
        const rfidCard = await tx.rFIDCard.findUnique({
          where: { uid: p.rfid },
          include: { member: { include: { wallet: true } } }
        });

        if (!rfidCard || !rfidCard.member.wallet) {
          throw new Error(`Invalid RFID or missing wallet for ${p.rfid}`);
        }

        if (rfidCard.member.wallet.balance < p.chargeAmount) {
          throw new Error(`Insufficient funds for ${p.rfid}`);
        }

        await tx.wallet.update({
          where: { id: rfidCard.member.wallet.id },
          data: { balance: { decrement: p.chargeAmount } }
        });

        await tx.walletTransaction.create({
          data: {
            walletId: rfidCard.member.wallet.id,
            amount: p.chargeAmount,
            type: 'Game Charge',
            remarks: `Match ${matchType} for ${duration} mins on ${courtName}`
          }
        });

        playerRecords.push({
          memberId: rfidCard.memberId,
          rfidCardId: rfidCard.id,
          team: p.team
        });

        totalChargeAmount += p.chargeAmount;
      }

      const newGame = await tx.game.create({
        data: {
          courtId: court.id,
          matchType,
          duration,
          status: 'In Progress',
          startTime: new Date(),
          chargeAmount: totalChargeAmount,
          players: {
            create: playerRecords
          }
        }
      });

      await tx.court.update({
        where: { id: court.id },
        data: {
          status: 'In Game',
          lastActivity: new Date()
        }
      });

      return newGame;
    });

    return NextResponse.json({ success: true, gameId: game.id });
  } catch (error: any) {
    console.error('Error registering game:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
