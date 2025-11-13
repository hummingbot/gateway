/**
 * BaseModal Component
 *
 * Reusable modal wrapper with backdrop, centered positioning, and optional Card styling.
 * Replaces duplicate modal overlay patterns across AddTokenModal, AddWalletModal, and ConfirmModal.
 *
 * @example Basic modal with Card
 * <BaseModal onClose={handleClose}>
 *   <CardHeader><CardTitle>My Modal</CardTitle></CardHeader>
 *   <CardContent>Content here</CardContent>
 * </BaseModal>
 *
 * @example Modal without Card wrapper
 * <BaseModal onClose={handleClose} useCard={false}>
 *   <div>Custom content</div>
 * </BaseModal>
 */

import { ReactNode } from 'react';
import { Card } from './card';

export interface BaseModalProps {
  /** Content to render inside the modal */
  children: ReactNode;
  /** Callback when backdrop is clicked or ESC is pressed */
  onClose?: () => void;
  /** Whether to wrap content in Card component (default: true) */
  useCard?: boolean;
  /** Custom className for the content container */
  className?: string;
  /** Maximum width class (default: 'max-w-md') */
  maxWidth?: string;
  /** Whether clicking backdrop closes modal (default: true) */
  closeOnBackdropClick?: boolean;
}

export function BaseModal({
  children,
  onClose,
  useCard = true,
  className = '',
  maxWidth = 'max-w-md',
  closeOnBackdropClick = true,
}: BaseModalProps) {
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking the backdrop itself, not the content
    if (closeOnBackdropClick && onClose && e.target === e.currentTarget) {
      onClose();
    }
  };

  const contentClasses = `w-full ${maxWidth} ${className}`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      {useCard ? (
        <Card className={contentClasses}>{children}</Card>
      ) : (
        <div className={`bg-background border rounded-lg shadow-lg p-6 ${contentClasses}`}>
          {children}
        </div>
      )}
    </div>
  );
}
