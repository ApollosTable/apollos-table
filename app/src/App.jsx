import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import StatsBar from './components/StatsBar';
import Pipeline from './components/Pipeline';
import BatchActions from './components/BatchActions';
import RegionPicker from './components/RegionPicker';
import BusinessDetail from './components/BusinessDetail';
import './App.css';

export default function App() {
  const [stats, setStats] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [region, setRegion] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const params = region ? { region_id: region } : undefined;
      const [statsData, bizData] = await Promise.all([
        api.getStats(),
        api.getBusinesses(params),
      ]);
      setStats(statsData);
      setBusinesses(Array.isArray(bizData) ? bizData : bizData.businesses || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    loadData();
  }, [loadData]);

  const handleSelectBusiness = useCallback((biz) => {
    setSelectedId(biz.id);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleRegionChange = useCallback((id) => {
    setRegion(id);
    setSelectedId(null);
  }, []);

  const handleDiscover = useCallback(async () => {
    setDiscovering(true);
    try {
      await api.discover(region);
      await loadData();
    } catch (err) {
      console.error('Discovery failed:', err);
    } finally {
      setDiscovering(false);
    }
  }, [region, loadData]);

  return (
    <div className="app">
      <nav className="top-nav">
        <div className="nav-brand">Operations</div>
        <RegionPicker value={region} onSelect={handleRegionChange} />
        <button
          className="btn btn-discover"
          onClick={handleDiscover}
          disabled={discovering}
        >
          {discovering ? 'Discovering...' : 'Discover Businesses'}
        </button>
      </nav>

      <StatsBar stats={stats} />
      <BatchActions businesses={businesses} onRefresh={handleRefresh} />

      {loading ? (
        <div className="app-loading">Loading pipeline...</div>
      ) : (
        <Pipeline businesses={businesses} onSelect={handleSelectBusiness} />
      )}

      {selectedId && (
        <BusinessDetail
          businessId={selectedId}
          onClose={handleCloseDetail}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}
