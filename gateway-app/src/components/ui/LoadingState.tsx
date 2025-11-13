/**
 * LoadingState Component
 *
 * Reusable loading indicator with optional message.
 * Replaces duplicate loading patterns across views.
 *
 * @example Centered full-screen loading
 * <LoadingState message="Loading portfolio..." />
 *
 * @example Inline loading
 * <LoadingState message="Fetching positions..." centered={false} />
 *
 * @example Minimal spinner
 * <LoadingState />
 */

export interface LoadingStateProps {
  /** Loading message to display */
  message?: string;
  /** Whether to center vertically (default: true) */
  centered?: boolean;
  /** Size of the spinner: 'sm' | 'md' | 'lg' (default: 'md') */
  size?: 'sm' | 'md' | 'lg';
  /** Custom className */
  className?: string;
}

export function LoadingState({
  message = 'Loading...',
  centered = true,
  size = 'md',
  className = '',
}: LoadingStateProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  const spinnerClass = `${sizeClasses[size]} border-primary border-t-transparent rounded-full animate-spin`;

  const content = (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className={spinnerClass} />
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );

  if (centered) {
    return (
      <div className="flex items-center justify-center h-full">
        {content}
      </div>
    );
  }

  return content;
}
