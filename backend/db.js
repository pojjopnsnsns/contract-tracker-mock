const path = require('path');
const fs = require('fs');
const { Pool, types } = require('pg');

// DATE (oid 1082): return the raw 'YYYY-MM-DD' string instead of a JS Date,
// which avoids local-timezone day-shift bugs when it round-trips through dayjs.
types.setTypeParser(1082, (val) => val);
// Keep PostgreSQL NUMERIC as strings to preserve decimal precision.

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'contract_tracker',
});

async function initSchema() {
  const client = await pool.connect();
  try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(71000)');
  await client.query(`
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
    -- Baseline backfill is handled once by a versioned migration.

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
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const migrationsPath = path.join(__dirname, 'migrations');
  for (const name of fs.readdirSync(migrationsPath).filter(n=>n.endsWith('.sql')).sort()) {
    const {rows} = await client.query('SELECT name FROM schema_migrations WHERE name=$1',[name]);
    if (rows.length) continue;
    await client.query(fs.readFileSync(path.join(migrationsPath,name),'utf8'));
    await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
  }
  await client.query('COMMIT');
  } catch(err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
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
    await client.query('SELECT pg_advisory_xact_lock(71001)');
    const count = await client.query('SELECT COUNT(*)::int AS c FROM contracts');
    if (count.rows[0].c > 0) { await client.query('COMMIT'); return; }
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
