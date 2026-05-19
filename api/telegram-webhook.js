const {
  getRecipientChatIds,
  sendTelegramMessage,
  sendTelegramMessageToRecipients,
} = require('./_telegram');
const { saveBotUser } = require('./_db');

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

function cleanValue(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return cleanValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function userLabel(from) {
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ');
  const username = from?.username ? `@${from.username}` : '';
  return [name, username].filter(Boolean).join(' ') || 'Пользователь Telegram';
}

function buildForwardedBotMessage(message) {
  const from = message.from || {};
  const chat = message.chat || {};
  const text = cleanValue(message.text || message.caption || 'Без текста');

  return [
    '<b>Сообщение в Telegram-бот</b>',
    '',
    `<b>От:</b> ${escapeHtml(userLabel(from))}`,
    `<b>Chat ID:</b> ${escapeHtml(chat.id)}`,
    `<b>User ID:</b> ${escapeHtml(from.id)}`,
    '',
    '<b>Сообщение:</b>',
    escapeHtml(text),
  ].join('\n');
}

async function replyStart(message) {
  const chatId = message.chat.id;
  const recipients = getRecipientChatIds();
  const isRecipient = recipients.includes(String(chatId));

  await sendTelegramMessage(
    chatId,
    [
      'Бот подключен.',
      '',
      `Ваш chat_id: <code>${escapeHtml(chatId)}</code>`,
      '',
      isRecipient
        ? 'Этот чат уже получает заявки с сайта.'
        : 'Чтобы этот чат тоже получал заявки с сайта, добавьте этот chat_id в переменную Vercel TELEGRAM_CHAT_IDS.',
      '',
      'Клиент также может написать сюда сообщение или заявку. Я перешлю ее менеджеру.',
    ].join('\n')
  );
}

async function handleMessage(message) {
  try {
    await saveBotUser(message);
  } catch (error) {
    console.error(error);
  }

  const text = cleanValue(message.text || message.caption);

  if (text.startsWith('/start') || text.startsWith('/help')) {
    await replyStart(message);
    return;
  }

  await sendTelegramMessage(
    message.chat.id,
    'Спасибо. Сообщение принято, менеджер свяжется с вами.'
  );

  await sendTelegramMessageToRecipients(buildForwardedBotMessage(message));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const actualSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (expectedSecret && actualSecret !== expectedSecret) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  try {
    const update = await readJsonBody(req);
    const message = update.message || update.edited_message;

    if (message?.chat?.id) {
      await handleMessage(message);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(200).json({ ok: false, error: error.message });
  }
};
