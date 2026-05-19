const { getBroadcastRecipients, requireAdmin, saveBroadcastLog } = require('./_db');
const { sendTelegramMessage } = require('./_telegram');

const MAX_MESSAGE_LENGTH = 3500;

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

function cleanValue(value, maxLength = MAX_MESSAGE_LENGTH) {
  return String(value || '').trim().slice(0, maxLength);
}

function buildManualLinks(recipients, message) {
  const encoded = encodeURIComponent(message);

  return {
    whatsapp: recipients.phones.map((recipient) => ({
      ...recipient,
      url: `${recipient.whatsappUrl}?text=${encoded}`,
    })),
    telegram: recipients.telegramUsernames.map((recipient) => ({
      ...recipient,
      url: recipient.telegramUrl,
    })),
  };
}

async function sendTelegramBroadcast(recipients, message) {
  const results = [];

  for (const recipient of recipients.botUsers) {
    try {
      await sendTelegramMessage(recipient.chatId, message, { parseMode: null });
      results.push({ chatId: recipient.chatId, ok: true });
    } catch (error) {
      results.push({ chatId: recipient.chatId, ok: false, error: error.message });
    }
  }

  return results;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!requireAdmin(req, res)) return;

  try {
    const recipients = await getBroadcastRecipients();

    if (req.method === 'GET') {
      res.status(200).json({
        ok: true,
        recipients,
        counts: {
          botUsers: recipients.botUsers.length,
          phones: recipients.phones.length,
          telegramUsernames: recipients.telegramUsernames.length,
        },
      });
      return;
    }

    const body = await readJsonBody(req);
    const message = cleanValue(body.message);

    if (!message) {
      res.status(400).json({ ok: false, error: 'Message is required' });
      return;
    }

    const telegramResults = body.sendTelegram === false
      ? []
      : await sendTelegramBroadcast(recipients, message);
    const sentCount = telegramResults.filter((result) => result.ok).length;
    const failedCount = telegramResults.filter((result) => !result.ok).length;
    const broadcastId = await saveBroadcastLog({
      channel: 'telegram_bot',
      message,
      sentCount,
      failedCount,
      targetCount: recipients.botUsers.length,
    });

    res.status(200).json({
      ok: true,
      broadcastId,
      sentCount,
      failedCount,
      targetCount: recipients.botUsers.length,
      manualLinks: buildManualLinks(recipients, message),
      telegramResults,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Broadcast failed', message: error.message });
  }
};
