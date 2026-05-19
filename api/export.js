const { listLeads, requireAdmin } = require('./_db');

const CSV_COLUMNS = [
  ['Имя', 'name'],
  ['Телефон', 'phone'],
  ['Telegram', 'telegram'],
  ['Товар', 'product'],
  ['Комментарий', 'message'],
];

function csvValue(value) {
  const text = String(value || '');
  return `"${text.replace(/"/g, '""')}"`;
}

function filenameDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : '';
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
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const leads = await listLeads(params.get('limit') || 1000, { dateFrom, dateTo });
    const delimiter = ';';
    const csv = [
      CSV_COLUMNS.map(([title]) => csvValue(title)).join(delimiter),
      ...leads.map((lead) =>
        CSV_COLUMNS.map(([, field]) => csvValue(lead[field])).join(delimiter)
      ),
    ].join('\n');
    const suffix = [filenameDate(dateFrom), filenameDate(dateTo)].filter(Boolean).join('_');
    const filename = suffix ? `leads_${suffix}.csv` : 'leads.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Export failed', message: error.message });
  }
};
