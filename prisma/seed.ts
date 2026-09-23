const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@ottobon.com';
  
  // Check if admin already exists
  const existingIdentity = await prisma.authIdentity.findUnique({
    where: { loginIdentifierNormalized: adminEmail }
  });
  
  if (existingIdentity) {
    console.log('Admin user already exists!');
    return;
  }

  const passwordHash = await bcrypt.hash('Admin@123', 10);

  // 1. Create the OTTOBON Workspace
  const ottobonWorkspace = await prisma.workspace.create({
    data: {
      workspaceType: 'OTTOBON',
      displayName: 'Ottobon Administration',
      status: 'ACTIVE',
    }
  });

  // 2. Create the Admin Person & Identity
  const person = await prisma.person.create({
    data: {
      status: 'ACTIVE',
      displayName: 'System Admin',
      authIdentities: {
        create: {
          providerType: 'LOCAL',
          providerName: 'Ottobon',
          loginIdentifierNormalized: adminEmail,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        }
      }
    }
  });

  // 3. Grant the Person a WorkspaceMembership to OTTOBON Workspace
  await prisma.workspaceMembership.create({
    data: {
      workspaceId: ottobonWorkspace.id,
      personId: person.id,
      status: 'ACTIVE',
      joinedAt: new Date()
    }
  });

  // Update workspace owner
  await prisma.workspace.update({
    where: { id: ottobonWorkspace.id },
    data: { ownerPersonId: person.id, createdByPersonId: person.id }
  });

  console.log('Successfully seeded admin user!');
  console.log(`Email: ${adminEmail}`);
  console.log(`Password: Admin@123`);
  console.log(`Workspace: ${ottobonWorkspace.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
