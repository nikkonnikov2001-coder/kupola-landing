const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@libsql/client');

let client;
let initPromise;

function getDatabaseConfig() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;

  if (url) {
    return authToken ? { url, authToken } : { url };
  }

  if (process.env.VERCEL) {
    throw new Error('Persistent SQLite is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
  }

  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return { url: `file:${path.join(dataDir, 'leads.sqlite')}` };
}

function getClient() {
  if (!client) {
    client = createClient(getDatabaseConfig());
  }

  return client;
}

async function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      const db = getClient();
      await db.batch([
        `create table if not exists leads (
          id integer primary key autoincrement,
          created_at text not null default (datetime('now')),
          type text not null,
          product text not null,
          name text not null,
          phone text not null,
          email text,
          telegram text,
          message text,
          page text,
          user_agent text,
          ip text
        )`,
        'create index if not exists idx_leads_created_at on leads(created_at)',
        'create index if not exists idx_leads_product on leads(product)',
        'create index if not exists idx_leads_phone on leads(phone)',
      ]);
    })();
  }

  return initPromise;
}

function cleanValue(value, maxLength = 1500) {
  return String(value || '').trim().slice(0, maxLength);
}

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return cleanValue(req.socket?.remoteAddress || '', 128);
}

async function saveLead(data, req) {
  await initDb();
  const db = getClient();
  const result = await db.execute({
    sql: `insert into leads (
      type, product, name, phone, email, telegram, message, page, user_agent, ip
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      cleanValue(data.type, 200) || 'Заявка с сайта',
      cleanValue(data.product, 300) || 'Не указан',
      cleanValue(data.name, 200),
      cleanValue(data.phone, 100),
      cleanValue(data.email, 200),
      cleanValue(data.telegram, 100),
      cleanValue(data.message, 1500),
      cleanValue(data.page, 500),
      cleanValue(req.headers['user-agent'], 500),
      getIp(req),
    ],
  });

  return Number(result.lastInsertRowid);
}

async function listLeads(limit = 200) {
  await initDb();
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const result = await getClient().execute({
    sql: `select id, created_at, type, product, name, phone, email, telegram, message, page, user_agent, ip
          from leads
          order by datetime(created_at) desc
          limit ?`,
    args: [safeLimit],
  });

  return result.rows;
}

async function getStats() {
  await initDb();
  const db = getClient();
  const [total, today, byProduct, byType, byDay] = await Promise.all([
    db.execute('select count(*) as count from leads'),
    db.execute("select count(*) as count from leads where date(created_at) = date('now')"),
    db.execute(`select product, count(*) as count
                from leads
                group by product
                order by count desc, product asc
                limit 20`),
    db.execute(`select type, count(*) as count
                from leads
                group by type
                order by count desc, type asc`),
    db.execute(`select date(created_at) as day, count(*) as count
                from leads
                group by date(created_at)
                order by day desc
                limit 30`),
  ]);

  return {
    total: Number(total.rows[0]?.count || 0),
    today: Number(today.rows[0]?.count || 0),
    byProduct: byProduct.rows.map((row) => ({ product: row.product, count: Number(row.count) })),
    byType: byType.rows.map((row) => ({ type: row.type, count: Number(row.count) })),
    byDay: byDay.rows.map((row) => ({ day: row.day, count: Number(row.count) })),
  };
}

function isAuthorized(req) {
  const token = process.env.LEADS_ADMIN_TOKEN;
  if (!token) return !process.env.VERCEL;

  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const queryToken = new URL(req.url, 'http://localhost').searchParams.get('token') || '';

  return bearer === token || queryToken === token;
}

function requireAdmin(req, res) {
  if (isAuthorized(req)) return true;

  res.status(401).json({ ok: false, error: 'Unauthorized' });
  return false;
}

module.exports = {
  getStats,
  listLeads,
  requireAdmin,
  saveLead,
};
