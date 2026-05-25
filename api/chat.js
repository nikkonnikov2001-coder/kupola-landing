const https = require('node:https');

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

function buildMessage(data) {
  const name = cleanValue(data.name, 120) || 'Не указано';
  const contact = cleanValue(data.contact, 160) || 'Не указан';
  const message = cleanValue(data.message, 2800);
  const page = cleanValue(data.page, 500) || 'Не указана';

  return [
    '<b>Новый вопрос с сайта</b>',
    '',
    `<b>Имя:</b> ${escapeHtml(name)}`,
    `<b>Контакт:</b> ${escapeHtml(contact)}`,
    '',
    '<b>Вопрос:</b>',
    escapeHtml(message),
    '',
    `<b>Страница:</b> ${escapeHtml(page)}`,
  ].join('\n');
}

function getMaxConfig() {
  return {
    token: cleanValue(process.env.MAX_BOT_TOKEN, 500),
    chatId: cleanValue(process.env.MAX_CHAT_ID, 100),
    userId: cleanValue(process.env.MAX_USER_ID, 100),
  };
}

function postJson(url, body, token) {
  const payload = JSON.stringify(body);
  const requestUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: 'POST',
        hostname: requestUrl.hostname,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 15_000,
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          const data = responseBody ? JSON.parse(responseBody) : {};
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(data.message || data.error || `MAX returned ${response.statusCode}`));
            return;
          }
          resolve(data);
        });
      }
    );

    request.on('timeout', () => request.destroy(new Error('MAX request timed out')));
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function sendMaxMessage(text) {
  const config = getMaxConfig();
  if (!config.token) throw new Error('MAX bot token is not configured');

  const recipient = config.chatId
    ? `chat_id=${encodeURIComponent(config.chatId)}`
    : config.userId
      ? `user_id=${encodeURIComponent(config.userId)}`
      : '';

  if (!recipient) throw new Error('MAX chat_id or user_id is not configured');

  await postJson(
    `https://platform-api.max.ru/messages?${recipient}&disable_link_preview=true`,
    { text, format: 'html', notify: true },
    config.token
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const data = await readJsonBody(req);
    const contact = cleanValue(data.contact, 160);
    const message = cleanValue(data.message, 2800);

    if (!contact || !message) {
      res.status(400).json({ ok: false, error: 'Contact and message are required' });
      return;
    }

    await sendMaxMessage(buildMessage(data));
    res.status(200).json({ ok: true, sentVia: 'max' });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: 'MAX delivery failed',
      message: error.message,
    });
  }
};
