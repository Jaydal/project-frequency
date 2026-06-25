"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function reloadWallet(data: {
  memberId: string;
  amount: number;
  referenceNumber: string;
}) {
  const member = await prisma.member.findUnique({
    where: { memberId: data.memberId },
    include: { wallet: true }
  });

  if (!member || !member.wallet) throw new Error("Member or wallet not found");

  await prisma.$transaction([
    prisma.wallet.update({
      where: { id: member.wallet.id },
      data: { balance: { increment: data.amount } }
    }),
    prisma.walletTransaction.create({
      data: {
        walletId: member.wallet.id,
        amount: data.amount,
        type: 'Reload',
        referenceNumber: data.referenceNumber,
        remarks: 'Manual Top Up'
      }
    })
  ]);

  revalidatePath("/wallet");
}
