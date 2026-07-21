import type { ReactNode } from 'react';

interface Props {
  userLabel: string;
  left?: ReactNode;
}

export function Header({ userLabel, left }: Props) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#3a4352', flex: 'none' }}>
        <span
          style={{
            width: 26,
            height: 26,
            flex: 'none',
            borderRadius: '50%',
            background: 'var(--blue-weak)',
            color: 'var(--blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{userLabel}</span>
      </div>
    </header>
  );
}
