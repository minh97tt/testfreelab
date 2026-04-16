import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding TestTree database...')

  // Create demo user
  const hashedPassword = await bcrypt.hash('Aa@123456', 10)

  const user = await prisma.user.upsert({
    where: { email: 'minh@admin.dev' },
    update: {},
    create: {
      email: 'minh@admin.dev',
      name: 'Admin Tree',
      password: hashedPassword,
    },
  })
  console.log('✅ Created user:', user.email)

  // Create project
  const project = await prisma.project.create({
    data: {
      name: 'Auth Service',
      version: '2.4.0',
      description: 'Authentication and authorization test suite',
      members: {
        create: {
          userId: user.id,
          role: 'OWNER',
        },
      },
    },
  })
  console.log('✅ Created project:', project.name)

  // Create folders
  await prisma.folder.createMany({
    data: [
      {
        name: 'Login Flow',
        description: 'All login-related test cases',
        projectId: project.id,
      },
      {
        name: 'Registration',
        description: 'User registration flows',
        projectId: project.id,
      },
      {
        name: 'API Endpoints',
        projectId: project.id,
      },
    ],
  })

  console.log('✅ Created folders')

  console.log('\n🎉 Seed complete!')
  console.log('   Email:    minh@admin.dev')
  console.log('   Password: Aa@123456')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())