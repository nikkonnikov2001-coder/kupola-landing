const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const apiHandlers = {
  '/api/export': require('./api/export'),
  '/api/lead': require('./api/lead'),
  '/api/leads': require('./api/leads'),
  '/api/stats': require('./api/stats'),
  '/api/telegram-webhook': require('./api/telegram-webhook'),
};

const publicDir = __dirname;
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

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
