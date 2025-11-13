/**
 * ActionButtons Component
 *
 * Reusable action button group for common patterns like submit/cancel, confirm/cancel.
 * Reduces boilerplate for modal and form buttons.
 *
 * @example Submit/Cancel pattern
 * <ActionButtons
 *   primary={{ label: "Add Token", onClick: handleSubmit }}
 *   secondary={{ label: "Cancel", onClick: handleCancel }}
 *   loading={isSubmitting}
 * />
 *
 * @example Confirm/Delete pattern
 * <ActionButtons
 *   primary={{ label: "Delete", onClick: handleDelete, variant: "destructive" }}
 *   secondary={{ label: "Cancel", onClick: handleCancel }}
 * />
 */

import { Button } from './button';

export interface ActionButtonConfig {
  /** Button label */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Button variant */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  /** Whether button is disabled */
  disabled?: boolean;
}

export interface ActionButtonsProps {
  /** Primary action button (e.g., Submit, Confirm) */
  primary: ActionButtonConfig;
  /** Secondary action button (e.g., Cancel) */
  secondary?: ActionButtonConfig;
  /** Whether buttons are in loading state */
  loading?: boolean;
  /** Loading label for primary button (default: uses primary.label) */
  loadingLabel?: string;
  /** Button layout: 'horizontal' | 'vertical' (default: 'horizontal') */
  layout?: 'horizontal' | 'vertical';
  /** Custom className for container */
  className?: string;
}

export function ActionButtons({
  primary,
  secondary,
  loading = false,
  loadingLabel,
  layout = 'horizontal',
  className = '',
}: ActionButtonsProps) {
  const containerClass = layout === 'horizontal' ? 'flex gap-2' : 'flex flex-col gap-2';
  const buttonClass = layout === 'horizontal' ? 'flex-1' : 'w-full';

  const isPrimaryDisabled = loading || primary.disabled;
  const isSecondaryDisabled = loading || secondary?.disabled;

  return (
    <div className={`${containerClass} ${className}`}>
      <Button
        onClick={primary.onClick}
        variant={primary.variant || 'default'}
        disabled={isPrimaryDisabled}
        className={buttonClass}
      >
        {loading ? (loadingLabel || `${primary.label}...`) : primary.label}
      </Button>
      {secondary && (
        <Button
          onClick={secondary.onClick}
          variant={secondary.variant || 'outline'}
          disabled={isSecondaryDisabled}
          className={buttonClass}
        >
          {secondary.label}
        </Button>
      )}
    </div>
  );
}
