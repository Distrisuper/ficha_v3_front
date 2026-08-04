import { useMemo, useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/auth-context';
import { DataProvider } from './context/DataContext';
import { useData } from './context/data-context';
import { SseProvider } from './context/SseContext';
import { Login } from './components/Login';
import { ErrorBoundary } from './components/ErrorBoundary';
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
  const { auth, empresa, logout } = useAuth();
  const { remitos, filters, setFilters } = useData();
  const [tab, setTab] = useState<TabKey>('nuevo');
  const [collapsed, setCollapsed] = useSessionBoolean('ficha_sidebar_collapsed', false);
  const [tipoComp] = useState<RemitoTipo>('factura');

  const pendCount = useMemo(() => remitos.filter((r) => PENDIENTES_ESTADOS.has(r.estado)).length, [remitos]);
  const userLabel = auth?.nombre ?? auth?.rol ?? (auth?.id ? auth.id.slice(0, 8) : 'Usuario');

  const headerLeft =
    tab === 'nuevo' ? (
      <TipoCompBar />
    ) : tab === 'pendientes' || tab === 'historial' ? (
      <FiltersBar value={filters} onChange={setFilters} />
    ) : null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar tab={tab} onChange={setTab} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} pendCount={pendCount} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {tab !== 'nuevo' && (
          <Header userLabel={userLabel} empresaLabel={empresa?.nombre} onLogout={logout} left={headerLeft} />
        )}
        <div className="ds-scroll" style={{ flex: 1, overflow: 'auto', padding: '26px 30px' }}>
          {/*
            Una frontera POR PANTALLA, no una sola global: un throw en render
            desmonta todo el árbol, y sin router el usuario quedaría en una página
            en blanco sin forma de navegar. Acotándola por pestaña, un fallo en
            Pendientes deja la navegación y el resto de las pantallas usables.

            El `key` fuerza una instancia nueva por pestaña, así el estado de error
            no sobrevive al cambio de pantalla.
          */}
          {tab === 'nuevo' && (
            <ErrorBoundary key="nuevo" scope="Nuevo">
              <NuevoPage tipoComp={tipoComp} onGoConfig={() => setTab('config')} />
            </ErrorBoundary>
          )}
          {tab === 'pendientes' && (
            <ErrorBoundary key="pendientes" scope="Pendientes">
              <PendientesPage filters={filters} />
            </ErrorBoundary>
          )}
          {tab === 'historial' && (
            <ErrorBoundary key="historial" scope="Historial">
              <HistorialPage filters={filters} />
            </ErrorBoundary>
          )}
          {tab === 'config' && (
            <ErrorBoundary key="config" scope="Configuración">
              <ConfiguracionPage />
            </ErrorBoundary>
          )}
        </div>
      </main>
    </div>
  );
}

function Gate() {
  const { auth } = useAuth();
  if (!auth) return <Login />;
  // SseProvider adentro del Gate: la conexión nace con la sesión y muere con el
  // logout, sin que ninguna pantalla tenga que abrirla o cerrarla. Va por fuera
  // de Shell para que sobreviva a los cambios de pestaña — que es todo el punto
  // de haber pasado a un stream global.
  return (
    <SseProvider>
      <DataProvider>
        <Shell />
      </DataProvider>
    </SseProvider>
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
