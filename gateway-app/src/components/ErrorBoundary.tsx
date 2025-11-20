import { Component, ReactNode } from 'react';
import { Button } from './ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetErrorBoundary);
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="max-w-md w-full space-y-4 text-center">
            <div className="text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto mb-4"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
              <p className="text-muted-foreground mb-4">
                An unexpected error occurred. Try refreshing the page or contact support if the problem persists.
              </p>
            </div>

            <details className="text-left">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground mb-2">
                Error details
              </summary>
              <div className="mt-2 p-4 bg-muted rounded-md text-xs font-mono overflow-auto max-h-48">
                <div className="text-destructive font-semibold mb-2">{this.state.error.name}</div>
                <div className="mb-2">{this.state.error.message}</div>
                {this.state.error.stack && (
                  <pre className="text-muted-foreground text-[10px] whitespace-pre-wrap break-all">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            </details>

            <div className="flex gap-2 justify-center">
              <Button onClick={this.resetErrorBoundary} variant="default">
                Try again
              </Button>
              <Button onClick={() => window.location.reload()} variant="outline">
                Reload page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
