/**
 * Script untuk membuat user test dengan password yang sudah di-hash
 * Jalankan dengan: npx tsx scripts/create-test-user.ts
 * 
 * Install tsx jika belum: npm install -D tsx
 */

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestUsers() {
  try {
    console.log('🚀 Membuat user test...\n');

    // Hash password
    const hashedPassword = await bcrypt.hash('password123', 10);

    // User 1: Admin
    let admin = await prisma.user.findFirst({ where: { name: 'Administrator' } });
    if (!admin) {
      admin = await prisma.user.create({
        data: {
          name: 'Administrator',
          password: hashedPassword,
          role: 'ADMIN',
        },
      });
    }

    console.log('✅ Admin user created:');
    console.log(`   Name: ${admin.name}`);
    console.log(`   Password: password123`);
    console.log(`   Role: ${admin.role}\n`);

    // User 2: Owner
    let owner = await prisma.user.findFirst({ where: { name: 'Owner User' } });
    if (!owner) {
      owner = await prisma.user.create({
        data: {
          name: 'Owner User',
          password: hashedPassword,
          role: 'OWNER',
        },
      });
    }

    console.log('✅ Owner user created:');
    console.log(`   Name: ${owner.name}`);
    console.log(`   Password: password123`);
    console.log(`   Role: ${owner.role}\n`);

    // User 3: Regular User
    let user = await prisma.user.findFirst({ where: { name: 'Regular User' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'Regular User',
          password: hashedPassword,
          role: 'USER',
        },
      });
    }

    console.log('✅ Regular user created:');
    console.log(`   Name: ${user.name}`);
    console.log(`   Password: password123`);
    console.log(`   Role: ${user.role}\n`);

    console.log('🎉 Semua user test berhasil dibuat!');
    console.log('\n📝 Gunakan kredensial berikut untuk login:');
    console.log('   Admin: Administrator / password123');
    console.log('   Owner: Owner User / password123');
    console.log('   User:  Regular User / password123');
  } catch (error) {
    console.error('❌ Error creating users:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUsers();
