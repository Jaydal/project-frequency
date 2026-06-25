import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { name: 'Administrator' },
    update: {},
    create: { name: 'Administrator', description: 'Full system access' },
  })

  await prisma.role.upsert({
    where: { name: 'Staff' },
    update: {},
    create: { name: 'Staff', description: 'Limited management access' },
  })

  await prisma.role.upsert({
    where: { name: 'Member' },
    update: {},
    create: { name: 'Member', description: 'Member portal access' },
  })

  const hashedPassword = await bcrypt.hash('admin123', 10)

  await prisma.user.upsert({
    where: { email: 'admin@pickleball.local' },
    update: {},
    create: {
      email: 'admin@pickleball.local',
      password: hashedPassword,
      name: 'Super Admin',
      roleId: adminRole.id,
    },
  })

  await prisma.court.upsert({
    where: { name: 'Court 1' },
    update: {},
    create: { name: 'Court 1' },
  })

  await prisma.court.upsert({
    where: { name: 'Court 2' },
    update: {},
    create: { name: 'Court 2' },
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
