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

function cleanValue(value) {
  return String(value || '').trim().slice(0, MAX_FIELD_LENGTH);
}

function escapeHtml(value) {
  return cleanValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeTelegram(value) {
  const text = cleanValue(value);
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
  const type = cleanValue(data.type) || 'Заявка с сайта';
  const product = cleanValue(data.product) || 'Не указан';
  const name = cleanValue(data.name) || 'Не указано';
  const phone = cleanValue(data.phone) || 'Не указан';
  const email = cleanValue(data.email);
  const telegram = cleanValue(data.telegram);
  const message = cleanValue(data.message) || 'Без комментария';
  const page = cleanValue(data.page) || 'Не указана';

  return [
    '<b>Новая заявка с сайта</b>',
    '',
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
  ].join('\n');
}

async function resolveChatId(token) {
  if (process.env.TELEGRAM_CHAT_ID) {
    return process.env.TELEGRAM_CHAT_ID;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20`);
  const payload = await response.json();

  if (!payload.ok) {
    throw new Error(payload.description || 'Telegram getUpdates failed');
  }

  const updates = Array.isArray(payload.result) ? payload.result : [];
  const latestChat = updates
    .map((update) => update.message?.chat || update.channel_post?.chat)
    .filter(Boolean)
    .pop();

  if (!latestChat?.id) {
    throw new Error('Telegram chat is not connected. Send /start to the bot or set TELEGRAM_CHAT_ID.');
  }

  return latestChat.id;
}

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const chatId = await resolveChatId(token);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.description || 'Telegram sendMessage failed');
  }

  return payload.result;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const data = await readJsonBody(req);
    const name = cleanValue(data.name);
    const phone = cleanValue(data.phone);

    if (!name || !phone) {
      res.status(400).json({ ok: false, error: 'Name and phone are required' });
      return;
    }

    await sendTelegramMessage(buildMessage(data));
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: 'Lead delivery failed',
      message: error.message,
    });
  }
};
