import { useMemo } from 'react';
import BusinessCard from './BusinessCard';

const STAGES = [
  { key: 'discovered', label: 'Discovered' },
  { key: 'scanned', label: 'Scanned' },
  { key: 'report_draft', label: 'Report Draft' },
  { key: 'report_published', label: 'Report Published' },
  { key: 'outreach_sent', label: 'Outreach Sent' },
  { key: 'follow_up', label: 'Follow Up' },
  { key: 'warm_lead', label: 'Warm Lead' },
  { key: 'cold_pool', label: 'Cold Pool' },
];

export default function Pipeline({ businesses, onSelect }) {
  const grouped = useMemo(() => {
    const map = {};
    STAGES.forEach((s) => (map[s.key] = []));
    (businesses || []).forEach((b) => {
      const stage = b.pipeline_stage || 'discovered';
      if (map[stage]) map[stage].push(b);
      else map.discovered.push(b);
    });
    return map;
  }, [businesses]);

  return (
    <div className="pipeline">
      {STAGES.map((stage) => {
        const items = grouped[stage.key];
        return (
          <div key={stage.key} className="pipeline-col">
            <div className="pipeline-col-header">
              <span className="pipeline-col-title">{stage.label}</span>
              <span className="pipeline-col-count">{items.length}</span>
            </div>
            <div className="pipeline-col-body">
              {items.map((b) => (
                <BusinessCard key={b.id} business={b} onSelect={onSelect} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
