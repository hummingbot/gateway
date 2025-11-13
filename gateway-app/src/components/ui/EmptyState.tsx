/**
 * EmptyState Component
 *
 * Reusable empty state display for when no data is available.
 * Replaces duplicate "No Wallet Selected", "No data found" patterns across views.
 *
 * @example With action button
 * <EmptyState
 *   title="No Wallet Selected"
 *   message="Please select a wallet to view your portfolio."
 *   action={{ label: "Add Wallet", onClick: handleAddWallet }}
 * />
 *
 * @example Simple message
 * <EmptyState title="No Positions" message="You don't have any liquidity positions yet." />
 */

import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Button } from './button';

export interface EmptyStateProps {
  /** Title of the empty state */
  title: string;
  /** Descriptive message */
  message: string;
  /** Optional icon or emoji to display */
  icon?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Whether to show as centered full-height (default: true) */
  centered?: boolean;
  /** Custom className for the card */
  className?: string;
}

export function EmptyState({
  title,
  message,
  icon,
  action,
  centered = true,
  className = '',
}: EmptyStateProps) {
  const content = (
    <Card className={`w-96 ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon && <span className="text-2xl">{icon}</span>}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">{message}</p>
        {action && (
          <Button onClick={action.onClick} className="w-full">
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
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
