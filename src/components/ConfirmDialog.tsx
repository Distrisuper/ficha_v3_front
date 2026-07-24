import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // botón de confirmar en rojo (borrados)
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Modal de confirmación reutilizable. Overlay que cierra al clickear afuera o Cancelar.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div
      onClick={onCancel}
      role="presentation"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420,
          boxShadow: '0 20px 50px rgba(15,23,42,.25)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 8px' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
          {message && <div style={{ marginTop: 8, fontSize: 14, color: 'var(--muted)', lineHeight: 1.45 }}>{message}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 22px 20px' }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              height: 40, padding: '0 16px', borderRadius: 8, border: '1px solid var(--border-2)',
              background: '#fff', color: 'var(--muted)', fontWeight: 600, fontSize: 14,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              height: 40, padding: '0 18px', borderRadius: 8, border: 'none',
              background: danger ? 'var(--err)' : 'var(--ok)', color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
