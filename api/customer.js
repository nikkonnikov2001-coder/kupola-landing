const {
  authenticateCustomer,
  deleteCustomerSession,
  getCustomerBySession,
  registerCustomer,
  updateCustomerPassword,
  updateCustomerProfile,
} = require('./_db');

const COOKIE_NAME = 'kupola_customer_session';

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 600_000) {
        req.destroy();
        reject(new Error('Request body is too large'));
      }
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

function getCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index > 0) {
        cookies[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
      }
      return cookies;
    }, {});
}

function getSessionToken(req) {
  return getCookies(req)[COOKIE_NAME] || '';
}

function setSessionCookie(res, session) {
  const expires = new Date(session.expiresAt).toUTCString();
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function requireCustomer(req, res) {
  const token = getSessionToken(req);
  const customer = token ? await getCustomerBySession(token) : null;

  if (!customer) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return null;
  }

  return { customer, token };
}

function publicError(error) {
  if (error.publicMessage) return error.publicMessage;
  if (error.message === 'bad_credentials') return 'bad_credentials';
  if (error.message === 'name_phone_password_required') return 'name_phone_password_required';
  if (error.message === 'name_phone_required') return 'name_phone_required';
  if (error.message === 'bad_password') return 'bad_password';
  return 'customer_request_failed';
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action') || '';

  try {
    if (req.method === 'GET' && action === 'me') {
      const token = getSessionToken(req);
      const customer = token ? await getCustomerBySession(token) : null;
      res.status(200).json({ ok: true, authenticated: Boolean(customer), customer });
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const data = await readJsonBody(req);

    if (action === 'register') {
      const result = await registerCustomer(data, req);
      setSessionCookie(res, result.session);
      res.status(200).json({ ok: true, customer: result.customer });
      return;
    }

    if (action === 'login') {
      const result = await authenticateCustomer(data.login || data.phone || data.email, data.password, req);
      setSessionCookie(res, result.session);
      res.status(200).json({ ok: true, customer: result.customer });
      return;
    }

    if (action === 'logout') {
      await deleteCustomerSession(getSessionToken(req));
      clearSessionCookie(res);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'profile') {
      const session = await requireCustomer(req, res);
      if (!session) return;
      const customer = await updateCustomerProfile(session.customer.id, data);
      res.status(200).json({ ok: true, customer });
      return;
    }

    if (action === 'password') {
      const session = await requireCustomer(req, res);
      if (!session) return;
      await updateCustomerPassword(session.customer.id, data.password);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(404).json({ ok: false, error: 'Unknown action' });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      ok: false,
      error: publicError(error),
      message: error.message,
    });
  }
};
