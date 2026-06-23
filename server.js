const http = require('node:http');
const { readFileSync, existsSync, mkdirSync } = require('node:fs');
const { extname, join, normalize } = require('node:path');
const { randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const ACCESS_CODE = process.env.ACCESS_CODE || 'ididntdonothin';
const DATA_DIR = join(__dirname, 'data');
const PUBLIC_DIR = join(__dirname, 'public');

mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'bingo.sqlite'));
db.exec(`
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    words TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const statements = {
  create: db.prepare('INSERT INTO boards (id, title, words) VALUES (?, ?, ?)'),
  get: db.prepare('SELECT id, title, words, created_at, updated_at FROM boards WHERE id = ?'),
  update: db.prepare("UPDATE boards SET title = ?, words = ?, updated_at = datetime('now') WHERE id = ?")
};

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.ico', 'image/x-icon']
]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
}

function isAuthed(req) {
  return req.headers['x-access-code'] === ACCESS_CODE;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 200_000) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseWords(input) {
  if (!Array.isArray(input)) return [];

  const cleaned = input
    .map(word => String(word).trim())
    .filter(Boolean)
    .map(word => word.replace(/\s+/g, ' '));

  return [...new Set(cleaned)].slice(0, 500);
}

function parseBoard(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    words: JSON.parse(row.words),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function makeId() {
  return randomBytes(5).toString('base64url').toLowerCase();
}

function createId() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = makeId();
    if (!statements.get.get(id)) return id;
  }
  throw Object.assign(new Error('Could not create unique ID'), { statusCode: 500 });
}

async function handleApi(req, res) {
  if (!isAuthed(req)) {
    sendJson(res, 401, { error: 'Access code required' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/auth') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/boards') {
    const payload = JSON.parse(await readBody(req) || '{}');
    const words = parseWords(payload.words);
    const title = String(payload.title || '').trim().slice(0, 80);

    if (words.length === 0) {
      sendJson(res, 400, { error: 'Add at least one word.' });
      return;
    }

    const id = createId();
    statements.create.run(id, title, JSON.stringify(words));
    sendJson(res, 201, parseBoard(statements.get.get(id)));
    return;
  }

  const boardMatch = url.pathname.match(/^\/api\/boards\/([a-z0-9_-]+)$/);
  if (boardMatch && req.method === 'GET') {
    const board = parseBoard(statements.get.get(boardMatch[1]));
    if (!board) {
      sendJson(res, 404, { error: 'Bingo not found.' });
      return;
    }
    sendJson(res, 200, board);
    return;
  }

  if (boardMatch && req.method === 'PUT') {
    const payload = JSON.parse(await readBody(req) || '{}');
    const words = parseWords(payload.words);
    const title = String(payload.title || '').trim().slice(0, 80);

    if (words.length === 0) {
      sendJson(res, 400, { error: 'Add at least one word.' });
      return;
    }

    const result = statements.update.run(title, JSON.stringify(words), boardMatch[1]);
    if (result.changes === 0) {
      sendJson(res, 404, { error: 'Bingo not found.' });
      return;
    }

    sendJson(res, 200, parseBoard(statements.get.get(boardMatch[1])));
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === '/' || url.pathname.startsWith('/b/')
    ? '/index.html'
    : url.pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    send(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
    return;
  }

  const contentType = mimeTypes.get(extname(filePath)) || 'application/octet-stream';
  send(res, 200, readFileSync(filePath), {
    'content-type': contentType,
    'cache-control': contentType.startsWith('text/html') ? 'no-store' : 'public, max-age=3600'
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      await handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    const status = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
    sendJson(res, status, { error: status === 500 ? 'Server error' : error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Bingo maker listening on http://localhost:${PORT}`);
});
