import { useState, useEffect } from 'react';
import { api } from '../api';

export default function RegionPicker({ value, onSelect }) {
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getRegions()
      .then((data) => {
        setRegions(Array.isArray(data) ? data : data.regions || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load regions:', err);
        setError('Failed to load regions');
        setLoading(false);
      });
  }, []);

  if (error) return <span className="region-error">{error}</span>;

  return (
    <select
      className="region-picker"
      value={value ?? ''}
      onChange={(e) => onSelect(e.target.value || null)}
      disabled={loading}
    >
      <option value="">{loading ? 'Loading...' : 'All Regions'}</option>
      {regions.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
