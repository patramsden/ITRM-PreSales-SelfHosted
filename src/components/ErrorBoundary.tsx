import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '900px', margin: '2rem auto' }}>
          <h1 style={{ color: '#dc2626', fontSize: '1.25rem', marginBottom: '1rem' }}>
            ⚠️ Runtime Error — copy this and report it
          </h1>
          <pre style={{
            background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px',
            padding: '1rem', overflowX: 'auto', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            color: '#7f1d1d',
          }}>
            {this.state.error.name}: {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{
              marginTop: '1.5rem', padding: '0.5rem 1.25rem', background: '#dc2626',
              color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem',
            }}
          >
            Clear storage &amp; reload
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.5rem', marginLeft: '0.75rem', padding: '0.5rem 1.25rem', background: '#2563eb',
              color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem',
            }}
          >
            Reload without clearing
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
