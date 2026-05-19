const { listLeads, requireAdmin } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!requireAdmin(req, res)) return;

  try {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const leads = await listLeads(params.get('limit') || 200, {
      dateFrom: params.get('date_from'),
      dateTo: params.get('date_to'),
    });
    res.status(200).json({ ok: true, leads });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Leads read failed', message: error.message });
  }
};
