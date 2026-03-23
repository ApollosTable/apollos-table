import { useState, useEffect } from 'react';
import { api } from './api';

export default function App() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error);
  }, []);

  return (
    <div className="app">
      <nav className="top-nav">
        <div className="nav-brand">Operations</div>
      </nav>
      <main>
        {stats ? (
          <div className="stats-bar">
            <div>Discovered: {stats.total}</div>
            <div>Scanned: {stats.scanned}</div>
            <div>Reports: {stats.reported}</div>
          </div>
        ) : (
          <div>Loading...</div>
        )}
        <p>Dashboard components coming in next task...</p>
      </main>
    </div>
  );
}
