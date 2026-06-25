"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function assignRFID(data: { memberId: string, uid: string }) {
  const member = await prisma.member.findUnique({ where: { memberId: data.memberId } });
  if (!member) throw new Error("Member not found");

  const existing = await prisma.rFIDCard.findUnique({ where: { uid: data.uid } });
  if (existing) throw new Error("RFID already assigned");

  await prisma.rFIDCard.create({
    data: {
      uid: data.uid,
      memberId: member.id,
      status: "Active"
    }
  });

  revalidatePath("/rfid");
  revalidatePath("/members");
}
