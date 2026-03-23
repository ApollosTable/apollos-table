import { useState, useMemo } from 'react';
import { api } from '../api';

export default function BatchActions({ businesses, onRefresh }) {
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const discovered = useMemo(
    () => (businesses || []).filter((b) => b.pipeline_stage === 'discovered'),
    [businesses],
  );
  const needReport = useMemo(
    () => (businesses || []).filter((b) => b.pipeline_stage === 'scanned'),
    [businesses],
  );
  const drafts = useMemo(
    () => (businesses || []).filter((b) => b.pipeline_stage === 'report_draft'),
    [businesses],
  );

  async function handleScanAll() {
    if (!discovered.length) return;
    setScanning(true);
    try {
      await api.scanBatch(discovered.map((b) => b.id));
      onRefresh();
    } catch (err) {
      console.error('Scan batch failed:', err);
    } finally {
      setScanning(false);
    }
  }

  async function handleGenerateReports() {
    if (!needReport.length) return;
    setGenerating(true);
    try {
      await api.generateReportsBatch(needReport.map((b) => b.id));
      onRefresh();
    } catch (err) {
      console.error('Generate reports batch failed:', err);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublishAll() {
    if (!drafts.length) return;
    setPublishing(true);
    try {
      await Promise.all(drafts.map((b) => api.publishReport(b.id)));
      onRefresh();
    } catch (err) {
      console.error('Publish all failed:', err);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="batch-actions">
      <button
        className="batch-btn"
        disabled={!discovered.length || scanning}
        onClick={handleScanAll}
      >
        {scanning ? 'Scanning...' : `Scan All (${discovered.length})`}
      </button>
      <button
        className="batch-btn"
        disabled={!needReport.length || generating}
        onClick={handleGenerateReports}
      >
        {generating ? 'Generating...' : `Generate Reports (${needReport.length})`}
      </button>
      <button
        className="batch-btn"
        disabled={!drafts.length || publishing}
        onClick={handlePublishAll}
      >
        {publishing ? 'Publishing...' : `Publish All (${drafts.length})`}
      </button>
    </div>
  );
}
