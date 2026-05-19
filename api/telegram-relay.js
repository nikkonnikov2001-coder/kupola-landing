const { sendTelegramMessageToRecipients } = require('./_telegram');

const MAX_BODY_LENGTH = 100_000;

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_LENGTH) {
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

function cleanValue(value, maxLength = 3900) {
  return String(value || '').trim().slice(0, maxLength);
}

function getRequestHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isAuthorized(req) {
  const expected = cleanValue(process.env.TELEGRAM_RELAY_SECRET || process.env.LEAD_RELAY_SECRET, 500);
  if (!expected) return false;

  const actual = cleanValue(getRequestHeader(req, 'x-relay-secret'), 500);
  return actual === expected;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  try {
    const data = await readJsonBody(req);
    const text = cleanValue(data.text);

    if (!text) {
      res.status(400).json({ ok: false, error: 'Message text is required' });
      return;
    }

    const results = await sendTelegramMessageToRecipients(text);
    res.status(200).json({ ok: true, sent: results.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Telegram delivery failed', message: error.message });
  }
};
