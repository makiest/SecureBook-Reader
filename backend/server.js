// Core dependencies
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Media processing dependencies
const { fromPath } = require('pdf2pic');
const EPub = require('epub2').EPub;

// Security and authentication
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const msal = require('@azure/msal-node');
const ldap = require('ldapjs');

// Directory where books are mounted (host-mapped volumes)
const BOOKS_DIR = process.env.BOOKS_DIR || (fs.existsSync(path.join(__dirname, 'books')) ? path.join(__dirname, 'books') : path.join(__dirname, '..', 'books'));
// Directory for storing configuration and user data
const RESOURCES_DIR = process.env.RESOURCES_DIR || (fs.existsSync(path.join(__dirname, 'resources')) ? path.join(__dirname, 'resources') : path.join(__dirname, '..', 'resources'));
// Directory for generated book covers
const COVERS_DIR = path.join(__dirname, 'covers');
// File paths for persistence
const CATEGORIES_FILE = path.join(RESOURCES_DIR, 'categories.json');
const USERS_FILE = path.join(RESOURCES_DIR, 'users.json');
const AUTH_CONFIG_FILE = path.join(RESOURCES_DIR, 'auth_config.json');
const DB_CONFIG_FILE = path.join(RESOURCES_DIR, 'db_config.json');
// Secret key for JWT signing
const JWT_SECRET = process.env.JWT_SECRET || 'book-reader-secret-key-super-safe';

// Respaldar la URL original del entorno (para poder volver a modo local)
process.env.DATABASE_URL_ORIGINAL = process.env.DATABASE_URL;

// Handle dynamic DB override
if (fs.existsSync(DB_CONFIG_FILE)) {
  try {
    const dbConfig = JSON.parse(fs.readFileSync(DB_CONFIG_FILE, 'utf-8'));
    if (dbConfig.connection?.url) {
      process.env.DATABASE_URL = dbConfig.connection.url;
      console.log('🔌 Base de Datos configurada mediante db_config.json');
    }
  } catch (e) {
    console.error('Error leyendo db_config.json:', e.message);
  }
}

// Ensure required directories exist
if (!fs.existsSync(BOOKS_DIR)) fs.mkdirSync(BOOKS_DIR, { recursive: true });
if (!fs.existsSync(RESOURCES_DIR)) fs.mkdirSync(RESOURCES_DIR, { recursive: true });
if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let isDbConfigured = false;

/**
 * Loads the authentication configuration from DB.
 */
async function loadAuthConfig() {
  if (!isDbConfigured) {
    return {
      activeProvider: 'none', defaultTheme: 'system',
      entra: { clientId: '', tenantId: '', clientSecret: '', adminGroupId: '', visorGroupId: '' },
      ldap: { url: '', bindDN: '', bindCredentials: '', searchBase: '', adminGroupDN: '', visorGroupDN: '' }
    };
  }
  const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (!config) return {}; // Should not happen after migrations
  return {
    activeProvider: config.activeProvider,
    defaultTheme: config.defaultTheme,
    entra: config.entraConfig || {},
    ldap: config.ldapConfig || {}
  };
}

/**
 * Saves the authentication configuration to DB.
 */
async function saveAuthConfig(data) {
  if (!isDbConfigured) throw new Error('Cannot save config in rescue mode');
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {
      activeProvider: data.activeProvider,
      defaultTheme: data.defaultTheme,
      entraConfig: data.entra,
      ldapConfig: data.ldap
    },
    create: {
      id: 1,
      activeProvider: data.activeProvider,
      defaultTheme: data.defaultTheme,
      entraConfig: data.entra,
      ldapConfig: data.ldap
    }
  });
}

/**
 * Loads the users list from DB.
 */
async function loadUsers() {
  if (!isDbConfigured) return [];
  const users = await prisma.user.findMany();
  return users.map(row => ({
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    role: row.role,
    themePreference: row.themePreference
  }));
}

/**
 * Carga de mapa de categorías y libros.
 */
/**
 * Carga de mapa de categorías y libros, ordenadas por sortOrder.
 */
async function loadCategories() {
  if (!isDbConfigured) return { categories: [], bookCategoryMap: {} };
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  const books = await prisma.book.findMany({ where: { categoryId: { not: null } } });
  
  const map = {};
  books.forEach(r => map[r.id] = r.categoryId);
  
  return {
    categories: categories.map(c => ({ id: c.id, name: c.name, sortOrder: c.sortOrder })),
    bookCategoryMap: map
  };
}

