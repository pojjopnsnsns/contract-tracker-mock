import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import SummaryStrip from './SummaryStrip.jsx';
import TopExpiringList from './TopExpiringList.jsx';
import CountryRankList from './CountryRankList.jsx';

const ALERT_COLORS = {
  overdue: 'var(--alert-overdue, #7e22ce)',
  critical: 'var(--alert-critical, #c62828)',
  urgent: 'var(--alert-urgent, #b85c00)',
  warning: 'var(--alert-warning, #0369a1)',
  ok: 'var(--alert-ok, #15803d)',
};

const STATUS_COLORS = {
  'Upcoming renewal': '#a16207',
  'Negotiation in progress': '#2563eb',
  'Renewed': '#15803d',
  'Expired/Not renewed': '#c62828',
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
  const alertLabels = { overdue: 'เกินกำหนด', critical: 'เร่งดำเนินการ', urgent: 'เร่งด่วน', warning: 'ใกล้ครบกำหนด', ok: 'ปกติ' };
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
          <ResponsiveContainer width="100%" height={310}>
            <BarChart data={byStatus} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: '#e8eef8', fillOpacity: 0.6 }}
                contentStyle={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, color: '#18243b' }}
                itemStyle={{ color: '#18243b' }}
                formatter={(value) => [`${Number(value).toLocaleString()} สัญญา`, 'จำนวน']}
              />
              <Bar dataKey="count" name="จำนวนสัญญา" radius={[6, 6, 0, 0]} maxBarSize={100}>
                {byStatus.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#6c5dd3'} />
                ))}
                <LabelList dataKey="count" position="top" fill="#334155" fontSize={12} formatter={(value) => Number(value).toLocaleString()} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3 className="chart-card__title">จำนวนสัญญาตามระดับการแจ้งเตือน</h3>
          <ResponsiveContainer width="100%" height={310}>
            <BarChart data={byAlert} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe3ef" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: '#e8eef8', fillOpacity: 0.6 }}
                contentStyle={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, color: '#18243b' }}
                itemStyle={{ color: '#18243b' }}
                formatter={(value) => [`${Number(value).toLocaleString()} สัญญา`, 'จำนวน']}
              />
              <Bar dataKey="count" name="จำนวนสัญญา" radius={[6, 6, 0, 0]} maxBarSize={100}>
                {byAlert.map((entry) => (
                  <Cell key={entry.key} fill={ALERT_COLORS[entry.key]} />
                ))}
                <LabelList dataKey="count" position="top" fill="#334155" fontSize={12} formatter={(value) => Number(value).toLocaleString()} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ul className="chart-legend" aria-label="สีระดับการแจ้งเตือน">
            {byAlert.map((entry) => (
              <li key={entry.key}>
                <span className="chart-legend__dot" style={{ background: ALERT_COLORS[entry.key] }} aria-hidden="true" />
                {entry.name}
              </li>
            ))}
          </ul>
        </div>

        <TopExpiringList contracts={contracts} />

        <CountryRankList data={byCountry} />
      </div>

    </div>
  );
}
