import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from './Button';

interface State { error: Error | null }

/** A render error shows a recoverable panel instead of a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(_error: Error, _info: ErrorInfo): void { /* surfaced in the panel; nothing is logged from the renderer */ }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center-fill" role="alert">
        <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{this.props.label ?? 'Something went wrong in this view.'}</div>
        <div className="meta" style={{ maxWidth: 480, textAlign: 'center' }}>{this.state.error.message}</div>
        <Button variant="secondary" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}