// Middleware to conditionally block API when in Rescue configuration mode
function requireDbReady(req, res, next) {
    if (isDbConfigured) {
        next();
    } else {
        // Permitir que cargue el frontend (ej. peticiones de /, /assets/, etc.)
        if (!req.path.startsWith('/api/')) {
            return next();
        }

        // En modo rescate sólo se permiten requests de configuración o login
        const allowedPaths = ['/api/login', '/api/setup-db', '/api/auth/providers', '/api/me'];
        if (allowedPaths.includes(req.path) || req.path.startsWith('/api/setup-db')) {
            next();
        } else {
            res.status(503).json({ error: 'System is in DB Configuration Mode. Database is not connected.' });
        }
    }
}
app.use(requireDbReady);

/**
 * Middleware to verify the JWT token from cookies.
 */
function authenticate(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware to restrict access to admin users only.
 */
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
}



// In-memory cache for book metadata to avoid constant disk I/O
let cachedBooks = [];

/**
 * Scans the BOOKS_DIR for PDF and EPUB files, generates covers, and updates the cache.
 */
const scanLibrary = async () => {
  const files = fs.readdirSync(BOOKS_DIR);
  const books = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(BOOKS_DIR, file);
    const ext = path.extname(file).toLowerCase();
    
    // Ignore automatically translated files and previews to avoid duplicates in the UI
    if (file.endsWith(`_es${ext}`) || file.endsWith(`_preview_es${ext}`)) {
      continue;
    }
    
    const id = Buffer.from(file).toString('base64').replace(/=/g, ''); // Unique ID based on filename

    if (ext === '.pdf') {
      const coverPath = path.join(COVERS_DIR, `${id}.1.png`);
      let hasCover = fs.existsSync(coverPath);
      
      // Generate cover using pdf2pic if it doesn't exist
      if (!hasCover) {
        try {
          const options = {
            density: 100,
            saveFilename: id,
            savePath: COVERS_DIR,
            format: "png",
            width: 300,
            height: 400
          };
          const convert = fromPath(filePath, options);
          await convert(1, {responseType: "image"});
          hasCover = true;
        } catch (err) {
          console.error(`Cover generation failed for ${file}:`, err.message);
        }
      }
      
      books.push({
        id,
        title: file.replace('.pdf', ''),
        type: 'pdf',
        hasCover,
        filename: file
      });
    } else if (ext === '.epub') {
      books.push({
        id,
        title: file.replace('.epub', ''),
        type: 'epub',
        hasCover: false, // Epub cover extraction is pending implementation
        filename: file
      });
    }
  }
  
  cachedBooks = books;
};

// Start initial scan and schedule repeats
scanLibrary();
setInterval(scanLibrary, 5 * 60 * 1000); // Rescan every 5 minutes

async function performLdapAuth(username, password, config) {
  return new Promise((resolve, reject) => {
    const client = ldap.createClient({ url: config.ldap.url });
    client.bind(config.ldap.bindDN, config.ldap.bindCredentials, (err) => {
      if (err) {
        client.destroy();
        return reject(new Error('LDAP Bind Failed: ' + err.message));
      }

      const opts = {
        filter: `(sAMAccountName=${username})`,
        scope: 'sub',
        attributes: ['dn', 'memberOf']
      };

      client.search(config.ldap.searchBase, opts, (err, res) => {
        if (err) {
          client.destroy();
          return reject(err);
        }

        let userDn = null;
        let userGroups = [];

        res.on('searchEntry', (entry) => {
          userDn = entry.objectName;
          userGroups = entry.attributes.find(a => a.type === 'memberOf')?.values || [];
        });

        res.on('error', (err) => {
          client.destroy();
          reject(err);
        });

        res.on('end', () => {
          if (!userDn) {
            client.destroy();
            return reject(new Error('User not found in AD'));
          }

          // Now bind as the user to verify password
          client.bind(userDn, password, (err) => {
            client.destroy();
            if (err) return reject(new Error('Invalid AD credentials'));

            let role = 'visor';
            if (userGroups.includes(config.ldap.adminGroupDN)) role = 'admin';
            else if (userGroups.includes(config.ldap.visorGroupDN)) role = 'visor';
            else return reject(new Error('No tienes permisos suficientes en AD Local.'));

            resolve({ username, role });
          });
        });
      });
    });
  });
}

