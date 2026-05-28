const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@libsql/client');

let client;
let initPromise;

function getDatabaseConfig() {
  const url = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  if (url) {
    return authToken ? { url, authToken } : { url };
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
        `create table if not exists customer_users (
          id integer primary key autoincrement,
          created_at text not null default (datetime('now')),
          updated_at text not null default (datetime('now')),
          last_login_at text,
          name text not null,
          phone text not null unique,
          email text unique,
          telegram text,
          city text,
          company text,
          avatar text,
          password_hash text not null,
          password_salt text not null
        )`,
        'create index if not exists idx_customer_users_created_at on customer_users(created_at)',
        'create index if not exists idx_customer_users_phone on customer_users(phone)',
        'create index if not exists idx_customer_users_email on customer_users(email)',
        `create table if not exists customer_sessions (
          id integer primary key autoincrement,
          user_id integer not null,
          token_hash text not null unique,
          created_at text not null default (datetime('now')),
          expires_at text not null,
          user_agent text,
          ip text,
          foreign key(user_id) references customer_users(id) on delete cascade
        )`,
        'create index if not exists idx_customer_sessions_user_id on customer_sessions(user_id)',
        'create index if not exists idx_customer_sessions_expires_at on customer_sessions(expires_at)',
      ]);
    })();
  }

  return initPromise;
}

function cleanValue(value, maxLength = 1500) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizePhone(value) {
  const text = cleanValue(value, 100);
  const digits = text.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return text;
}

function normalizeEmail(value) {
  return cleanValue(value, 200).toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, 120000, 32, 'sha256').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  if (hash.length !== String(expectedHash || '').length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(String(expectedHash || '')));
}

function publicCustomer(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || '',
    telegram: row.telegram || '',
    city: row.city || '',
    company: row.company || '',
    avatar: row.avatar || '',
  };
}

