import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

function gradeColor(grade) {
  if (!grade) return '#555';
  if (grade === 'A' || grade === 'A+') return '#00e676';
  if (grade === 'B') return '#66bb6a';
  if (grade === 'C') return '#ffa726';
  if (grade === 'D') return '#ef5350';
  return '#e05252';
}

export default function Onboarding() {
  const [warmLeads, setWarmLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scopes, setScopes] = useState({});
  const [scopeLoading, setScopeLoading] = useState({});
  const [convertLoading, setConvertLoading] = useState({});

  const loadData = useCallback(async () => {
    try {
      const data = await api.getOnboarding();
      setWarmLeads(data.warmLeads || []);
      setClients(data.clients || []);
    } catch (err) {
      console.error('Failed to load onboarding data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateScope = useCallback(async (businessId) => {
    setScopeLoading((prev) => ({ ...prev, [businessId]: true }));
    try {
      const scope = await api.generateScope(businessId);
      setScopes((prev) => ({ ...prev, [businessId]: scope }));
    } catch (err) {
      console.error('Scope generation failed:', err);
    } finally {
      setScopeLoading((prev) => ({ ...prev, [businessId]: false }));
    }
  }, []);

  const handleConvert = useCallback(async (biz) => {
    const scope = scopes[biz.id];
    if (!scope) return;

    const stripeLink = prompt('Stripe payment link (optional — leave blank to skip):');

    setConvertLoading((prev) => ({ ...prev, [biz.id]: true }));
    try {
      await api.convertToClient(biz.id, {
        tier: scope.tier,
        scope: scope.items,
        price: scope.total_price,
        stripeLink: stripeLink || null,
        monthlyRate: null,
      });
      await loadData();
      setScopes((prev) => {
        const next = { ...prev };
        delete next[biz.id];
        return next;
      });
    } catch (err) {
      console.error('Conversion failed:', err);
    } finally {
      setConvertLoading((prev) => ({ ...prev, [biz.id]: false }));
    }
  }, [scopes, loadData]);

  if (loading) {
    return <div className="app-loading">Loading onboarding...</div>;
  }

  return (
    <div className="onboarding">
      {/* Warm Leads */}
      <div className="onboarding-section">
        <h2 className="onboarding-section-title">
          Warm Leads
          <span className="onboarding-count">{warmLeads.length}</span>
        </h2>

        {warmLeads.length === 0 && (
          <div className="onboarding-empty">No warm leads yet. Move prospects from the pipeline to see them here.</div>
        )}

        <div className="onboarding-leads">
          {warmLeads.map((biz) => {
            const scope = scopes[biz.id];
            const isGenerating = scopeLoading[biz.id];
            const isConverting = convertLoading[biz.id];

            return (
              <div key={biz.id} className="lead-card">
                <div className="lead-header">
                  <div className="lead-info">
                    <span className="lead-name">{biz.name}</span>
                    <span className="lead-meta">
                      {biz.category && <span>{biz.category}</span>}
                      {biz.city && <span>{biz.city}</span>}
                    </span>
                  </div>
                  <div className="lead-score">
                    <span className="lead-grade" style={{ color: gradeColor(biz.grade) }}>
                      {biz.grade || '—'}
                    </span>
                    {biz.score != null && (
                      <span className="lead-score-num">{biz.score}/100</span>
                    )}
                  </div>
                </div>

                {!scope && (
                  <button
                    className="action-btn"
                    onClick={() => handleGenerateScope(biz.id)}
                    disabled={isGenerating}
                  >
                    {isGenerating ? 'Generating...' : 'Generate Scope'}
                  </button>
                )}

                {scope && (
                  <div className="scope-panel">
                    <div className="scope-header">
                      <span className="scope-tier">{scope.tier === 'rebuild' ? 'REBUILD' : 'FIX'}</span>
                      <span className="scope-total">${scope.total_price}</span>
                    </div>
                    <ul className="scope-items">
                      {scope.items.map((item, i) => (
                        <li key={i} className="scope-item">
                          <span className="scope-item-desc">{item.description}</span>
                          <span className="scope-item-price">${item.price}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      className="action-btn convert-btn"
                      onClick={() => handleConvert(biz)}
                      disabled={isConverting}
                    >
                      {isConverting ? 'Converting...' : 'Convert to Client'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Clients */}
      <div className="onboarding-section">
        <h2 className="onboarding-section-title">
          Active Clients
          <span className="onboarding-count">{clients.length}</span>
        </h2>

        {clients.length === 0 && (
          <div className="onboarding-empty">No clients yet. Convert a warm lead to get started.</div>
        )}

        <div className="onboarding-clients">
          {clients.map((c) => (
            <div key={c.id} className="client-card">
              <span className="client-name">{c.business_name || c.contact_name}</span>
              <span className="client-status">{c.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
