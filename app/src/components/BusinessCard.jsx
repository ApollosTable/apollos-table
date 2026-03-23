const GRADE_COLORS = {
  A: '#3ecf6e',
  B: '#7bc87b',
  C: '#e8a832',
  D: '#e07840',
  F: '#e05252',
};

export default function BusinessCard({ business, onSelect }) {
  const grade = business.grade || '—';
  const color = GRADE_COLORS[grade] || '#555';

  return (
    <div
      className="business-card"
      style={{ borderLeftColor: color }}
      onClick={() => onSelect(business)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(business);
      }}
    >
      <div className="bc-header">
        <span className="bc-name">{business.name}</span>
        <span className="bc-grade" style={{ color }}>
          {grade}
        </span>
      </div>
      <div className="bc-meta">
        {business.category && <span className="bc-category">{business.category}</span>}
        {business.city && <span className="bc-city">{business.city}</span>}
      </div>
      {business.score != null && (
        <div className="bc-score">Score: {business.score}</div>
      )}
    </div>
  );
}
