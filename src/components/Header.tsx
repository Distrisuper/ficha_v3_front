import { useState, type CSSProperties, type ReactNode } from 'react';

interface Props {
  userLabel: string;
  empresaLabel?: string | null;
  onLogout: () => void;
  left?: ReactNode;
}

export function Header({ userLabel, empresaLabel, onLogout, left }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header
      style={{
        minHeight: 62,
        flex: 'none',
        background: '#fff',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
        padding: '10px 30px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{left}</div>
      <div style={{ position: 'relative', flex: 'none' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            color: '#3a4352',
            background: open ? 'var(--blue-weak)' : 'transparent',
            border: `1px solid ${open ? 'var(--blue-weak)' : 'transparent'}`,
            borderRadius: 10,
            padding: '5px 10px',
            cursor: 'pointer',
          }}
        >
          <span style={avatarStyle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{userLabel}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.55, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                zIndex: 21,
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 12,
                boxShadow: '0 12px 34px rgba(16,24,40,.14)',
                minWidth: 232,
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ ...avatarStyle, width: 34, height: 34 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userLabel}</div>
                  {empresaLabel && (
                    <div style={{ fontSize: 12, color: 'var(--muted-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{empresaLabel}</div>
                  )}
                </div>
              </div>

              <div style={{ height: 1, background: '#eef1f6', margin: '12px 0' }} />

              <div style={{ fontSize: 13, color: 'var(--muted-2)', marginBottom: 11 }}>¿Querés cerrar tu sesión?</div>
              <button
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                style={logoutBtnStyle}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

const avatarStyle: CSSProperties = {
  width: 26,
  height: 26,
  flex: 'none',
  borderRadius: '50%',
  background: 'var(--blue-weak)',
  color: 'var(--blue)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const logoutBtnStyle: CSSProperties = {
  width: '100%',
  height: 40,
  borderRadius: 9,
  border: '1px solid #f0c6c6',
  background: '#fff',
  color: 'var(--err)',
  fontWeight: 700,
  fontSize: '13.5px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};
