import { useMemo } from 'react';

const STAT_ITEMS = [
  { key: 'total', label: 'Discovered' },
  { key: 'scanned', label: 'Scanned' },
  { key: 'reported', label: 'Reports' },
  { key: 'outreachSent', label: 'Outreach Sent' },
  { key: 'responses', label: 'Responses' },
];

export default function StatsBar({ stats }) {
  const items = useMemo(
    () =>
      STAT_ITEMS.map((s) => ({
        ...s,
        value: stats ? stats[s.key] ?? 0 : '—',
      })),
    [stats],
  );

  return (
    <div className="stats-bar">
      {items.map((s) => (
        <div key={s.key} className="stat-card">
          <span className="stat-value">{s.value}</span>
          <span className="stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
