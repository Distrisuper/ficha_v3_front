interface Props {
  title: string;
  subtitle: string;
  userLabel: string;
}

export function Header({ title, subtitle, userLabel }: Props) {
  return (
    <header
      style={{
        height: 62,
        flex: 'none',
        background: '#fff',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 30px',
      }}
    >
      <div>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '.2px', color: 'var(--navy)' }}>{title}</div>
        <div style={{ fontSize: 11, letterSpacing: '.5px', color: 'var(--muted-3)', fontWeight: 700, marginTop: 1 }}>
          {subtitle}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#3a4352' }}>
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
