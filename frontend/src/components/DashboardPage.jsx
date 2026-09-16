import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import SummaryStrip from './SummaryStrip.jsx';

const ALERT_COLORS = {
  overdue: '#ff5b5b',
  critical: '#ff7d33',
  warning: '#ffa412',
  ok: '#37c17e',
};

const STATUS_COLORS = {
  'Upcoming renewal': '#ffa412',
  'Negotiation in progress': '#4b7bec',
  'Renewed': '#37c17e',
  'Expired/Not renewed': '#ff5b5b',
};

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item[key] || 'ไม่ระบุ';
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}

export default function DashboardPage({ contracts, onCardClick }) {
  const byStatus = countBy(contracts, 'status');

  const alertOrder = ['overdue', 'critical', 'warning', 'ok'];
  const alertLabels = { overdue: 'เกินกำหนด', critical: 'วิกฤต', warning: 'เฝ้าระวัง', ok: 'ปกติ' };
  const alertCounts = { overdue: 0, critical: 0, warning: 0, ok: 0 };
  for (const c of contracts) {
    if (alertCounts[c.alert_level] !== undefined) alertCounts[c.alert_level] += 1;
  }
  const byAlert = alertOrder.map((key) => ({ name: alertLabels[key], count: alertCounts[key], key }));

  const byCountry = countBy(contracts, 'country')
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="dashboard-page">
      <SummaryStrip contracts={contracts} onCardClick={onCardClick} />

      <div className="chart-grid">
        <div className="chart-card">
          <h3 className="chart-card__title">จำนวนสัญญาตามสถานะ</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byStatus} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eceefa" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {byStatus.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#6c5dd3'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3 className="chart-card__title">จำนวนสัญญาตามระดับการแจ้งเตือน</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byAlert} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eceefa" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {byAlert.map((entry) => (
                  <Cell key={entry.key} fill={ALERT_COLORS[entry.key]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card chart-card--wide">
          <h3 className="chart-card__title">จำนวนสัญญาตามประเทศ (สูงสุด 8 อันดับ)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byCountry} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eceefa" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
              <Tooltip />
              <Bar dataKey="count" fill="#6c5dd3" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
