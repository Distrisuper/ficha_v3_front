import { useMemo, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { Login } from './components/Login';
import { Sidebar, type TabKey } from './components/Sidebar';
import { Header } from './components/Header';
import { NuevoPage } from './pages/NuevoPage';
import { PendientesPage } from './pages/PendientesPage';
import { HistorialPage } from './pages/HistorialPage';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { PENDIENTES_ESTADOS } from './utils/estados';
import { useSessionBoolean } from './hooks/useSessionState';

const TITLES: Record<TabKey, [string, string]> = {
  nuevo: ['Ficha', 'CARGA DE COMPROBANTES · V3'],
  pendientes: ['Remitos Pendientes', 'GESTIÓN DE STOCK · V3'],
  historial: ['Historial de Registros', 'REGISTROS PROCESADOS'],
  config: ['Configuración', 'AJUSTES DEL SISTEMA · V3'],
};

function Shell() {
  const { auth } = useAuth();
  const { remitos } = useData();
  const [tab, setTab] = useState<TabKey>('nuevo');
  const [collapsed, setCollapsed] = useSessionBoolean('ficha_sidebar_collapsed', false);
  const [focusRemitoId, setFocusRemitoId] = useState<string | null>(null);

  const pendCount = useMemo(() => remitos.filter((r) => PENDIENTES_ESTADOS.has(r.estado)).length, [remitos]);
  const [title, subtitle] = TITLES[tab];
  const userLabel = auth?.rol ? auth.rol : auth?.id ? auth.id.slice(0, 8) : 'Usuario';

  // Ir a Pendientes enfocando (scroll + highlight) un remito puntual.
  const goToPendientes = (remitoId?: string) => {
    setFocusRemitoId(remitoId ?? null);
    setTab('pendientes');
  };

  // Cambio de pestaña desde el sidebar: sin foco puntual.
  const goToTab = (t: TabKey) => {
    setFocusRemitoId(null);
    setTab(t);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar tab={tab} onChange={goToTab} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} pendCount={pendCount} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Header title={title} subtitle={subtitle} userLabel={userLabel} />
        <div className="ds-scroll" style={{ flex: 1, overflow: 'auto', padding: '26px 30px' }}>
          {tab === 'nuevo' && <NuevoPage onGoToPendientes={goToPendientes} />}
          {tab === 'pendientes' && <PendientesPage focusId={focusRemitoId} onFocusHandled={() => setFocusRemitoId(null)} />}
          {tab === 'historial' && <HistorialPage />}
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
