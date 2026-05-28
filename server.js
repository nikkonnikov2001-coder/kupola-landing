const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const apiHandlers = {
  '/api/chat': require('./api/chat'),
  '/api/customer': require('./api/customer'),
  '/api/customers': require('./api/customers'),
  '/api/export': require('./api/export'),
  '/api/lead': require('./api/lead'),
  '/api/leads': require('./api/leads'),
  '/api/stats': require('./api/stats'),
  '/api/telegram-relay': require('./api/telegram-relay'),
  '/api/telegram-webhook': require('./api/telegram-webhook'),
};

const publicDir = __dirname;
const port = Number(process.env.PORT || 3000);
const cmsContentPath = path.join(publicDir, 'cms', 'content.json');
const cmsHistoryDir = path.join(publicDir, 'cms', 'history');
const cmsUploadsDir = path.join(publicDir, 'uploads');
const cmsUser = process.env.CMS_USER || 'admin';
const cmsPassword = process.env.CMS_PASSWORD || '';
const cmsAuthEnabled = Boolean(cmsPassword);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function isLocalRequest(req) {
  const host = String(req.headers.host || '').split(':')[0];
  const remote = req.socket.remoteAddress || '';
  return ['127.0.0.1', 'localhost', '::1'].includes(host) || remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

function isCmsAuthorized(req) {
  if (!cmsAuthEnabled && isLocalRequest(req) && process.env.NODE_ENV !== 'production') {
    return true;
  }

  if (!cmsAuthEnabled) {
    return false;
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    return false;
  }

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const splitAt = decoded.indexOf(':');
  const user = splitAt >= 0 ? decoded.slice(0, splitAt) : '';
  const password = splitAt >= 0 ? decoded.slice(splitAt + 1) : '';
  return user === cmsUser && password === cmsPassword;
}

function requireCmsAuth(req, res) {
  if (isCmsAuthorized(req)) {
    return true;
  }

  res.statusCode = 401;
  res.setHeader('WWW-Authenticate', 'Basic realm="Visual CMS"');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('CMS auth required');
  return false;
}

async function readRequestBody(req, limit = 25 * 1024 * 1024) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      const error = new Error('Payload too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function sendNoStoreJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function cmsHistoryName() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

async function backupCmsContent() {
  const current = await fsp.readFile(cmsContentPath, 'utf8').catch(() => null);
  if (!current) {
    return;
  }

  await fsp.mkdir(cmsHistoryDir, { recursive: true });
  await fsp.writeFile(path.join(cmsHistoryDir, cmsHistoryName()), current);
  const files = (await fsp.readdir(cmsHistoryDir).catch(() => [])).filter((name) => name.endsWith('.json')).sort();
  for (const name of files.slice(0, Math.max(0, files.length - 30))) {
    await fsp.unlink(path.join(cmsHistoryDir, name)).catch(() => {});
  }
}

async function latestCmsHistoryFile() {
  const files = (await fsp.readdir(cmsHistoryDir).catch(() => [])).filter((name) => name.endsWith('.json')).sort();
  const latest = files.at(-1);
  return latest ? path.join(cmsHistoryDir, latest) : null;
}

function safeCmsHistoryId(id) {
  const name = path.basename(String(id || ''));
  return /^[0-9TZa-zA-Z._-]+\.json$/.test(name) ? name : null;
}

async function readCmsHistoryItems() {
  const files = (await fsp.readdir(cmsHistoryDir).catch(() => [])).filter((name) => name.endsWith('.json')).sort().reverse();
  const items = [];

  for (const name of files.slice(0, 50)) {
    const filePath = path.join(cmsHistoryDir, name);
    const stat = await fsp.stat(filePath).catch(() => null);
    let updatedAt = null;
    let itemCount = 0;

    try {
      const json = JSON.parse(await fsp.readFile(filePath, 'utf8'));
      updatedAt = json.updatedAt || null;
      itemCount = Object.keys(json.items || {}).length;
    } catch {}

    items.push({
      id: name,
      savedAt: stat?.mtime?.toISOString?.() || null,
      updatedAt,
      itemCount,
      size: stat?.size || 0,
    });
  }

  return items;
}

function safeUploadFileName(name) {
  const ext = path.extname(name || '').toLowerCase().replace(/[^.\w-]/g, '');
  const base = path.basename(name || 'image', ext).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
  return `${Date.now()}-${base}${ext || '.png'}`;
}

function attachResponseHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(payload));
  };

  res.send = (payload) => {
    if (Buffer.isBuffer(payload)) {
      res.end(payload);
      return;
    }
    res.end(String(payload || ''));
  };
}

