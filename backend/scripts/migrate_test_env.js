const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const RESOURCES_DIR = process.env.RESOURCES_DIR || path.join(__dirname, '..', '..', 'resources');
  
  console.log('🔄 Iniciando migración desde ficheros JSON a PostgreSQL (Prisma)...');

  try {
    // 1. Migrar Configuración de Auth (AppConfig)
    const AUTH_CONFIG_FILE = path.join(RESOURCES_DIR, 'auth_config.json');
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      const authConfig = JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, 'utf-8'));
      await prisma.appConfig.upsert({
        where: { id: 1 },
        update: {},
        create: {
          id: 1,
          activeProvider: authConfig.activeProvider || 'none',
          defaultTheme: authConfig.defaultTheme || 'system',
          entraConfig: authConfig.entra || {},
          ldapConfig: authConfig.ldap || {}
        }
      });
      console.log('✅ Configuración de App migrada.');
    } else {
      await prisma.appConfig.upsert({
        where: { id: 1 },
        update: {},
        create: {
          id: 1,
          activeProvider: 'none',
          defaultTheme: 'system',
          entraConfig: {},
          ldapConfig: {}
        }
      });
    }

    // 2. Migrar Usuarios
    const USERS_FILE = path.join(RESOURCES_DIR, 'users.json');
    let hasAdmin = false;
    
    if (fs.existsSync(USERS_FILE)) {
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      for (const u of users) {
        if (u.username === 'admin') hasAdmin = true;
        await prisma.user.upsert({
          where: { username: u.username },
          update: {},
          create: {
            id: u.id,
            username: u.username,
            passwordHash: u.passwordHash,
            role: u.role,
            themePreference: u.themePreference
          }
        });
      }
      console.log(`✅ ${users.length} Usuario(s) migrados.`);
    }

    // Asegurar que exista admin/admin si es la primera vez y no venía en los JSON.
    if (!hasAdmin) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync('admin', salt);
        await prisma.user.upsert({
          where: { username: 'admin' },
          update: {},
          create: {
            id: 'usr_admin_default',
            username: 'admin',
            passwordHash: hash,
            role: 'admin',
            themePreference: 'system'
          }
        });
        console.log('⚠️ Usuario admin por defecto creado: admin / admin');
    }

    // 3. Migrar Categorías y Libros
    const CATEGORIES_FILE = path.join(RESOURCES_DIR, 'categories.json');
    if (fs.existsSync(CATEGORIES_FILE)) {
      const catData = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
      
      if (catData.categories && catData.categories.length > 0) {
        for (const cat of catData.categories) {
          await prisma.category.upsert({
            where: { name: cat.name },
            update: {},
            create: {
              id: cat.id,
              name: cat.name
            }
          });
        }
        console.log(`✅ ${catData.categories.length} Categoría(s) migrada(s).`);
      }

      if (catData.bookCategoryMap) {
        let bookCount = 0;
        for (const [bookId, catId] of Object.entries(catData.bookCategoryMap)) {
          // Chequear si el catId existe primero (upsert para book)
          await prisma.book.upsert({
            where: { id: bookId },
            update: {},
            create: {
              id: bookId,
              categoryId: catId
            }
          });
          bookCount++;
        }
        console.log(`✅ Relaciones de libro-categoría migradas (${bookCount}).`);
      }
    }

    console.log('🚀 Migración completada con éxito.');

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
