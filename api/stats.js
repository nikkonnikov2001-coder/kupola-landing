const { getStats, requireAdmin } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!requireAdmin(req, res)) return;

  try {
    const stats = await getStats();
    res.status(200).json({ ok: true, stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Stats read failed', message: error.message });
  }
};
