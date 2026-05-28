const { getCustomerStats, listCustomers, requireAdmin } = require('./_db');

const CSV_COLUMNS = [
  ['ID', 'id'],
  ['Дата регистрации', 'created_at'],
  ['Имя', 'name'],
  ['Телефон', 'phone'],
  ['Email', 'email'],
  ['Telegram', 'telegram'],
  ['Город', 'city'],
  ['Компания', 'company'],
  ['Последний вход', 'last_login_at'],
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
    const filters = { dateFrom, dateTo };
    const customers = await listCustomers(params.get('limit') || 500, filters);

    if (params.get('format') === 'csv') {
      const delimiter = ';';
      const csv = [
        CSV_COLUMNS.map(([title]) => csvValue(title)).join(delimiter),
        ...customers.map((customer) =>
          CSV_COLUMNS.map(([, field]) => csvValue(customer[field])).join(delimiter)
        ),
      ].join('\n');
      const suffix = [filenameDate(dateFrom), filenameDate(dateTo)].filter(Boolean).join('_');
      const filename = suffix ? `customers_${suffix}.csv` : 'customers.csv';

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(`\uFEFF${csv}`);
      return;
    }

    const stats = await getCustomerStats(filters);
    res.status(200).json({ ok: true, customers, stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Customers read failed', message: error.message });
  }
};
