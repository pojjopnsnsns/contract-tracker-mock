import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import SummaryStrip from './SummaryStrip.jsx';
import TopExpiringList from './TopExpiringList.jsx';
import CountryRankList from './CountryRankList.jsx';

const ALERT_COLORS = {
  overdue: '#ff9999',  // แดงพาสเทล (เลยกำหนด)
  critical: '#ffb380', // ส้มอมแดงพาสเทล (วิกฤต)
  urgent: '#ffc966',   // ส้มเหลืองพาสเทล (เร่งด่วน)
  warning: '#ffd666',  // เหลืองพาสเทล (เตือน)
  ok: '#79dcab',       // เขียวพาสเทล (ปกติ/เรียบร้อย)
};

const STATUS_COLORS = {
  'Upcoming renewal': '#ffd666',         // เหลืองพาสเทล (เทียบเท่า warning)
  'Negotiation in progress': '#8fb4ff',  // ฟ้าพาสเทล (ดูนุ่มนวลขึ้นจากน้ำเงินเข้มเดิม)
  'Renewed': '#79dcab',                  // เขียวพาสเทล (เทียบเท่า ok)
  'Expired/Not renewed': '#ff9999',      // แดงพาสเทล (เทียบเท่า overdue)
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

  const alertOrder = ['overdue', 'critical', 'urgent', 'warning', 'ok'];
  const alertLabels = { overdue: 'เกินกำหนด', critical: 'วิกฤต', urgent: 'เร่งด่วน', warning: 'เฝ้าระวัง', ok: 'ปกติ' };
  const alertCounts = { overdue: 0, critical: 0, urgent: 0, warning: 0, ok: 0 };
  for (const c of contracts) {
    if (alertCounts[c.alert_level] !== undefined) alertCounts[c.alert_level] += 1;
  }
  const byAlert = alertOrder.map((key) => ({ name: alertLabels[key], count: alertCounts[key], key }));

  const byCountry = countBy(contracts, 'country')
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

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

        <TopExpiringList contracts={contracts} />

        <CountryRankList data={byCountry} />
      </div>
    </div>
  );
}
