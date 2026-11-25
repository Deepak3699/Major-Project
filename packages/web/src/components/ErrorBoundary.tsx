import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // After a deploy, an open tab can hold stale lazy-chunk URLs. Reload once
    // (guarded so a genuinely broken chunk cannot cause an infinite loop).
    if (typeof window !== 'undefined' && /chunk|dynamically imported module/i.test(error.message || '')) {
      const key = 'chunk-reload-at';
      let last = 0;
      try { last = Number(window.sessionStorage.getItem(key) || 0); } catch { /* noop */ }
      if (Date.now() - last > 5000) {
        try { window.sessionStorage.setItem(key, String(Date.now())); } catch { /* noop */ }
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md w-full space-y-4 p-8 bg-surface rounded-lg border border-border">
            <span aria-hidden className="block h-2.5 w-2.5 rounded-[3px] bg-destructive" />
            <h1 className="text-[24px] font-semibold tracking-[-0.022em] text-foreground">Something went wrong</h1>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium transition-colors hover:bg-primary-hover"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
