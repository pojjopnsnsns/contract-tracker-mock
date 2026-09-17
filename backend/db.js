const path = require('path');
const fs = require('fs');
const { Pool, types } = require('pg');

// DATE (oid 1082): return the raw 'YYYY-MM-DD' string instead of a JS Date,
// which avoids local-timezone day-shift bugs when it round-trips through dayjs.
types.setTypeParser(1082, (val) => val);
// NUMERIC (oid 1700): return a float instead of pg's default string, so the
// frontend can call .toLocaleString() on cost_amount directly.
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'contract_tracker',
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      service_type TEXT,
      contract_name TEXT NOT NULL,
      country TEXT,
      partner TEXT,
      customer TEXT,
      note TEXT,
      effective_date DATE,
      start_date DATE,
      end_date DATE,
      responsible_by TEXT,
      remark TEXT,
      status TEXT,
      cost_amount NUMERIC,
      cost_currency TEXT DEFAULT 'THB',
      contract_type TEXT DEFAULT 'Master',
      parent_contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
      original_end_date DATE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'Master';
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS parent_contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL;
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS original_end_date DATE;
    -- Backfill for rows that existed before this column: best guess is their
    -- current end_date, since we have no earlier record for them.
    UPDATE contracts SET original_end_date = end_date WHERE original_end_date IS NULL;

    CREATE TABLE IF NOT EXISTS notification_log (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
      channel TEXT,
      message TEXT,
      threshold_days INTEGER,
      seen BOOLEAN DEFAULT false,
      sent_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS threshold_days INTEGER;
    ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS seen BOOLEAN DEFAULT false;
  `);
}

// --- Thai month abbreviation -> month number, for parsing the mock CSV dates ---
const THAI_MONTHS = {
  'ม.ค.': '01', 'ก.พ.': '02', 'มี.ค.': '03', 'เม.ย.': '04',
  'พ.ค.': '05', 'มิ.ย.': '06', 'ก.ค.': '07', 'ส.ค.': '08',
  'ก.ย.': '09', 'ต.ค.': '10', 'พ.ย.': '11', 'ธ.ค.': '12',
};

function parseThaiDate(str) {
  if (!str) return null;
  const parts = str.trim().split('-');
  if (parts.length !== 3) return null;
  const [day, thMonth, year] = parts;
  const month = THAI_MONTHS[thMonth.trim()];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

function parseCost(str) {
  if (!str) return { amount: null, currency: 'THB' };
  const match = str.replace(/,/g, '').match(/([\d.]+)\s*([A-Za-z]+)?/);
  if (!match) return { amount: null, currency: 'THB' };
  return { amount: parseFloat(match[1]), currency: match[2] || 'THB' };
}

// Minimal CSV line parser that respects quoted fields (handles the mock file's commas-in-quotes)
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { result.push(cur); cur = ''; }
      else cur += c;
    }
  }
  result.push(cur);
  return result;
}

async function seedFromCsv(csvPath) {
  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS c FROM contracts');
  if (countRows[0].c > 0) {
    console.log(`Skipping seed - contracts table already has ${countRows[0].c} rows.`);
    return;
  }
  if (!fs.existsSync(csvPath)) {
    console.log('No seed CSV found at', csvPath, '- starting with an empty table.');
    return;
  }

  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);

  const headerIdx = lines.findIndex(l => l.startsWith('No.'));
  if (headerIdx === -1) {
    console.log('Could not find header row in CSV - skipping seed.');
    return;
  }

  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    const insertText = `
      INSERT INTO contracts
        (service_type, contract_name, country, partner, customer, note,
         effective_date, start_date, end_date, responsible_by, remark, status,
         cost_amount, cost_currency)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `;
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 14) continue;
      const [, service_type, contract_name, country, partner, customer, note,
        effective_date, start_date, end_date, responsible_by, remark, status, cost] = cols;
      const { amount, currency } = parseCost(cost);
      await client.query(insertText, [
        service_type, contract_name, country, partner, customer, note,
        parseThaiDate(effective_date), parseThaiDate(start_date), parseThaiDate(end_date),
        responsible_by, remark, status, amount, currency,
      ]);
      inserted++;
    }
    await client.query('COMMIT');
    console.log(`Seeded ${inserted} contracts from ${csvPath}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema, seedFromCsv, parseThaiDate };
