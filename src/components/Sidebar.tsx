import type { CSSProperties, ReactElement } from 'react';

export type TabKey = 'nuevo' | 'pendientes' | 'historial' | 'config';

interface Props {
  tab: TabKey;
  onChange: (t: TabKey) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  pendCount: number;
}

const NAV_ITEMS: { key: TabKey; label: string; icon: ReactElement }[] = [
  {
    key: 'nuevo',
    label: 'Cargar comprobantes',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </svg>
    ),
  },
  {
    key: 'pendientes',
    label: 'Comprobantes pendientes',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8l-9-5-9 5v8l9 5 9-5Z" />
        <path d="M3.3 7 12 12l8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
  },
  {
    key: 'historial',
    label: 'Historial de comprobantes',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    key: 'config',
    label: 'Configuración',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    ),
  },
];

export function Sidebar({ tab, onChange, collapsed, onToggleCollapsed, pendCount }: Props) {
  const asideStyle: CSSProperties = {
    width: collapsed ? 64 : 188,
    flex: 'none',
    background: '#ffffff',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    padding: 0,
    transition: 'width .18s ease',
  };

  const brandBarStyle: CSSProperties = {
    height: 62,
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: collapsed ? '0' : '0 16px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderBottom: '1px solid #eef1f6',
    position: 'relative',
  };

  return (
    <aside style={asideStyle}>
      <div style={brandBarStyle}>
        <div
          onClick={onToggleCollapsed}
          title="Contraer / expandir"
          style={{
            width: 30,
            height: 30,
            flex: 'none',
            borderRadius: 7,
            background: 'var(--navy)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 16,
            fontStyle: 'italic',
            cursor: 'pointer',
          }}
        >
          F
        </div>
        {!collapsed && (
          <div style={{ lineHeight: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '.2px', color: 'var(--navy)' }}>FICHA</div>
            <div style={{ fontSize: '7.5px', letterSpacing: 2, color: 'var(--muted-2)', marginTop: 2 }}>AOKI</div>
          </div>
        )}
        {!collapsed && (
          <span style={{ fontSize: 12, color: '#0C6292', fontWeight: 700, marginLeft: 4 }}>v.3</span>
        )}
        {!collapsed && (
          <button
            onClick={onToggleCollapsed}
            title="Contraer"
            style={{
              display: 'flex',
              marginLeft: 'auto',
              width: 24,
              height: 24,
              flex: 'none',
              borderRadius: 6,
              border: '1px solid #e0e4ec',
              background: '#fff',
              color: 'var(--muted-2)',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        )}
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '18px 12px' }}>
        {NAV_ITEMS.map((item) => {
          const active = tab === item.key;
          const base: CSSProperties = collapsed
            ? {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '11px 0',
                borderRadius: 9,
                border: 'none',
                fontSize: '14.5px',
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
              }
            : {
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '11px 13px',
                borderRadius: 9,
                border: 'none',
                fontSize: '14.5px',
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
              };
          const style: CSSProperties = active
            ? { ...base, background: 'var(--blue-weak)', color: 'var(--blue)' }
            : { ...base, background: 'transparent', color: '#4a5362' };
          return (
            <button key={item.key} onClick={() => onChange(item.key)} style={style}>
              <span style={{ flex: 'none', display: 'flex' }}>{item.icon}</span>
              {!collapsed && (
                <span style={{ flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {item.label}
                  {item.key === 'pendientes' && pendCount > 0 && (
                    <span
                      style={{
                        background: 'var(--blue)',
                        color: '#fff',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        borderRadius: 999,
                        minWidth: 16,
                        height: 16,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                      }}
                    >
                      {pendCount}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
