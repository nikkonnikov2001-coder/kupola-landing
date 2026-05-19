const { listLeads, requireAdmin } = require('./_db');

const CSV_COLUMNS = [
  'id',
  'created_at',
  'type',
  'product',
  'name',
  'phone',
  'email',
  'telegram',
  'message',
  'page',
  'ip',
  'user_agent',
];

function csvValue(value) {
  const text = String(value || '');
  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!requireAdmin(req, res)) return;

  try {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const leads = await listLeads(params.get('limit') || 1000);
    const csv = [
      CSV_COLUMNS.join(','),
      ...leads.map((lead) => CSV_COLUMNS.map((column) => csvValue(lead[column])).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Export failed', message: error.message });
  }
};
