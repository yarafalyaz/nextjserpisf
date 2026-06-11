/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.role.findMany({
    include: {
      permissions: {
        select: { name: true }
      },
      _count: {
        select: { users: true }
      }
    }
  });
  console.log(JSON.stringify(roles, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
