import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary (e.g. the current route path). */
  resetKey?: string;
}

interface State {
  error: Error | null;
  resetKey?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty" role="alert">
        <p className="empty__title">Something went wrong</p>
        <p className="small">{this.state.error.message}</p>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
