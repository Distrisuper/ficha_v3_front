import { useState, type CSSProperties } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { proveedoresApi } from '../api/proveedores';
import { sucursalesApi } from '../api/sucursales';
import type { Proveedor, Sucursal } from '../types/api';

type ListKey = 'proveedores' | 'sucursales';

export function ConfiguracionPage() {
  const { auth, logout } = useAuth();
  const { proveedores, sucursales, reloadCatalogos, clearSucursal, sucursalId } = useData();

  const [provDraft, setProvDraft] = useState('');
  const [sucDraft, setSucDraft] = useState('');
  const [editKey, setEditKey] = useState<string | null>(null); // "proveedores:<id>" | "sucursales:<id>"
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function add(listKey: ListKey, value: string) {
    const val = value.trim();
    if (!val) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (listKey === 'proveedores') await proveedoresApi.create(val);
      else await sucursalesApi.create(val);
      if (listKey === 'proveedores') setProvDraft('');
      else setSucDraft('');
      await reloadCatalogos();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editKey) return;
    const [listKey, id] = editKey.split(':') as [ListKey, string];
    const val = editValue.trim();
    setBusy(true);
    setErrorMsg(null);
    try {
      if (val) {
        if (listKey === 'proveedores') await proveedoresApi.update(id, val);
        else await sucursalesApi.update(id, val);
      }
      setEditKey(null);
      setEditValue('');
      await reloadCatalogos();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  async function del(listKey: ListKey, id: string) {
    setBusy(true);
    setErrorMsg(null);
    try {
      if (listKey === 'proveedores') await proveedoresApi.remove(id);
      else {
        await sucursalesApi.remove(id);
        if (id === sucursalId) clearSucursal();
      }
      await reloadCatalogos();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo eliminar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 1060, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <section style={{ ...cardStyle, flex: 1, minWidth: 320, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={avatarStyle}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.5px', color: 'var(--muted-3)' }}>USUARIO</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--navy)' }}>{auth?.id?.slice(0, 8) ?? '—'}</div>
            <div style={{ fontSize: 13, color: 'var(--muted-2)', marginTop: 1 }}>{auth?.rol ?? 'Sin rol asignado'}</div>
          </div>
          <button
            onClick={logout}
            style={{
              height: 40,
              padding: '0 18px',
              borderRadius: 9,
              border: '1px solid #f0c6c6',
              background: '#fff',
              color: 'var(--err)',
              fontWeight: 700,
              fontSize: '13.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Cerrar sesión
          </button>
        </section>
        <section style={{ ...cardStyle, flex: 1, minWidth: 320, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ ...avatarStyle, borderRadius: 12, background: 'var(--navy)', color: '#fff', fontWeight: 800, fontSize: 22, fontStyle: 'italic' }}>
            E
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.5px', color: 'var(--muted-3)' }}>EMPRESA</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--navy)' }}>{auth?.company_id ?? '—'}</div>
            <div style={{ fontSize: 13, color: 'var(--muted-2)', marginTop: 1 }}>ID de empresa (token JWT)</div>
          </div>
        </section>
      </div>

      {errorMsg && (
        <div style={{ background: 'var(--err-weak)', color: 'var(--err)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{errorMsg}</div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <CrudSection
          title="Proveedores"
          items={proveedores}
          draft={provDraft}
          onDraftChange={setProvDraft}
          onAdd={() => add('proveedores', provDraft)}
          editKey={editKey}
          editValue={editValue}
          onEditValueChange={setEditValue}
          onStartEdit={(id, name) => {
            setEditKey('proveedores:' + id);
            setEditValue(name);
          }}
          onSaveEdit={saveEdit}
          onCancelEdit={() => {
            setEditKey(null);
            setEditValue('');
          }}
          onDelete={(id) => del('proveedores', id)}
          listKey="proveedores"
          busy={busy}
          placeholder="Nuevo proveedor…"
        />
        <CrudSection
          title="Sucursales"
          items={sucursales}
          draft={sucDraft}
          onDraftChange={setSucDraft}
          onAdd={() => add('sucursales', sucDraft)}
          editKey={editKey}
          editValue={editValue}
          onEditValueChange={setEditValue}
          onStartEdit={(id, name) => {
            setEditKey('sucursales:' + id);
            setEditValue(name);
          }}
          onSaveEdit={saveEdit}
          onCancelEdit={() => {
            setEditKey(null);
            setEditValue('');
          }}
          onDelete={(id) => del('sucursales', id)}
          listKey="sucursales"
          busy={busy}
          placeholder="Nueva sucursal…"
        />
      </div>
    </div>
  );
}

interface CrudSectionProps {
  title: string;
  items: (Proveedor | Sucursal)[];
  draft: string;
  onDraftChange: (v: string) => void;
  onAdd: () => void;
  editKey: string | null;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onStartEdit: (id: string, name: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  listKey: ListKey;
  busy: boolean;
  placeholder: string;
}

function CrudSection({
  title,
  items,
  draft,
  onDraftChange,
  onAdd,
  editKey,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  listKey,
  busy,
  placeholder,
}: CrudSectionProps) {
  return (
    <section style={{ flex: 1, minWidth: 400, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef1f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{title}</div>
        <span style={{ background: 'var(--blue-weak)', color: 'var(--blue)', fontSize: 12, fontWeight: 800, borderRadius: 999, minWidth: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
          {items.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.length === 0 && <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--muted-3)' }}>Sin registros.</div>}
        {items.map((it) => {
          const key = `${listKey}:${it.id}`;
          const editing = editKey === key;
          return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', borderBottom: '1px solid #f4f6fa' }}>
              {editing ? (
                <>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => onEditValueChange(e.target.value)}
                    style={{ flex: 1, height: 38, border: '1px solid var(--blue)', borderRadius: 8, padding: '0 12px', fontSize: 14, color: 'var(--ink)', outline: 'none' }}
                  />
                  <button onClick={onSaveEdit} disabled={busy} style={saveBtn}>
                    Guardar
                  </button>
                  <button onClick={onCancelEdit} style={cancelBtn}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '14.5px', color: 'var(--ink-2)', fontWeight: 500 }}>{it.nombre}</span>
                  <button onClick={() => onStartEdit(it.id, it.nombre)} title="Editar" style={iconBtn}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button onClick={() => onDelete(it.id)} title="Eliminar" style={{ ...iconBtn, border: '1px solid #f0d3d3', color: 'var(--err)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #eef1f6' }}>
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          style={{ flex: 1, height: 40, border: '1px solid var(--border-2)', borderRadius: 8, padding: '0 13px', fontSize: 14, color: 'var(--ink)', outline: 'none' }}
        />
        <button onClick={onAdd} disabled={busy} style={addBtn}>
          Agregar
        </button>
      </div>
    </section>
  );
}

const cardStyle: CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 22 };
const avatarStyle: CSSProperties = {
  width: 54,
  height: 54,
  flex: 'none',
  borderRadius: '50%',
  background: 'var(--blue-weak)',
  color: 'var(--blue)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const iconBtn: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: '1px solid #e0e4ec',
  background: '#fff',
  color: 'var(--muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
const saveBtn: CSSProperties = { height: 38, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const cancelBtn: CSSProperties = { height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-2)', background: '#fff', color: 'var(--muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const addBtn: CSSProperties = { height: 40, padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
