import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Nombre de la pantalla, para el mensaje y para el log. */
  scope?: string;
}

interface State {
  error: Error | null;
}

/**
 * Frontera de error. Componente de clase porque es la única API de React que
 * intercepta excepciones de render — no hay hook equivalente.
 *
 * ## Por qué hace falta
 *
 * Sin frontera, una excepción en render desmonta **todo el árbol** y la página queda
 * en blanco. Y como esta app no tiene router, el usuario no puede navegar a otra
 * parte: tiene que recargar, perdiendo el archivo seleccionado, los mensajes y el
 * proceso que estaba mirando.
 *
 * Vectores reales de throw en render acá: los hooks de context (`useData`, `useSse`,
 * `useAuth`) lanzan si falta el provider, y los lookups por índice sobre `Record`s
 * (`PALETA[estado]`, `PCT_POR_STAGE[stage]`) devuelven `undefined` si el back manda
 * un valor nuevo, con lo cual el acceso a una propiedad después explota.
 *
 * Se usa **una por pantalla**, no una sola global: así un fallo en Pendientes no se
 * lleva la navegación ni las otras pestañas.
 *
 * @example
 *   {tab === 'pendientes' && (
 *     <ErrorBoundary scope="Pendientes"><PendientesPage /></ErrorBoundary>
 *   )}
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Único console del front a propósito: es la última oportunidad de dejar
    // rastro de un error que ya rompió el render.
    console.error(`[ErrorBoundary${this.props.scope ? ` · ${this.props.scope}` : ''}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          background: '#fff',
          border: '1px solid #f0c6c6',
          borderRadius: 12,
          padding: '22px 24px',
          maxWidth: 620,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--err)' }}>
          Algo se rompió en esta pantalla
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          {this.props.scope
            ? `La sección "${this.props.scope}" no se pudo dibujar. El resto de la aplicación sigue funcionando: podés cambiar de pestaña.`
            : 'La pantalla no se pudo dibujar. El resto de la aplicación sigue funcionando.'}
        </div>
        <code
          style={{
            fontSize: 12,
            color: 'var(--muted-2)',
            background: '#f6f7f9',
            borderRadius: 6,
            padding: '8px 10px',
            wordBreak: 'break-word',
          }}
        >
          {error.message}
        </code>
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Reintentar antes que recargar: si el error fue por un dato transitorio,
              el usuario no pierde lo que tenía en las otras pantallas. */}
          <button
            onClick={this.reset}
            style={{
              height: 40,
              padding: '0 20px',
              borderRadius: 8,
              border: '1px solid #cfd8e6',
              background: '#fff',
              color: 'var(--blue)',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              height: 40,
              padding: '0 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--blue)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Recargar la página
          </button>
        </div>
      </div>
    );
  }
}
