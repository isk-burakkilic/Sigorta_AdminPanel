import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import Panel from './pages/Panel.jsx';
import { Toaster } from './lib/toast.jsx';
import { auth } from './lib/api.js';

// Guards the /panel route: checks the session with the backend.
function RequireAuth({ children }) {
  const [state, setState] = useState('checking'); // checking | ok | no
  const loc = useLocation();
  useEffect(() => {
    let alive = true;
    auth.session().then((s) => alive && setState(s.authenticated ? 'ok' : 'no')).catch(() => alive && setState('no'));
    return () => { alive = false; };
  }, [loc.pathname]);

  if (state === 'checking') {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: 'var(--muted)' }}>Yükleniyor…</div>;
  }
  if (state === 'no') return <Navigate to="/giris" replace state={{ from: loc.pathname }} />;
  return children;
}

// Zenith Peak is login + agency panel only — the public marketing site was removed.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/giris" element={<Login />} />
        <Route path="/panel" element={<RequireAuth><Panel /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/giris" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