function setCacheHeaders(res, pathname) {
  if (pathname.startsWith('/assets/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
}

function resolveStaticFile(pathname) {
  let safePathname;
  try {
    safePathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (safePathname === '/') {
    safePathname = '/index.html';
  }

  let filePath = path.resolve(publicDir, `.${safePathname}`);
  if (!filePath.startsWith(publicDir + path.sep)) {
    return null;
  }

  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    filePath = `${filePath}.html`;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!mimeTypes[ext] || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }

  return { ext, filePath };
}

async function handleApi(req, res, pathname) {
  const handler = apiHandlers[pathname];
  if (!handler) {
    res.status(404).json({ ok: false, error: 'Not found' });
    return;
  }

  await handler(req, res);
}

async function handleCmsApi(req, res, pathname) {
  const protectedRoute = pathname === '/api/cms/session'
    || pathname === '/api/cms/history'
    || pathname === '/api/cms/undo'
    || pathname === '/api/cms/restore'
    || (pathname.startsWith('/api/cms/') && req.method !== 'GET');

  if (protectedRoute && !requireCmsAuth(req, res)) {
    return;
  }

  if (req.method === 'GET' && pathname === '/api/cms/session') {
    sendNoStoreJson(res, 200, {
      ok: true,
      user: cmsUser,
      authEnabled: cmsAuthEnabled,
      devOpen: !cmsAuthEnabled && isLocalRequest(req) && process.env.NODE_ENV !== 'production',
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/cms/history') {
    sendNoStoreJson(res, 200, { ok: true, items: await readCmsHistoryItems() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/cms/undo') {
    const latest = await latestCmsHistoryFile();
    if (!latest) {
      sendNoStoreJson(res, 409, { ok: false, error: 'no_history' });
      return;
    }

    const previous = await fsp.readFile(latest, 'utf8');
    await fsp.writeFile(cmsContentPath, previous);
    await fsp.unlink(latest).catch(() => {});
    sendNoStoreJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/cms/restore') {
    const body = JSON.parse(await readRequestBody(req));
    const id = safeCmsHistoryId(body.id);
    if (!id) {
      sendNoStoreJson(res, 400, { ok: false, error: 'bad_history_id' });
      return;
    }

    const filePath = path.join(cmsHistoryDir, id);
    const previous = await fsp.readFile(filePath, 'utf8').catch(() => null);
    if (!previous) {
      sendNoStoreJson(res, 404, { ok: false, error: 'history_not_found' });
      return;
    }

    await backupCmsContent();
    await fsp.writeFile(cmsContentPath, previous);
    sendNoStoreJson(res, 200, { ok: true, restored: id });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/cms/content') {
    const data = await fsp.readFile(cmsContentPath, 'utf8').catch(() => '{"version":1,"items":{}}');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/cms/content') {
    const json = JSON.parse(await readRequestBody(req));
    const safe = {
      version: 1,
      updatedAt: new Date().toISOString(),
      items: json.items && typeof json.items === 'object' ? json.items : {},
    };

    await fsp.mkdir(path.dirname(cmsContentPath), { recursive: true });
    await backupCmsContent();
    await fsp.writeFile(cmsContentPath, `${JSON.stringify(safe, null, 2)}\n`);
    sendNoStoreJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/cms/upload') {
    const json = JSON.parse(await readRequestBody(req));
    const match = String(json.dataUrl || '').match(/^data:(image\/(?:png|jpe?g|webp|svg\+xml|avif));base64,(.+)$/);
    if (!match) {
      sendNoStoreJson(res, 400, { ok: false, error: 'bad_image' });
      return;
    }

    const filename = safeUploadFileName(json.filename || 'image.png');
    await fsp.mkdir(cmsUploadsDir, { recursive: true });
    await fsp.writeFile(path.join(cmsUploadsDir, filename), Buffer.from(match[2], 'base64'));
    sendNoStoreJson(res, 200, { ok: true, path: `/uploads/${filename}` });
    return;
  }

  sendNoStoreJson(res, 404, { ok: false, error: 'Not found' });
}

function handleStatic(req, res, pathname) {
  const file = resolveStaticFile(pathname);
  if (!file) {
    res.status(404).send('Not found');
    return;
  }

  setCacheHeaders(res, pathname);
  res.setHeader('Content-Type', mimeTypes[file.ext]);
  fs.createReadStream(file.filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  attachResponseHelpers(res);

  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (pathname === '/admin' || pathname === '/admin/' || pathname === '/editor' || pathname === '/editor/') {
      if (!requireCmsAuth(req, res)) {
        return;
      }

      handleStatic(req, res, '/index.html');
      return;
    }

    if (pathname.startsWith('/api/cms/')) {
      await handleCmsApi(req, res, pathname);
      return;
    }

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).send('Method not allowed');
      return;
    }

    handleStatic(req, res, pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: 'Internal server error' });
    } else {
      res.end();
    }
  }
});

server.listen(port, () => {
  console.log(`Kupola landing is running on http://127.0.0.1:${port}`);
});
