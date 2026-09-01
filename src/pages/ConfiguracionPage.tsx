import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useAuth } from '../context/auth-context';
import { useData } from '../context/data-context';
import { proveedoresApi } from '../api/proveedores';
import { sucursalesApi } from '../api/sucursales';
import { usersApi } from '../api/users';
import { permsFor, isAdmin } from '../utils/roles';
import { cuitEsValido, formatCuit, soloDigitos } from '../utils/cuit';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { CreateProveedorInput, CreateSucursalInput, Proveedor, Sucursal } from '../types/api';

type ListKey = 'proveedores' | 'sucursales';

interface PendingDelete {
  listKey: ListKey;
  id: string;
  name: string;
}

export function ConfiguracionPage() {
  const { auth, empresa } = useAuth();
  const { proveedores, sucursales, reloadCatalogos, clearSucursal, sucursalId } = useData();
  const perms = permsFor(auth);

  const [editKey, setEditKey] = useState<string | null>(null); // "proveedores:<id>" | "sucursales:<id>"
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  // Alta de usuario (solo admin, rol 1 o 2).
  const [uEmail, setUEmail] = useState('');
  const [uNombre, setUNombre] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRol, setURol] = useState('3'); // operador por default
  const [creatingUser, setCreatingUser] = useState(false);
  const [userMsg, setUserMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uEmail.trim());
  const passwordValid = uPassword.length > 8; // más de 8 caracteres
  const canCreateUser = !creatingUser && emailValid && passwordValid && uNombre.trim() !== '';

  async function createUser() {
    if (!canCreateUser) return;
    setCreatingUser(true);
    setUserMsg(null);
    try {
      await usersApi.register({ email: uEmail.trim(), nombre: uNombre.trim(), rol: uRol, password: uPassword });
      setUserMsg({ type: 'ok', text: `Usuario ${uEmail.trim()} creado correctamente.` });
      setUEmail('');
      setUNombre('');
      setUPassword('');
      setURol('3');
    } catch (e) {
      setUserMsg({ type: 'err', text: e instanceof Error ? e.message : 'No se pudo crear el usuario' });
    } finally {
      setCreatingUser(false);
    }
  }

  /**
   * Devuelve true si el alta salió bien, para que el form sepa si limpiarse y
   * cerrarse. Mismo contrato que `addProveedor`.
   */
  async function addSucursal(input: CreateSucursalInput): Promise<boolean> {
    setBusy(true);
    setErrorMsg(null);
    try {
      await sucursalesApi.create(input);
      await reloadCatalogos();
      return true;
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo crear');
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Devuelve true si el alta salió bien, para que el form sepa si limpiarse y
   * cerrarse. Si falla (típico: 409 por CUIT repetido) los campos quedan como
   * estaban y el usuario corrige sin volver a tipear todo.
   */
  async function addProveedor(input: CreateProveedorInput): Promise<boolean> {
    setBusy(true);
    setErrorMsg(null);
    try {
      await proveedoresApi.create(input);
      await reloadCatalogos();
      return true;
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'No se pudo crear');
      return false;
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
        // El PATCH de sucursales pasó a ser parcial (acepta `nombre` y/o
        // `codigoERP`), así que el nombre va nombrado. La edición inline de la
        // lista sigue siendo sólo del nombre: el código de depósito se edita
        // desde el detalle, no con un doble click en la fila.
        else await sucursalesApi.update(id, { nombre: val });
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

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { listKey, id } = pendingDelete;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (listKey === 'proveedores') await proveedoresApi.remove(id);
      else {
        await sucursalesApi.remove(id);
        if (id === sucursalId) clearSucursal();
      }
      await reloadCatalogos();
      setPendingDelete(null);
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
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--navy)' }}>{auth?.nombre ?? '—'}</div>
          </div>
        </section>
        <section style={{ ...cardStyle, flex: 1, minWidth: 320, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ ...avatarStyle, borderRadius: 12, background: 'var(--navy)', color: '#fff', fontWeight: 800, fontSize: 22, fontStyle: 'italic' }}>
            {empresa?.nombre?.trim()?.charAt(0)?.toUpperCase() || 'E'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.5px', color: 'var(--muted-3)' }}>EMPRESA</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--navy)' }}>{empresa?.nombre ?? '—'}</div>
          </div>
        </section>
      </div>

      {errorMsg && (
        <div style={{ background: 'var(--err-weak)', color: 'var(--err)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{errorMsg}</div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <CrudSection<Proveedor>
          title="Proveedores"
          items={proveedores}
          // El alta de proveedor son 3 campos, así que en vez del input inline
          // el footer muestra un botón que despliega el form completo.
          add={{
            mode: 'form',
            renderForm: (close) => (
              <ProveedorAddForm
                busy={busy}
                onSubmit={addProveedor}
                onCancel={close}
              />
            ),
          }}
          subtitle={(p) => {
            const partes = [p.razonSocial, p.cuit ? formatCuit(p.cuit) : null].filter(Boolean);
            /**
             * El plazo se muestra SIEMPRE, incluso cuando falta.
             *
             * Un proveedor sin plazo no es un caso neutro: sus facturas se cargan
             * con 30 días inventados. Si el dato solo apareciera cuando existe, la
             * lista no diría nada sobre los que hay que completar — y completarlos
             * es justo la acción que este campo habilita.
             *
             * `!= null` y no `?`: 0 es un plazo válido (vence el mismo día) y con
             * un chequeo de verdad/falsedad se mostraría como "sin plazo".
             */
            partes.push(
              p.diasVencimiento != null
                ? `${p.diasVencimiento} días`
                : 'sin plazo (usa 30)',
            );
            return partes.length ? partes.join(' · ') : null;
          }}
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
          onRequestDelete={(id, name) => setPendingDelete({ listKey: 'proveedores', id, name })}
          listKey="proveedores"
          busy={busy}
          canAdd={perms.proveedorAdd}
          canEdit={perms.proveedorEdit}
          canDelete={perms.proveedorDelete}
        />
        <CrudSection<Sucursal>
          title="Sucursales"
          items={sucursales}
          add={{
            mode: 'form',
            renderForm: (close) => (
              <SucursalAddForm busy={busy} onSubmit={addSucursal} onCancel={close} />
            ),
          }}
          subtitle={(s) =>
            /*
              El código de depósito se muestra SIEMPRE, incluso cuando falta.
              Una sucursal sin código no ficha, y si el dato sólo apareciera
              cuando existe, la lista no diría nada sobre las que hay que
              completar — que es la acción que este campo habilita.
            */
            s.codigoERP
              ? `Depósito ERP ${s.codigoERP}`
              : 'sin código de depósito — no puede fichar'
          }
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
          onRequestDelete={(id, name) => setPendingDelete({ listKey: 'sucursales', id, name })}
          listKey="sucursales"
          busy={busy}
          canAdd={perms.sucursalAdd}
          canEdit={perms.sucursalEdit}
          canDelete={perms.sucursalDelete}
        />
      </div>

      {isAdmin(auth) && (
        <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef1f6', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>Crear usuario</div>
            <span style={{ fontSize: 12, color: 'var(--muted-3)' }}>Solo administradores</span>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ ...fieldLabel, flex: 2, minWidth: 200 }}>
                Email
                <input
                  type="email"
                  value={uEmail}
                  onChange={(e) => setUEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  autoComplete="off"
                  style={{ ...fieldInput, borderColor: uEmail !== '' && !emailValid ? 'var(--err)' : 'var(--border-2)' }}
                />
                {uEmail !== '' && !emailValid && <span style={hintErr}>Formato de email inválido</span>}
              </label>
              <label style={{ ...fieldLabel, flex: 2, minWidth: 170 }}>
                Nombre
                <input
                  type="text"
                  value={uNombre}
                  onChange={(e) => setUNombre(e.target.value)}
                  placeholder="Nombre y apellido"
                  style={fieldInput}
                />
              </label>
              <label style={{ ...fieldLabel, flex: 2, minWidth: 160 }}>
                Contraseña
                <input
                  type="password"
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value)}
                  placeholder="Más de 8 caracteres"
                  autoComplete="new-password"
                  style={{ ...fieldInput, borderColor: uPassword !== '' && !passwordValid ? 'var(--err)' : 'var(--border-2)' }}
                />
                {uPassword !== '' && !passwordValid && <span style={hintErr}>Debe tener más de 8 caracteres</span>}
              </label>
              <label style={{ ...fieldLabel, flex: 1, minWidth: 140 }}>
                Rol
                <select value={uRol} onChange={(e) => setURol(e.target.value)} style={{ ...fieldInput, cursor: 'pointer' }}>
                  <option value="3">Operador</option>
                  <option value="2">Administrador</option>
                </select>
              </label>
              <button
                onClick={createUser}
                disabled={!canCreateUser}
                style={{
                  ...addBtn,
                  flex: 'none',
                  background: canCreateUser ? 'var(--ok)' : '#c3cad6',
                  cursor: canCreateUser ? 'pointer' : 'not-allowed',
                  opacity: canCreateUser ? 1 : 0.9,
                }}
              >
                {creatingUser ? 'Creando…' : 'Crear usuario'}
              </button>
            </div>

            {userMsg && (
              <div
                style={{
                  borderRadius: 8, padding: '10px 12px', fontSize: 13,
                  background: userMsg.type === 'ok' ? '#eefaf2' : 'var(--err-weak)',
                  color: userMsg.type === 'ok' ? 'var(--ok)' : 'var(--err)',
                }}
              >
                {userMsg.text}
              </div>
            )}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        danger
        busy={busy}
        title={`Eliminar ${pendingDelete?.listKey === 'sucursales' ? 'sucursal' : 'proveedor'}`}
        message={
          <>
            ¿Seguro que querés eliminar <b>{pendingDelete?.name}</b>? Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/**
 * Cómo se da de alta en la sección:
 * - `inline`: un input de una sola línea en el pie (sucursales, que sólo tienen
 *   nombre).
 * - `form`: el pie muestra un botón "Agregar" que despliega un form completo
 *   (proveedores, que además del nombre piden razón social y CUIT).
 */
type AddMode =
  | {
      mode: 'inline';
      draft: string;
      onDraftChange: (v: string) => void;
      onAdd: () => void;
      placeholder: string;
    }
  | { mode: 'form'; renderForm: (close: () => void) => ReactNode };

interface CrudSectionProps<T extends { id: string; nombre: string }> {
  title: string;
  items: T[];
  add: AddMode;
  /** Segunda línea de la fila (ej. razón social · CUIT). null = no se muestra. */
  subtitle?: (item: T) => ReactNode;
  editKey: string | null;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onStartEdit: (id: string, name: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRequestDelete: (id: string, name: string) => void;
  listKey: ListKey;
  busy: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

function CrudSection<T extends { id: string; nombre: string }>({
  title,
  items,
  add,
  subtitle,
  editKey,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRequestDelete,
  listKey,
  busy,
  canAdd,
  canEdit,
  canDelete,
}: CrudSectionProps<T>) {
  // Sólo aplica al modo form: el form arranca cerrado y se despliega al tocar
  // "Agregar".
  const [addOpen, setAddOpen] = useState(false);
  const canSubmitAdd = add.mode === 'inline' && !busy && add.draft.trim().length > 0;
  const canSubmitEdit = !busy && editValue.trim().length > 0;
  return (
    <section style={{ flex: 1, minWidth: 400, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef1f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>{title}</div>
        <span style={{ background: 'var(--blue-weak)', color: 'var(--blue)', fontSize: 12, fontWeight: 800, borderRadius: 999, minWidth: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
          {items.length}
        </span>
      </div>
      <div className="ds-scroll" style={{ display: 'flex', flexDirection: 'column', height: 230, overflowY: 'auto' }}>
        {items.length === 0 && <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--muted-3)' }}>Sin registros.</div>}
        {items.map((it) => {
          const key = `${listKey}:${it.id}`;
          const editing = editKey === key;
          const sub = subtitle?.(it);
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
                  <button
                    onClick={onSaveEdit}
                    disabled={!canSubmitEdit}
                    style={{ ...saveBtn, background: canSubmitEdit ? 'var(--ok)' : '#c3cad6', cursor: canSubmitEdit ? 'pointer' : 'not-allowed' }}
                  >
                    Guardar
                  </button>
                  <button onClick={onCancelEdit} style={cancelBtn}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: '14.5px', color: 'var(--ink-2)', fontWeight: 500 }}>{it.nombre}</span>
                    {sub && <span style={{ fontSize: 12, color: 'var(--muted-3)', fontWeight: 500 }}>{sub}</span>}
                  </span>
                  {canEdit && (
                    <button onClick={() => onStartEdit(it.id, it.nombre)} title="Editar" style={iconBtn}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => onRequestDelete(it.id, it.nombre)} title="Eliminar" style={{ ...iconBtn, border: '1px solid #f0d3d3', color: 'var(--err)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {canAdd && add.mode === 'inline' && (
        <div style={{ display: 'flex', gap: 10, padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #eef1f6' }}>
          <input
            value={add.draft}
            onChange={(e) => add.onDraftChange(e.target.value)}
            placeholder={add.placeholder}
            onKeyDown={(e) => e.key === 'Enter' && canSubmitAdd && add.onAdd()}
            style={{ flex: 1, height: 40, border: '1px solid var(--border-2)', borderRadius: 8, padding: '0 13px', fontSize: 14, color: 'var(--ink)', outline: 'none' }}
          />
          <button
            onClick={add.onAdd}
            disabled={!canSubmitAdd}
            title={add.draft.trim() ? undefined : 'Ingresá un nombre para habilitar'}
            style={{
              ...addBtn,
              background: canSubmitAdd ? 'var(--ok)' : '#c3cad6',
              cursor: canSubmitAdd ? 'pointer' : 'not-allowed',
              opacity: canSubmitAdd ? 1 : 0.9,
            }}
          >
            Agregar
          </button>
        </div>
      )}
      {canAdd && add.mode === 'form' && (
        <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #eef1f6' }}>
          {addOpen ? (
            add.renderForm(() => setAddOpen(false))
          ) : (
            <button onClick={() => setAddOpen(true)} style={{ ...addBtn, width: '100%' }}>
              Agregar
            </button>
          )}
        </div>
      )}
    </section>
  );
}

interface SucursalAddFormProps {
  busy: boolean;
  /** Devuelve true si el alta se guardó: recién ahí se limpia y se cierra. */
  onSubmit: (input: CreateSucursalInput) => Promise<boolean>;
  onCancel: () => void;
}

/**
 * Form de alta de sucursal (depósito).
 *
 * ── Por qué dejó de ser un input inline ─────────────────────────────────────
 * Antes el alta era un solo campo con el nombre. Ahora pide también el código de
 * depósito del ERP, que es OBLIGATORIO: es el dato con el que el integrador
 * escribe el comprobante y con el que se filtran las órdenes de compra
 * pendientes. Antes ese código salía de una tabla hardcodeada en el conector
 * (`MDP → 003`), así que agregar un depósito era un cambio de código.
 *
 * Mismo patrón que `ProveedorAddForm`: un useState por campo, booleanos
 * derivados, sin librería de forms.
 */
function SucursalAddForm({ busy, onSubmit, onCancel }: SucursalAddFormProps) {
  const [nombre, setNombre] = useState('');
  const [codigoERP, setCodigoERP] = useState('');

  const nombreValid = nombre.trim() !== '';
  const codigoValid = codigoERP.trim() !== '';
  const canSubmit = !busy && nombreValid && codigoValid;

  async function submit() {
    if (!canSubmit) return;
    const ok = await onSubmit({ nombre: nombre.trim(), codigoERP: codigoERP.trim() });
    if (!ok) return; // el error ya se muestra arriba; los campos quedan para corregir
    setNombre('');
    setCodigoERP('');
    onCancel();
  }

  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={fieldLabel}>
        Nombre
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Cómo la llamás internamente"
          style={fieldInput}
        />
      </label>
      <label style={fieldLabel}>
        Código de depósito (ERP)
        <input
          value={codigoERP}
          // NO se normaliza (ni mayúsculas ni ceros a la izquierda): son códigos
          // del ERP y cualquier transformación puede dejar de matchear con la
          // base. Sólo se recorta el espacio de más al enviar.
          onChange={(e) => setCodigoERP(e.target.value)}
          onKeyDown={onEnter}
          placeholder="ej. 003"
          style={fieldInput}
        />
        <span style={{ fontSize: 11.5, color: 'var(--muted-2)', fontWeight: 500 }}>
          El <code>CODIGODEPOSITO</code> de esta sucursal en el ERP. Con esto se
          carga el comprobante y se buscan las órdenes de compra pendientes.
        </span>
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          title={canSubmit ? undefined : 'Completá el nombre y el código de depósito'}
          style={{
            ...addBtn,
            flex: 1,
            background: canSubmit ? 'var(--ok)' : '#c3cad6',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? 'Creando…' : 'Crear sucursal'}
        </button>
        <button onClick={onCancel} disabled={busy} style={cancelBtn}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

interface ProveedorAddFormProps {
  busy: boolean;
  /** Devuelve true si el alta se guardó: recién ahí se limpia y se cierra. */
  onSubmit: (input: CreateProveedorInput) => Promise<boolean>;
  onCancel: () => void;
}

/**
 * Form de alta de proveedor. Estado propio (mismo patrón que el bloque "Crear
 * usuario" de esta página): un useState por campo y booleanos derivados para la
 * validación, sin librería de forms.
 *
 * El CUIT se guarda en el estado como dígitos y se muestra enmascarado; lo que
 * viaja a la API son los 11 dígitos pelados.
 */
function ProveedorAddForm({ busy, onSubmit, onCancel }: ProveedorAddFormProps) {
  const [nombre, setNombre] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [cuit, setCuit] = useState('');
  const [codigoERP, setCodigoERP] = useState('');
  // Como string y no como number: el input vacío es '' y `Number('')` es 0, así
  // que con un number no habría forma de distinguir "no lo cargué" de "0 días".
  const [diasVencimiento, setDiasVencimiento] = useState('');

  const nombreValid = nombre.trim() !== '';
  const razonValid = razonSocial.trim() !== '';
  const cuitValid = cuitEsValido(cuit);
  const codigoERPValid = codigoERP.trim() !== '';
  /**
   * El plazo es OPCIONAL, así que vacío es válido. Lo que se valida es que si
   * escribió algo, sea un entero de 0 a 365 — mismo rango que el schema del back,
   * para que el error se vea al tipear y no después de un 400.
   */
  const diasNum = diasVencimiento === '' ? null : Number(diasVencimiento);
  const diasValid =
    diasNum === null ||
    (Number.isInteger(diasNum) && diasNum >= 0 && diasNum <= 365);
  const canSubmit =
    !busy && nombreValid && razonValid && cuitValid && codigoERPValid && diasValid;

  async function submit() {
    if (!canSubmit) return;
    const ok = await onSubmit({
      nombre,
      razonSocial,
      cuit,
      codigoERP: codigoERP.trim(),
      // Se OMITE si está vacío en vez de mandar 0: el back distingue `null` ("no
      // se cargó", cae al default avisando) de `0` ("vence el mismo día").
      ...(diasNum !== null ? { diasVencimiento: diasNum } : {}),
    });
    if (!ok) return; // el error ya se muestra arriba; los campos quedan para corregir
    setNombre('');
    setRazonSocial('');
    setCuit('');
    setCodigoERP('');
    setDiasVencimiento('');
    onCancel();
  }

  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={fieldLabel}>
        Nombre
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Cómo lo llamás internamente"
          style={fieldInput}
        />
      </label>
      <label style={fieldLabel}>
        Razón social
        <input
          value={razonSocial}
          onChange={(e) => setRazonSocial(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Denominación legal"
          style={fieldInput}
        />
      </label>
      <label style={fieldLabel}>
        CUIT
        <input
          // La máscara es sólo visual: el estado guarda dígitos y el input los
          // muestra formateados, así el usuario puede tipear con o sin guiones.
          value={formatCuit(cuit, '')}
          onChange={(e) => setCuit(soloDigitos(e.target.value).slice(0, 11))}
          onKeyDown={onEnter}
          placeholder="xx-xxxxxxxx-x"
          inputMode="numeric"
          style={{ ...fieldInput, borderColor: cuit !== '' && !cuitValid ? 'var(--err)' : 'var(--border-2)' }}
        />
        {cuit !== '' && !cuitValid && (
          <span style={hintErr}>
            {cuit.length < 11 ? 'El CUIT debe tener 11 dígitos' : 'El CUIT no es válido'}
          </span>
        )}
      </label>
      <label style={fieldLabel}>
        Código ERP
        <input
          value={codigoERP}
          onChange={(e) => setCodigoERP(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Código de proveedor en el sistema ERP"
          style={fieldInput}
        />
      </label>
      <label style={fieldLabel}>
        Plazo de pago (días)
        <input
          value={diasVencimiento}
          // Sólo dígitos: es un entero de días. El filtro va sobre el valor que
          // entra al estado Y el input es controlado, así que lo que se muestra y
          // lo que se guarda no pueden divergir.
          onChange={(e) => setDiasVencimiento(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
          onKeyDown={onEnter}
          placeholder="Opcional — ej. 20"
          inputMode="numeric"
          style={{ ...fieldInput, borderColor: !diasValid ? 'var(--err)' : 'var(--border-2)' }}
        />
        {!diasValid ? (
          <span style={hintErr}>El plazo tiene que ser un número de 0 a 365 días</span>
        ) : (
          <span style={{ fontSize: 11.5, color: 'var(--muted-2)', fontWeight: 500 }}>
            Días desde la fecha de la factura hasta su vencimiento. Si lo dejás
            vacío, el integrador usa 30 días.
          </span>
        )}
      </label>
      
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          title={canSubmit ? undefined : 'Completá nombre, razón social, CUIT y código ERP para habilitar'}
          style={{
            ...addBtn,
            flex: 1,
            background: canSubmit ? 'var(--ok)' : '#c3cad6',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.9,
          }}
        >
          {busy ? 'Guardando…' : 'Guardar proveedor'}
        </button>
        <button onClick={onCancel} style={{ ...cancelBtn, height: 40 }}>
          Cancelar
        </button>
      </div>
    </div>
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
const saveBtn: CSSProperties = { height: 38, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--ok)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const cancelBtn: CSSProperties = { height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-2)', background: '#fff', color: 'var(--muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const addBtn: CSSProperties = { height: 40, padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--ok)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const fieldLabel: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--muted-2)' };
const fieldInput: CSSProperties = { height: 40, border: '1px solid var(--border-2)', borderRadius: 8, padding: '0 13px', fontSize: 14, color: 'var(--ink)', outline: 'none', background: '#fff', fontWeight: 500 };
const hintErr: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--err)' };
