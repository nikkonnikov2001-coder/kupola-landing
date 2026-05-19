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
        `create table if not exists bot_users (
          chat_id text primary key,
          user_id text,
          username text,
          first_name text,
          last_name text,
          created_at text not null default (datetime('now')),
          updated_at text not null default (datetime('now'))
        )`,
        'create index if not exists idx_bot_users_username on bot_users(username)',
        `create table if not exists broadcasts (
          id integer primary key autoincrement,
          created_at text not null default (datetime('now')),
          channel text not null,
          message text not null,
          sent_count integer not null default 0,
          failed_count integer not null default 0,
          target_count integer not null default 0
        )`,
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

function normalizePhone(phone) {
  const digits = cleanValue(phone, 100).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function normalizeTelegramUsername(value) {
  const match = cleanValue(value, 100).match(/@?([a-zA-Z0-9_]{5,32})/);
  return match ? match[1].toLowerCase() : '';
}

async function saveBotUser(message) {
  await initDb();
  const chat = message.chat || {};
  const from = message.from || {};
  const chatId = cleanValue(chat.id || from.id, 100);

  if (!chatId) return null;

  await getClient().execute({
    sql: `insert into bot_users (
      chat_id, user_id, username, first_name, last_name, updated_at
    ) values (?, ?, ?, ?, ?, datetime('now'))
    on conflict(chat_id) do update set
      user_id = excluded.user_id,
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      updated_at = datetime('now')`,
    args: [
      chatId,
      cleanValue(from.id, 100),
      cleanValue(from.username, 100),
      cleanValue(from.first_name, 200),
      cleanValue(from.last_name, 200),
    ],
  });

  return chatId;
}

async function getBroadcastRecipients(limit = 5000) {
  await initDb();
  const safeLimit = Math.min(Math.max(Number(limit) || 5000, 1), 10000);
  const [leadRows, botRows] = await Promise.all([
    getClient().execute({
      sql: `select id, created_at, product, name, phone, telegram
            from leads
            order by datetime(created_at) desc
            limit ?`,
      args: [safeLimit],
    }),
    getClient().execute({
      sql: `select chat_id, user_id, username, first_name, last_name, created_at, updated_at
            from bot_users
            order by datetime(updated_at) desc`,
    }),
  ]);

  const phones = new Map();
  const telegramUsernames = new Map();

  for (const lead of leadRows.rows) {
    const phoneKey = normalizePhone(lead.phone);
    if (phoneKey) {
      const existing = phones.get(phoneKey);
      phones.set(phoneKey, {
        count: (existing?.count || 0) + 1,
        lastLeadAt: existing?.lastLeadAt || lead.created_at,
        name: existing?.name || lead.name || '',
        phone: existing?.phone || lead.phone || phoneKey,
        product: existing?.product || lead.product || '',
        maxContact: phoneKey,
      });
    }

    const username = normalizeTelegramUsername(lead.telegram);
    if (username) {
      const existing = telegramUsernames.get(username);
      telegramUsernames.set(username, {
        count: (existing?.count || 0) + 1,
        lastLeadAt: existing?.lastLeadAt || lead.created_at,
        name: existing?.name || lead.name || '',
        product: existing?.product || lead.product || '',
        telegram: `@${username}`,
        telegramUrl: `https://t.me/${username}`,
      });
    }
  }

  return {
    phones: Array.from(phones.values()),
    telegramUsernames: Array.from(telegramUsernames.values()),
    botUsers: botRows.rows.map((row) => ({
      chatId: row.chat_id,
      userId: row.user_id,
      username: row.username ? `@${row.username}` : '',
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

async function saveBroadcastLog(data) {
  await initDb();
  const result = await getClient().execute({
    sql: `insert into broadcasts (
      channel, message, sent_count, failed_count, target_count
    ) values (?, ?, ?, ?, ?)`,
    args: [
      cleanValue(data.channel, 100),
      cleanValue(data.message, 4000),
      Number(data.sentCount) || 0,
      Number(data.failedCount) || 0,
      Number(data.targetCount) || 0,
    ],
  });

  return Number(result.lastInsertRowid);
}

async function getStats() {
  await initDb();
  const db = getClient();
  const [total, today, byProduct, byType, byDay, botUsers] = await Promise.all([
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
    db.execute('select count(*) as count from bot_users'),
  ]);

  return {
    total: Number(total.rows[0]?.count || 0),
    today: Number(today.rows[0]?.count || 0),
    botUsers: Number(botUsers.rows[0]?.count || 0),
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
  getBroadcastRecipients,
  getStats,
  listLeads,
  requireAdmin,
  saveBotUser,
  saveBroadcastLog,
  saveLead,
};
