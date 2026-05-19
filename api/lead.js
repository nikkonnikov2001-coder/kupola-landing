const { saveLead } = require('./_db');
const { sendTelegramMessageToRecipients } = require('./_telegram');

const MAX_FIELD_LENGTH = 1500;

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
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

function cleanValue(value, maxLength = MAX_FIELD_LENGTH) {
  return String(value || '').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return cleanValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeTelegram(value) {
  const text = cleanValue(value, 100);
  if (!text) return '';

  const usernameMatch = text.match(/@?([a-zA-Z0-9_]{5,32})/);
  if (!usernameMatch) return text;

  return `@${usernameMatch[1]}`;
}

function formatTelegramLink(value) {
  const telegram = normalizeTelegram(value);
  if (!telegram || !telegram.startsWith('@')) return escapeHtml(telegram || 'не указан');

  const username = telegram.slice(1);
  return `<a href="https://t.me/${username}">${escapeHtml(telegram)}</a>`;
}

function buildMessage(data) {
  const leadId = cleanValue(data.leadId, 100);
  const type = cleanValue(data.type, 200) || 'Заявка с сайта';
  const product = cleanValue(data.product, 300) || 'Не указан';
  const name = cleanValue(data.name, 200) || 'Не указано';
  const phone = cleanValue(data.phone, 100) || 'Не указан';
  const email = cleanValue(data.email, 200);
  const telegram = cleanValue(data.telegram, 100);
  const message = cleanValue(data.message) || 'Без комментария';
  const page = cleanValue(data.page, 500) || 'Не указана';

  return [
    '<b>Новая заявка с сайта</b>',
    '',
    leadId ? `<b>ID:</b> ${escapeHtml(leadId)}` : '',
    `<b>Тип:</b> ${escapeHtml(type)}`,
    `<b>Товар:</b> ${escapeHtml(product)}`,
    `<b>Имя:</b> ${escapeHtml(name)}`,
    `<b>Телефон:</b> ${escapeHtml(phone)}`,
    email ? `<b>Email:</b> ${escapeHtml(email)}` : '',
    `<b>Telegram:</b> ${formatTelegramLink(telegram)}`,
    '',
    '<b>Запрос:</b>',
    escapeHtml(message),
    '',
    `<b>Страница:</b> ${escapeHtml(page)}`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function getRelayConfig() {
  return {
    secret: cleanValue(process.env.LEAD_RELAY_SECRET || process.env.TELEGRAM_RELAY_SECRET, 500),
    url: cleanValue(process.env.LEAD_RELAY_URL, 500),
  };
}

async function postLeadRelay(text) {
  const relay = getRelayConfig();
  if (!relay.url) {
    throw new Error('Lead relay is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(relay.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(relay.secret ? { 'X-Relay-Secret': relay.secret } : {}),
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || payload.error || `Relay returned ${response.status}`);
    }

    return {
      sent: Number(payload.sent || 1),
      via: 'relay',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function deliverLeadMessage(text) {
  let relayError = '';
  if (getRelayConfig().url) {
    try {
      return await postLeadRelay(text);
    } catch (error) {
      relayError = error.message;
      console.error(error);
    }
  }

  try {
    const telegramResults = await sendTelegramMessageToRecipients(text);
    return {
      sent: telegramResults.length,
      via: 'direct',
    };
  } catch (error) {
    const message = relayError ? `Relay failed: ${relayError}; direct failed: ${error.message}` : error.message;
    throw new Error(message);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const data = await readJsonBody(req);
    const name = cleanValue(data.name, 200);
    const phone = cleanValue(data.phone, 100);

    if (!name || !phone) {
      res.status(400).json({ ok: false, error: 'Name and phone are required' });
      return;
    }

    let leadId = null;
    let databaseSaved = false;

    try {
      leadId = await saveLead(data, req);
      databaseSaved = true;
    } catch (databaseError) {
      console.error(databaseError);
    }

    let telegramSent = 0;
    let telegramError = '';
    let telegramVia = '';

    try {
      const delivery = await deliverLeadMessage(buildMessage({ ...data, leadId }));
      telegramSent = delivery.sent;
      telegramVia = delivery.via;
    } catch (deliveryError) {
      telegramError = deliveryError.message;
      console.error(deliveryError);
    }

    if (!databaseSaved && !telegramSent) {
      throw new Error(telegramError || 'Lead was not saved or delivered');
    }

    res.status(200).json({
      ok: true,
      leadId,
      databaseSaved,
      telegramSent,
      telegramVia,
      telegramError,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: 'Lead delivery failed',
      message: error.message,
    });
  }
};
