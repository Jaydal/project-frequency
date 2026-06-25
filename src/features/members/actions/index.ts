"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createMember(data: {
  firstName: string;
  lastName: string;
  email: string;
  memberId: string;
}) {
  await prisma.member.create({
    data: {
      ...data,
      wallet: {
        create: { balance: 0 }
      }
    }
  });
  revalidatePath("/members");
}