function normalizeDate(value) {
  const text = cleanValue(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function buildLeadFilters(filters = {}) {
  const clauses = [];
  const args = [];
  const dateFrom = normalizeDate(filters.dateFrom || filters.date_from || filters.from);
  const dateTo = normalizeDate(filters.dateTo || filters.date_to || filters.to);

  if (dateFrom) {
    clauses.push('date(created_at) >= date(?)');
    args.push(dateFrom);
  }

  if (dateTo) {
    clauses.push('date(created_at) <= date(?)');
    args.push(dateTo);
  }

  return {
    args,
    dateFrom,
    dateTo,
    where: clauses.length ? `where ${clauses.join(' and ')}` : '',
  };
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

async function listLeads(limit = 200, filters = {}) {
  await initDb();
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const filter = buildLeadFilters(filters);
  const result = await getClient().execute({
    sql: `select id, created_at, type, product, name, phone, email, telegram, message, page, user_agent, ip
          from leads
          ${filter.where}
          order by datetime(created_at) desc
          limit ?`,
    args: [...filter.args, safeLimit],
  });

  return result.rows;
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

async function getStats(filters = {}) {
  await initDb();
  const db = getClient();
  const filter = buildLeadFilters(filters);
  const [total, periodTotal, today, uniquePhones, byProduct, byType, byDay, botUsers] = await Promise.all([
    db.execute('select count(*) as count from leads'),
    db.execute({
      sql: `select count(*) as count from leads ${filter.where}`,
      args: filter.args,
    }),
    db.execute("select count(*) as count from leads where date(created_at) = date('now')"),
    db.execute({
      sql: `select count(distinct phone) as count from leads ${filter.where}`,
      args: filter.args,
    }),
    db.execute({
      sql: `select product, count(*) as count
            from leads
            ${filter.where}
            group by product
            order by count desc, product asc
            limit 20`,
      args: filter.args,
    }),
    db.execute({
      sql: `select type, count(*) as count
            from leads
            ${filter.where}
            group by type
            order by count desc, type asc`,
      args: filter.args,
    }),
    db.execute({
      sql: `select date(created_at) as day, count(*) as count
            from leads
            ${filter.where}
            group by date(created_at)
            order by day asc
            limit 60`,
      args: filter.args,
    }),
    db.execute('select count(*) as count from bot_users'),
  ]);

  return {
    total: Number(total.rows[0]?.count || 0),
    periodTotal: Number(periodTotal.rows[0]?.count || 0),
    today: Number(today.rows[0]?.count || 0),
    uniquePhones: Number(uniquePhones.rows[0]?.count || 0),
    botUsers: Number(botUsers.rows[0]?.count || 0),
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    byProduct: byProduct.rows.map((row) => ({ product: row.product, count: Number(row.count) })),
    byType: byType.rows.map((row) => ({ type: row.type, count: Number(row.count) })),
    byDay: byDay.rows.map((row) => ({ day: row.day, count: Number(row.count) })),
  };
}

async function createCustomer(data = {}, req) {
  await initDb();
  const db = getClient();
  const name = cleanValue(data.name, 200);
  const phone = normalizePhone(data.phone);
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');

  if (!name || !phone || password.length < 4) {
    const error = new Error('name_phone_password_required');
    error.status = 400;
    throw error;
  }

  const { hash, salt } = hashPassword(password);

  try {
    const result = await db.execute({
      sql: `insert into customer_users (
        name, phone, email, telegram, city, company, avatar, password_hash, password_salt
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        name,
        phone,
        email || null,
        cleanValue(data.telegram, 100),
        cleanValue(data.city, 200),
        cleanValue(data.company, 200),
        cleanValue(data.avatar, 300000),
        hash,
        salt,
      ],
    });

    return getCustomerById(Number(result.lastInsertRowid));
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      error.status = 409;
      error.publicMessage = 'customer_exists';
    }
    throw error;
  }
}

async function getCustomerById(id) {
  await initDb();
  const result = await getClient().execute({
    sql: `select id, created_at, updated_at, last_login_at, name, phone, email, telegram, city, company, avatar
          from customer_users
          where id = ?`,
    args: [Number(id)],
  });
  return publicCustomer(result.rows[0]);
}

async function findCustomerForLogin(login) {
  await initDb();
  const normalizedPhone = normalizePhone(login);
  const normalizedEmail = normalizeEmail(login);
  const result = await getClient().execute({
    sql: `select *
          from customer_users
          where phone = ? or email = ?
          limit 1`,
    args: [normalizedPhone, normalizedEmail],
  });
  return result.rows[0] || null;
}

function sessionTokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function createCustomerSession(userId, req) {
  await initDb();
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sessionTokenHash(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  await getClient().execute({
    sql: `insert into customer_sessions (user_id, token_hash, expires_at, user_agent, ip)
          values (?, ?, ?, ?, ?)`,
    args: [
      Number(userId),
      tokenHash,
      expiresAt,
      cleanValue(req.headers['user-agent'], 500),
      getIp(req),
    ],
  });

  return { token, expiresAt };
}

async function authenticateCustomer(login, password, req) {
  const row = await findCustomerForLogin(login);
  if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
    const error = new Error('bad_credentials');
    error.status = 401;
    throw error;
  }

  await getClient().execute({
    sql: `update customer_users set last_login_at = datetime('now'), updated_at = datetime('now') where id = ?`,
    args: [Number(row.id)],
  });

  const session = await createCustomerSession(row.id, req);
  return { customer: await getCustomerById(row.id), session };
}

async function registerCustomer(data, req) {
  const customer = await createCustomer(data, req);
  const session = await createCustomerSession(customer.id, req);
  return { customer, session };
}

async function getCustomerBySession(token) {
  await initDb();
  const tokenHash = sessionTokenHash(token);
  const result = await getClient().execute({
    sql: `select u.id, u.created_at, u.updated_at, u.last_login_at, u.name, u.phone, u.email, u.telegram, u.city, u.company, u.avatar
          from customer_sessions s
          join customer_users u on u.id = s.user_id
          where s.token_hash = ? and datetime(s.expires_at) > datetime('now')
          limit 1`,
    args: [tokenHash],
  });
  return publicCustomer(result.rows[0]);
}

async function deleteCustomerSession(token) {
  await initDb();
  if (!token) return;
  await getClient().execute({
    sql: 'delete from customer_sessions where token_hash = ?',
    args: [sessionTokenHash(token)],
  });
}

async function updateCustomerProfile(customerId, data = {}) {
  await initDb();
  const name = cleanValue(data.name, 200);
  const phone = normalizePhone(data.phone);
  const email = normalizeEmail(data.email);

  if (!name || !phone) {
    const error = new Error('name_phone_required');
    error.status = 400;
    throw error;
  }

  try {
    await getClient().execute({
      sql: `update customer_users
            set name = ?, phone = ?, email = ?, telegram = ?, city = ?, company = ?, avatar = ?, updated_at = datetime('now')
            where id = ?`,
      args: [
        name,
        phone,
        email || null,
        cleanValue(data.telegram, 100),
        cleanValue(data.city, 200),
        cleanValue(data.company, 200),
        cleanValue(data.avatar, 300000),
        Number(customerId),
      ],
    });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      error.status = 409;
      error.publicMessage = 'customer_exists';
    }
    throw error;
  }

  return getCustomerById(customerId);
}

async function updateCustomerPassword(customerId, password) {
  await initDb();
  if (String(password || '').length < 4) {
    const error = new Error('bad_password');
    error.status = 400;
    throw error;
  }

  const { hash, salt } = hashPassword(password);
  await getClient().execute({
    sql: `update customer_users
          set password_hash = ?, password_salt = ?, updated_at = datetime('now')
          where id = ?`,
    args: [hash, salt, Number(customerId)],
  });
}

async function listCustomers(limit = 500, filters = {}) {
  await initDb();
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const filter = buildLeadFilters(filters);
  const where = filter.where ? filter.where.replaceAll('created_at', 'created_at') : '';
  const result = await getClient().execute({
    sql: `select id, created_at, updated_at, last_login_at, name, phone, email, telegram, city, company
          from customer_users
          ${where}
          order by datetime(created_at) desc
          limit ?`,
    args: [...filter.args, safeLimit],
  });

  return result.rows.map(publicCustomer);
}

async function getCustomerStats(filters = {}) {
  await initDb();
  const filter = buildLeadFilters(filters);
  const db = getClient();
  const [total, periodTotal, today] = await Promise.all([
    db.execute('select count(*) as count from customer_users'),
    db.execute({
      sql: `select count(*) as count from customer_users ${filter.where}`,
      args: filter.args,
    }),
    db.execute("select count(*) as count from customer_users where date(created_at) = date('now')"),
  ]);

  return {
    total: Number(total.rows[0]?.count || 0),
    periodTotal: Number(periodTotal.rows[0]?.count || 0),
    today: Number(today.rows[0]?.count || 0),
  };
}

function isAuthorized(req) {
  const token = process.env.LEADS_ADMIN_TOKEN;
  if (!token) return process.env.NODE_ENV !== 'production';

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
  authenticateCustomer,
  deleteCustomerSession,
  getCustomerBySession,
  getCustomerStats,
  getStats,
  listCustomers,
  listLeads,
  requireAdmin,
  registerCustomer,
  saveBotUser,
  saveLead,
  updateCustomerPassword,
  updateCustomerProfile,
};
