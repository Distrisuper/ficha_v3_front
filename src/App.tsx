import { useMemo, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { Login } from './components/Login';
import { Sidebar, type TabKey } from './components/Sidebar';
import { Header } from './components/Header';
import { FiltersBar } from './components/FiltersBar';
import { TipoCompBar } from './components/TipoCompBar';
import { NuevoPage } from './pages/NuevoPage';
import { PendientesPage } from './pages/PendientesPage';
import { HistorialPage } from './pages/HistorialPage';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { PENDIENTES_ESTADOS } from './utils/estados';
import type { RemitoTipo } from './types/api';
import { useSessionBoolean } from './hooks/useSessionState';

function Shell() {
  const { auth } = useAuth();
  const { remitos, filters, setFilters } = useData();
  const [tab, setTab] = useState<TabKey>('nuevo');
  const [collapsed, setCollapsed] = useSessionBoolean('ficha_sidebar_collapsed', false);
  const [tipoComp, setTipoComp] = useState<RemitoTipo>('factura');

  const pendCount = useMemo(() => remitos.filter((r) => PENDIENTES_ESTADOS.has(r.estado)).length, [remitos]);
  const userLabel = auth?.rol ? auth.rol : auth?.id ? auth.id.slice(0, 8) : 'Usuario';

  const headerLeft =
    tab === 'nuevo' ? (
      <TipoCompBar value={tipoComp} onChange={setTipoComp} />
    ) : tab === 'pendientes' || tab === 'historial' ? (
      <FiltersBar value={filters} onChange={setFilters} />
    ) : null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar tab={tab} onChange={setTab} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} pendCount={pendCount} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Header userLabel={userLabel} left={headerLeft} />
        <div className="ds-scroll" style={{ flex: 1, overflow: 'auto', padding: '26px 30px' }}>
          {tab === 'nuevo' && <NuevoPage tipoComp={tipoComp} />}
          {tab === 'pendientes' && <PendientesPage filters={filters} />}
          {tab === 'historial' && <HistorialPage filters={filters} />}
          {tab === 'config' && <ConfiguracionPage />}
        </div>
      </main>
    </div>
  );
}

function Gate() {
  const { auth } = useAuth();
  if (!auth) return <Login />;
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;
