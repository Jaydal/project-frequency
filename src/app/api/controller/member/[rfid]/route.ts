import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ rfid: string }> }
) {
  try {
    const { rfid } = await context.params;

    const rfidCard = await prisma.rFIDCard.findUnique({
      where: { uid: rfid },
      include: {
        member: {
          include: {
            wallet: true
          }
        }
      }
    });

    if (!rfidCard || rfidCard.status !== 'Active') {
      return NextResponse.json({ error: 'Invalid or inactive RFID' }, { status: 404 });
    }

    if (rfidCard.member.status !== 'Active') {
      return NextResponse.json({ error: 'Member is inactive' }, { status: 403 });
    }

    return NextResponse.json({
      memberId: rfidCard.member.memberId,
      firstName: rfidCard.member.firstName,
      lastName: rfidCard.member.lastName,
      balance: rfidCard.member.wallet?.balance || 0,
      status: rfidCard.member.status
    });
  } catch (error) {
    console.error('Error fetching member by RFID:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