/**
 * Main Login Endpoint. Supports local and LDAP authentication.
 */
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Rescue Mode Intercept
  if (!isDbConfigured) {
    if (username === 'admin' && password === 'admin') {
      const token = jwt.sign({ id: 'rescue_admin', username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
      return res.json({ 
        id: 'rescue_admin', 
        username: 'admin', 
        role: 'admin', 
        themePreference: 'system', 
        defaultTheme: 'system',
        isDbConfigured: false 
      });
    }
    return res.status(503).json({ error: 'System is in Configuration Mode. Only rescue admin allowed.' });
  }

  const config = await loadAuthConfig();
  
  // 1. Check local users first
  const users = await loadUsers();
  const localUser = users.find(u => u.username === username);
  
  if (localUser && bcrypt.compareSync(password, localUser.passwordHash)) {
    const token = jwt.sign({ id: localUser.id, username: localUser.username, role: localUser.role }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.json({ id: localUser.id, username: localUser.username, role: localUser.role, themePreference: localUser.themePreference || null, defaultTheme: config.defaultTheme || 'system' });
  }

  // 2. Fallback to LDAP if configured and active
  if (config.activeProvider === 'ldap') {
    try {
      const adUser = await performLdapAuth(username, password, config);
      const token = jwt.sign({ id: 'ad_' + adUser.username, username: adUser.username, role: adUser.role }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
      
      const localRecord = users.find(u => u.id === 'ad_' + adUser.username);
      
      return res.json({ 
        id: 'ad_' + adUser.username, 
        username: adUser.username, 
        role: adUser.role,
        themePreference: localRecord?.themePreference || null,
        defaultTheme: config.defaultTheme || 'system'
      });
    } catch (err) {
      return res.status(401).json({ error: err.message });
    }
  }

  return res.status(401).json({ error: 'Usuario o contraseña inválidos' });
});

app.get('/api/auth/providers', async (req, res) => {
  const config = await loadAuthConfig();
  const entraReady = config.activeProvider === 'entra' && 
                     config.entra.clientId && 
                     config.entra.tenantId && 
                     config.entra.clientSecret;
  res.json({ 
    activeProvider: config.activeProvider,
    entraConfigured: entraReady
  });
});

// Admin Auth Config
app.get('/api/admin/auth-config', authenticate, requireAdmin, async (req, res) => {
  const config = await loadAuthConfig();
  res.json(config);
});

// Microsoft Entra ID (MSAL) Logic
app.get('/api/auth/login/ad', async (req, res) => {
  const config = await loadAuthConfig();
  if (config.activeProvider !== 'entra') return res.status(400).send('Entra ID not active');

  const msalConfig = {
    auth: {
      clientId: config.entra.clientId,
      authority: `https://login.microsoftonline.com/${config.entra.tenantId}`,
      clientSecret: config.entra.clientSecret,
    }
  };
  const cca = new msal.ConfidentialClientApplication(msalConfig);
  const authCodeUrlParameters = {
    scopes: ["user.read", "openid", "profile"],
    redirectUri: `${req.protocol}://${req.get('host')}/api/auth/callback`,
  };

  cca.getAuthCodeUrl(authCodeUrlParameters).then((response) => {
    res.redirect(response);
  }).catch((error) => res.status(500).send(error.message));
});

app.get('/api/auth/callback', async (req, res) => {
  const config = await loadAuthConfig();
  const msalConfig = {
    auth: {
      clientId: config.entra.clientId,
      authority: `https://login.microsoftonline.com/${config.entra.tenantId}`,
      clientSecret: config.entra.clientSecret,
    }
  };
  const cca = new msal.ConfidentialClientApplication(msalConfig);
  const tokenRequest = {
    code: req.query.code,
    scopes: ["user.read", "openid", "profile"],
    redirectUri: `${req.protocol}://${req.get('host')}/api/auth/callback`,
  };

  cca.acquireTokenByCode(tokenRequest).then((response) => {
    const { username, idTokenClaims } = response.account;
    const groups = idTokenClaims.groups || [];
    
    const role = groups.includes(config.entra.adminGroupId) ? 'admin' : 'visor';
    const userId = 'entra_' + username;
    
    const token = jwt.sign({ id: userId, username, role }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect('/');
  }).catch((error) => res.status(500).send(error.message));
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

app.get('/api/me', authenticate, async (req, res) => {
  const users = await loadUsers();
  const localUser = users.find(u => u.id === req.user.id);
  const authCfg = await loadAuthConfig();
  res.json({
    ...req.user,
    themePreference: localUser?.themePreference || null,
    defaultTheme: authCfg.defaultTheme || 'system',
    isDbConfigured
  });
});

app.put('/api/me/theme', authenticate, async (req, res) => {
  const { theme } = req.body;
  if (!['light', 'dark', 'system'].includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
  const users = await loadUsers();
  let idx = users.findIndex(u => u.id === req.user.id);
  
  if (idx === -1) {
    if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
    await prisma.user.create({
      data: { id: req.user.id, username: req.user.username, role: req.user.role, themePreference: theme }
    });
  } else {
    if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
    await prisma.user.update({
      where: { id: req.user.id },
      data: { themePreference: theme }
    });
  }
  res.json({ success: true, theme });
});

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
  const users = await loadUsers();
  res.json(users.map(u => ({ id: u.id, username: u.username, role: u.role })));
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  const users = await loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const id = 'usr_' + Date.now();
  const safeRole = role || 'visor';
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  await prisma.user.create({
    data: { id, username, passwordHash, role: safeRole, themePreference: 'system' }
  });
  res.json({ id, username, role: safeRole });
});

app.put('/api/users/:id/role', authenticate, requireAdmin, async (req, res) => {
  const { role } = req.body;
  const users = await loadUsers();
  const index = users.findIndex(u => u.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'User not found' });
  if (users[index].username === 'admin') return res.status(400).json({ error: 'Cannot change default admin role' });
  
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  await prisma.user.update({
    where: { id: req.params.id },
    data: { role }
  });
  res.json({ success: true, role });
});

app.delete('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  let users = await loadUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.username === 'admin') return res.status(400).json({ error: 'Cannot delete default admin' });
  
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

app.post('/api/admin/auth-config', authenticate, requireAdmin, async (req, res) => {
  const config = req.body;
  if (!config) return res.status(400).send('Config is required');
  await saveAuthConfig(config);
  res.json({ success: true });
});

app.post('/api/admin/auth-config', authenticate, requireAdmin, (req, res) => {
  const config = req.body;
  if (!config) return res.status(400).send('Config is required');
  saveAuthConfig(config);
  res.json({ success: true });
});

app.post('/api/admin/auth-config', authenticate, requireAdmin, (req, res) => {
  const config = req.body;
  if (!config) return res.status(400).send('Config is required');
  saveAuthConfig(config);
  res.json({ success: true });
});

/**
 * GET /api/books
 * Retrieves metadata for all scanned books, including their category status.
 * Falls back gracefully if DB is unavailable (books still shown without category info).
 */
app.get('/api/books', authenticate, async (req, res) => {
  let catData = { categories: [], bookCategoryMap: {} };
  try {
    catData = await loadCategories();
  } catch (err) {
    console.error('Error loading categories for /api/books:', err.message);
  }
  res.json(cachedBooks.map(b => ({ 
    id: b.id, 
    title: b.title, 
    type: b.type, 
    hasCover: b.hasCover,
    categoryId: catData.bookCategoryMap[b.id] || null
  })));
});

/**
 * GET /api/books/:id/cover
 * Serves the generated cover image for a book.
 */
app.get('/api/books/:id/cover', authenticate, (req, res) => {
  const book = cachedBooks.find(b => b.id === req.params.id);
  if (!book || !book.hasCover) return res.status(404).send('Not found');
  
  const coverPath = path.join(COVERS_DIR, `${book.id}.1.png`);
  if (fs.existsSync(coverPath)) {
    res.sendFile(coverPath);
  } else {
    res.status(404).send('Not found');
  }
});

/**
 * GET /api/books/:id/stream
 * Securely streams a book file (PDF or EPUB). Handles translations and prevents caching.
 */
app.get('/api/books/:id/stream', authenticate, (req, res) => {
  const book = cachedBooks.find(b => b.id === req.params.id);
  if (!book) return res.status(404).send('Not found');

  const lang = req.query.lang || 'en';
  let targetFilename = book.filename;
  if (lang === 'es') {
    const ext = path.extname(book.filename);
    const base = path.basename(book.filename, ext);
    targetFilename = `${base}_es${ext}`;
  } else if (lang === 'preview_es') {
    const ext = path.extname(book.filename);
    const base = path.basename(book.filename, ext);
    targetFilename = `${base}_preview_es${ext}`;
  }

  const filePath = path.join(BOOKS_DIR, targetFilename);
  if (!fs.existsSync(filePath)) {
     if (lang === 'es' || lang === 'preview_es') {
         return res.status(404).json({ error: 'Translation not ready' });
     }
     return res.status(404).send('File not found');
  }

  // Security headers to prevent leakage and unauthorized downloads
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Content-Disposition', 'inline; filename="document"');

  const stat = fs.statSync(filePath);
  res.setHeader('Content-Length', stat.size);
  if (book.type === 'pdf') res.setHeader('Content-Type', 'application/pdf');
  else res.setHeader('Content-Type', 'application/epub+zip');

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

const multer = require('multer');
const FormData = require('form-data');
const fetch2 = require('node-fetch');

// Configure multer for book uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BOOKS_DIR),
  filename: (req, file, cb) => {
    // Sanitize filename: keep original name but ensure uniqueness
    const originalName = file.originalname.replace(/[^a-zA-Z0-9._\-\s()]/g, '');
    const ext = path.extname(originalName).toLowerCase();
    const baseName = path.basename(originalName, ext);
    let finalName = originalName;
    let counter = 1;
    while (fs.existsSync(path.join(BOOKS_DIR, finalName))) {
      finalName = `${baseName} (${counter})${ext}`;
      counter++;
    }
    cb(null, finalName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf' || ext === '.epub') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF y EPUB'), false);
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB max
});

app.post('/api/books/scan', authenticate, requireAdmin, async (req, res) => {
  try {
    await scanLibrary();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const activeTranslations = new Set();

/**
 * Upload route for books with optional automatic translation.
 */
app.post('/api/books/upload', authenticate, requireAdmin, upload.array('books', 20), async (req, res) => {
  try {
    await scanLibrary(); // Update index
    
    const autoTranslate = req.body.autoTranslate !== 'false';
    
    // Spawn background translation if requested
    if (autoTranslate) {
      req.files.forEach(file => {
        const filePath = path.join(BOOKS_DIR, file.filename);
        const ext = path.extname(file.filename);
        const base = path.basename(file.filename, ext);
        const targetPath = path.join(BOOKS_DIR, `${base}_es${ext}`);
        const tempTxtPath = path.join(BOOKS_DIR, `temp_full_${base}.txt`);
        
        let fileToUpload = filePath;

        // For PDFs, we extract text first to improve translation quality and reduce file size
        if (ext.toLowerCase() === '.pdf') {
          try {
            execSync(`gs -sDEVICE=txtwrite -dNOPAUSE -dBATCH -dSAFER -sOutputFile="${tempTxtPath}" "${filePath}"`, { stdio: 'ignore' });
            fileToUpload = tempTxtPath;
          } catch(e) {
            if (fs.existsSync(tempTxtPath) && fs.statSync(tempTxtPath).size > 0) {
              fileToUpload = tempTxtPath;
            } else {
              console.error('Error extracting text pages: ', e.message);
            }
          }
        }

        const formData = new FormData();
        formData.append('file', fs.createReadStream(fileToUpload));
        formData.append('source', 'en');
        formData.append('target', 'es');
        
        activeTranslations.add(file.filename);
        fetch2('http://translator:5000/translate_file', {
          method: 'POST',
          body: formData
        })
        .then(async response => {
          if (!response.ok) throw new Error(`Status ${response.status}`);
          const data = await response.json();
          if (!data.translatedFileUrl) throw new Error('No translated URL');
          
          const fileRes = await fetch2(data.translatedFileUrl);
          if (!fileRes.ok) throw new Error(`Download failed ${fileRes.status}`);
          
          if (ext.toLowerCase() === '.pdf') {
            const txtBuffer = await fileRes.buffer();
            const translatedTxtPath = path.join(BOOKS_DIR, `temp_trans_${base}.txt`);
            // Convert to PDF using enscript/ps2pdf
            fs.writeFileSync(translatedTxtPath, txtBuffer.toString('utf-8'), 'latin1');
            try {
              execSync(`enscript -B -X latin1 -p - "${translatedTxtPath}" | ps2pdf - "${targetPath}"`, { stdio: 'ignore' });
            } catch(e) {
              console.error("Enscript to PDF failed:", e.message);
            }
            activeTranslations.delete(file.filename);
            if (fs.existsSync(tempTxtPath)) fs.unlinkSync(tempTxtPath);
            if (fs.existsSync(translatedTxtPath)) fs.unlinkSync(translatedTxtPath);
            console.log('Finished translating ' + file.filename);
          } else {
            // Direct write for non-PDFs (like Epub if supported by translator)
            const dest = fs.createWriteStream(targetPath);
            fileRes.body.pipe(dest);
            dest.on('finish', () => {
              activeTranslations.delete(file.filename);
              console.log('Finished translating ' + file.filename);
            });
          }
        })
        .catch(err => {
          activeTranslations.delete(file.filename);
          if (fs.existsSync(tempTxtPath)) fs.unlinkSync(tempTxtPath);
          console.error('Background translation failed for ' + file.filename, err.message);
        });
      });
    }

    res.json({ success: true, count: req.files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List files in BOOKS_DIR (for admin management)
app.get('/api/books/files', authenticate, requireAdmin, (req, res) => {
  try {
    const files = fs.readdirSync(BOOKS_DIR);
    const bookFiles = files
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        if (!['.pdf', '.epub'].includes(ext)) return false;
        if (f.endsWith(`_es${ext}`) || f.endsWith(`_preview_es${ext}`)) return false; // Hide background translations from UI list
        return true;
      })
      .map(f => {
        const stat = fs.statSync(path.join(BOOKS_DIR, f));
        const ext = path.extname(f).toLowerCase();
        const base = path.basename(f, ext);
        const hasTranslation = fs.existsSync(path.join(BOOKS_DIR, `${base}_es${ext}`));
        const hasPreviewTranslation = fs.existsSync(path.join(BOOKS_DIR, `${base}_preview_es${ext}`));
        const isTranslating = activeTranslations.has(f);
        return {
          filename: f,
          size: stat.size,
          type: ext.replace('.', ''),
          modified: stat.mtime,
          hasTranslation,
          hasPreviewTranslation,
          isTranslating
        };
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));
    res.json(bookFiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger preview translation
app.post('/api/books/files/:filename/translate-preview', authenticate, requireAdmin, async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(BOOKS_DIR, filename);
    
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(BOOKS_DIR))) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const targetPath = path.join(BOOKS_DIR, `${base}_preview_es${ext}`);
    const tempTxtPath = path.join(BOOKS_DIR, `temp_preview_${base}.txt`);
    
    let fileToUpload = filePath;

    if (ext.toLowerCase() === '.pdf') {
      try {
        execSync(`gs -sDEVICE=txtwrite -dNOPAUSE -dBATCH -dSAFER -dFirstPage=1 -dLastPage=20 -sOutputFile="${tempTxtPath}" "${filePath}"`, { stdio: 'ignore' });
        fileToUpload = tempTxtPath;
      } catch(e) {
        if (fs.existsSync(tempTxtPath) && fs.statSync(tempTxtPath).size > 0) {
          fileToUpload = tempTxtPath;
        } else {
          console.error('Error extracting text pages: ', e.message);
        }
      }
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(fileToUpload));
    formData.append('source', 'en');
    formData.append('target', 'es');
    
    // Async
    activeTranslations.add(filename);
    fetch2('http://translator:5000/translate_file', {
      method: 'POST',
      body: formData
    })
    .then(async response => {
      if (!response.ok) {
        let errText = '';
        try { errText = await response.text(); } catch(e) {}
        throw new Error(`Status ${response.status} ${errText}`);
      }
      const data = await response.json();
      if (!data.translatedFileUrl) throw new Error('No translated URL');
      
      const fileRes = await fetch2(data.translatedFileUrl);
      if (!fileRes.ok) throw new Error(`Download failed ${fileRes.status}`);
      
      if (ext.toLowerCase() === '.pdf') {
        const txtBuffer = await fileRes.buffer();
        const translatedTxtPath = path.join(BOOKS_DIR, `temp_trans_${base}.txt`);
        // Write as Latin-1 so enscript handles accented chars (á é í ó ú ñ) correctly
        fs.writeFileSync(translatedTxtPath, txtBuffer.toString('utf-8'), 'latin1');
        try {
          execSync(`enscript -B -X latin1 -p - "${translatedTxtPath}" | ps2pdf - "${targetPath}"`, { stdio: 'ignore' });
        } catch(e) {
          console.error("Enscript to PDF failed:", e.message);
        }
        activeTranslations.delete(filename);
        if (fs.existsSync(tempTxtPath)) fs.unlinkSync(tempTxtPath);
        if (fs.existsSync(translatedTxtPath)) fs.unlinkSync(translatedTxtPath);
      } else {
        const dest = fs.createWriteStream(targetPath);
        fileRes.body.pipe(dest);
        dest.on('finish', () => {
          activeTranslations.delete(filename);
        });
      }
    })
    .catch(err => {
      activeTranslations.delete(filename);
      console.error('Preview translation failed for ' + filename, err.message);
      if (fs.existsSync(tempTxtPath)) fs.unlinkSync(tempTxtPath);
    });

    res.json({ success: true, message: 'Traducción preview en proceso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger manual translation
app.post('/api/books/files/:filename/translate', authenticate, requireAdmin, async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(BOOKS_DIR, filename);
    
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(BOOKS_DIR))) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const targetPath = path.join(BOOKS_DIR, `${base}_es${ext}`);
    const tempTxtPath = path.join(BOOKS_DIR, `temp_full_${base}.txt`);
    
    let fileToUpload = filePath;

    if (ext.toLowerCase() === '.pdf') {
      try {
        execSync(`gs -sDEVICE=txtwrite -dNOPAUSE -dBATCH -dSAFER -sOutputFile="${tempTxtPath}" "${filePath}"`, { stdio: 'ignore' });
        fileToUpload = tempTxtPath;
      } catch(e) {
        if (fs.existsSync(tempTxtPath) && fs.statSync(tempTxtPath).size > 0) {
          fileToUpload = tempTxtPath;
        } else {
          console.error('Error extracting text pages: ', e.message);
        }
      }
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(fileToUpload));
    formData.append('source', 'en');
    formData.append('target', 'es');
    
    // Async
    activeTranslations.add(filename);
    fetch2('http://translator:5000/translate_file', {
      method: 'POST',
      body: formData
    })
    .then(async response => {
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      if (!data.translatedFileUrl) throw new Error('No translated URL');
      
      const fileRes = await fetch2(data.translatedFileUrl);
      if (!fileRes.ok) throw new Error(`Download failed ${fileRes.status}`);
      
      if (ext.toLowerCase() === '.pdf') {
        const txtBuffer = await fileRes.buffer();
        const translatedTxtPath = path.join(BOOKS_DIR, `temp_trans_full_${base}.txt`);
        // Write as Latin-1 so enscript handles accented chars (á é í ó ú ñ) correctly
        fs.writeFileSync(translatedTxtPath, txtBuffer.toString('utf-8'), 'latin1');
        try {
          execSync(`enscript -B -X latin1 -p - "${translatedTxtPath}" | ps2pdf - "${targetPath}"`, { stdio: 'ignore' });
        } catch(e) {
          console.error("Enscript to PDF failed:", e.message);
        }
        activeTranslations.delete(filename);
        if (fs.existsSync(tempTxtPath)) fs.unlinkSync(tempTxtPath);
        if (fs.existsSync(translatedTxtPath)) fs.unlinkSync(translatedTxtPath);
      } else {
        const dest = fs.createWriteStream(targetPath);
        fileRes.body.pipe(dest);
        dest.on('finish', () => {
          activeTranslations.delete(filename);
        });
      }
    })
    .catch(err => {
      activeTranslations.delete(filename);
      if (fs.existsSync(tempTxtPath)) fs.unlinkSync(tempTxtPath);
      console.error('Manual translation failed for ' + filename, err.message);
    });

    res.json({ success: true, message: 'Traducción en proceso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a book file
app.delete('/api/books/files/:filename', authenticate, requireAdmin, async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(BOOKS_DIR, filename);
    
    // Security: ensure the resolved path is within BOOKS_DIR
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(BOOKS_DIR))) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    // Find the book ID to clean up cover and category mapping
    const bookId = Buffer.from(filename).toString('base64').replace(/=/g, '');
    
    // Delete cover if exists
    const coverPath = path.join(COVERS_DIR, `${bookId}.1.png`);
    if (fs.existsSync(coverPath)) {
      fs.unlinkSync(coverPath);
    }
    
    // Remove from categories mapping in the DB
    if (isDbConfigured) {
      await prisma.book.deleteMany({ where: { id: bookId } });
    }
    
    // Delete the actual file
    fs.unlinkSync(filePath);
    
    // Remove translated siblings if they exist
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const esFile = path.join(BOOKS_DIR, `${base}_es${ext}`);
    if (fs.existsSync(esFile)) fs.unlinkSync(esFile);
    const previewEsFile = path.join(BOOKS_DIR, `${base}_preview_es${ext}`);
    if (fs.existsSync(previewEsFile)) fs.unlinkSync(previewEsFile);
    
    // Rescan library
    await scanLibrary();
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/categories
 * Lists all available categories, ordered by sortOrder.
 */
app.get('/api/categories', authenticate, async (req, res) => {
  try {
    const catData = await loadCategories();
    res.json(catData.categories);
  } catch (err) {
    console.error('Error loading categories:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/categories
 * Creates a new category and persists it in the DB.
 * Assigns sortOrder as max(existing) + 1 to place it at the end.
 */
app.post('/api/categories', authenticate, requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).send('Name is required');
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    // Assign sortOrder = last position + 1
    const lastCat = await prisma.category.findFirst({ orderBy: { sortOrder: 'desc' } });
    const sortOrder = lastCat ? lastCat.sortOrder + 1 : 0;
    const newCat = await prisma.category.create({ data: { name, sortOrder } });
    res.json({ id: newCat.id, name: newCat.name, sortOrder: newCat.sortOrder });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Category name already exists' });
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/categories/order
 * Persists the drag-and-drop order of categories.
 * Receives an ordered array of IDs and updates sortOrder for each in a transaction.
 */
app.put('/api/categories/order', authenticate, requireAdmin, async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.category.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/books/:id/category
 * Assigns or removes a category from a book.
 */
app.post('/api/books/:id/category', authenticate, requireAdmin, async (req, res) => {
  const { categoryId } = req.body;
  const bookId = req.params.id;
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    if (categoryId) {
      // Upsert the book record with the new categoryId
      await prisma.book.upsert({
        where: { id: bookId },
        update: { categoryId },
        create: { id: bookId, categoryId }
      });
    } else {
      // Remove category assignment (set to null or delete the record)
      await prisma.book.upsert({
        where: { id: bookId },
        update: { categoryId: null },
        create: { id: bookId, categoryId: null }
      });
    }
    res.json({ success: true, categoryId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/categories/:id
 * Deletes a category and removes its reference from all books.
 */
app.delete('/api/categories/:id', authenticate, requireAdmin, async (req, res) => {
  const catId = req.params.id;
  if (!isDbConfigured) return res.status(503).json({ error: 'DB not configured' });
  try {
    // Unlink books from this category before deleting (referential integrity)
    await prisma.book.updateMany({
      where: { categoryId: catId },
      data: { categoryId: null }
    });
    await prisma.category.delete({ where: { id: catId } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Category not found' });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/translate
 * Direct proxy to the translation service for arbitrary small text snippets.
 */
app.post('/api/translate', authenticate, async (req, res) => {
  const { text, source = 'en', target = 'es' } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });
  
  try {
    const response = await fetch('http://translator:5000/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source, target, format: 'text' })
    });
    
    if (!response.ok) {
        return res.status(response.status).json({ error: 'Translation service error' });
    }
    
    const data = await response.json();
    res.json({ translatedText: data.translatedText });
  } catch (err) {
    console.error('Translation failed:', err);
    res.status(500).json({ error: 'Failed to reach translation service' });
  }
});

// Serve static frontend files from 'public' (container build) or 'frontend/dist' (local dev)
const PUBLIC_DIR = path.join(__dirname, fs.existsSync(path.join(__dirname, 'public')) ? 'public' : '../frontend/dist');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  // Fallback to index.html for Client-Side Routing (SPA)
  app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

const PORT = process.env.PORT || 8080;

app.post('/api/setup-db', authenticate, requireAdmin, async (req, res) => {
  const { mode, dbUrl } = req.body;
  
  try {
    if (mode === 'external' && dbUrl) {
      console.log("Configurando base de datos EXTERNA...");
      const dbConfig = { 
        connection: { url: dbUrl, type: 'external' },
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(DB_CONFIG_FILE, JSON.stringify(dbConfig, null, 2));
      process.env.DATABASE_URL = dbUrl;
    } else {
      console.log("Configurando base de datos LOCAL (Docker)...");
      if (fs.existsSync(DB_CONFIG_FILE)) {
        fs.unlinkSync(DB_CONFIG_FILE); // Eliminar override para volver al default de Compose
      }
      // Re-setear la URL original del compose si fue sobreescrita en memoria
      // (En docker-compose.yml es postgresql://reader:readerpass@postgres:5432/bookreader)
      const DEFAULT_DB = 'postgresql://reader:readerpass@postgres:5432/bookreader';
      process.env.DATABASE_URL = process.env.DATABASE_URL_ORIGINAL || DEFAULT_DB;
    }

    console.log("Materializando esquema de base de datos (npx prisma db push)...");
    execSync('npx prisma db push', { stdio: 'inherit', env: process.env });
    
    console.log("Migrando datos desde ficheros JSON...");
    execSync('node scripts/migrate_test_env.js', { stdio: 'inherit', env: process.env });

    res.json({ success: true, message: 'Base de datos configurada correctamente. Pasando de modo rescate...' });
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error("Error durante setup DB:", error.message);
    res.status(500).json({ error: 'Error configurando la base de datos: ' + error.message });
  }
});

async function startServer() {
  try {
    await prisma.$connect();
    // Validar que las tablas existen haciendo una query ligera
    await prisma.appConfig.findFirst();
    isDbConfigured = true;
  } catch (err) {
    isDbConfigured = false;
    console.warn("===================================================================");
    console.warn(" WARNING: Database connection failed or schema missing. DB Rescue App mode.");
    console.warn("===================================================================");
  }
  
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

startServer();
