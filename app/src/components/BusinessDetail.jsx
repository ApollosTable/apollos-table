import { useState, useEffect } from 'react';
import { api } from '../api';

const GRADE_COLORS = {
  A: '#3ecf6e',
  B: '#7bc87b',
  C: '#e8a832',
  D: '#e07840',
  F: '#e05252',
};

const SEVERITY_COLORS = {
  critical: '#e05252',
  high: '#e07840',
  medium: '#e8a832',
  low: '#7bc87b',
  info: '#00d4ff',
};

export default function BusinessDetail({ businessId, onClose, onRefresh }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    api
      .getBusiness(businessId)
      .then((data) => {
        setDetail(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [businessId]);

  async function runAction(action) {
    setActionLoading(true);
    try {
      switch (action) {
        case 'scan':
          await api.scanBusiness(businessId);
          break;
        case 'report':
          await api.generateReport(businessId);
          break;
        case 'publish':
          await api.publishReport(businessId);
          break;
        case 'outreach':
          await api.draftOutreach(businessId);
          break;
      }
      // Refresh detail
      const updated = await api.getBusiness(businessId);
      setDetail(updated);
      onRefresh();
    } catch (err) {
      console.error(`Action "${action}" failed:`, err);
    } finally {
      setActionLoading(false);
    }
  }

  if (!businessId) return null;

  const stage = detail?.pipeline_stage;
  const grade = detail?.grade;
  const gradeColor = GRADE_COLORS[grade] || '#555';
  const scan = detail?.scan_results || detail?.scanResults;
  const findings = scan?.findings || [];
  const report = detail?.report_narrative || detail?.reportNarrative;

  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <div className="detail-panel">
        <button className="detail-close" onClick={onClose}>
          &times;
        </button>

        {loading && <div className="detail-loading">Loading...</div>}
        {error && <div className="detail-error">{error}</div>}

        {detail && !loading && (
          <>
            <h2 className="detail-name">{detail.name}</h2>

            <div className="detail-fields">
              {detail.url && (
                <div className="detail-field">
                  <span className="df-label">URL</span>
                  <a href={detail.url} target="_blank" rel="noopener noreferrer" className="df-link">
                    {detail.url}
                  </a>
                </div>
              )}
              {detail.category && (
                <div className="detail-field">
                  <span className="df-label">Category</span>
                  <span>{detail.category}</span>
                </div>
              )}
              {detail.city && (
                <div className="detail-field">
                  <span className="df-label">City</span>
                  <span>{detail.city}</span>
                </div>
              )}
              <div className="detail-field">
                <span className="df-label">Stage</span>
                <span className="df-stage">{stage}</span>
              </div>
              {detail.phone && (
                <div className="detail-field">
                  <span className="df-label">Phone</span>
                  <span>{detail.phone}</span>
                </div>
              )}
              {detail.email && (
                <div className="detail-field">
                  <span className="df-label">Email</span>
                  <a href={`mailto:${detail.email}`} className="df-link">
                    {detail.email}
                  </a>
                </div>
              )}
            </div>

            {/* Scan Results */}
            {scan && (
              <div className="detail-section">
                <h3>Scan Results</h3>
                <div className="scan-summary">
                  <span className="scan-grade" style={{ color: gradeColor }}>
                    Grade: {grade}
                  </span>
                  {detail.score != null && (
                    <span className="scan-score">Score: {detail.score}</span>
                  )}
                </div>
                {findings.length > 0 && (
                  <ul className="findings-list">
                    {findings.map((f, i) => (
                      <li key={i} className="finding">
                        <span
                          className="finding-severity"
                          style={{ color: SEVERITY_COLORS[f.severity] || '#e0e0e0' }}
                        >
                          [{f.severity}]
                        </span>{' '}
                        {f.description || f.title || f.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Report Narrative */}
            {report && (
              <div className="detail-section">
                <h3>Report</h3>
                <div className="report-narrative">{report}</div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="detail-actions">
              {stage === 'discovered' && (
                <button
                  className="action-btn"
                  disabled={actionLoading}
                  onClick={() => runAction('scan')}
                >
                  {actionLoading ? 'Running...' : 'Run Scan'}
                </button>
              )}
              {stage === 'scanned' && (
                <button
                  className="action-btn"
                  disabled={actionLoading}
                  onClick={() => runAction('report')}
                >
                  {actionLoading ? 'Generating...' : 'Generate Report'}
                </button>
              )}
              {stage === 'report_draft' && (
                <button
                  className="action-btn"
                  disabled={actionLoading}
                  onClick={() => runAction('publish')}
                >
                  {actionLoading ? 'Publishing...' : 'Publish Report'}
                </button>
              )}
              {stage === 'report_published' && (
                <button
                  className="action-btn"
                  disabled={actionLoading}
                  onClick={() => runAction('outreach')}
                >
                  {actionLoading ? 'Drafting...' : 'Draft Outreach Email'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
