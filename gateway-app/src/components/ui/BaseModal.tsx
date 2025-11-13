/**
 * BaseModal Component
 *
 * Reusable modal wrapper built on shadcn/ui Dialog.
 * Maintains backward compatibility with previous API while using proper Dialog primitives.
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
import { Dialog, DialogContent } from './dialog';
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
  const handleOpenChange = (open: boolean) => {
    if (!open && onClose) {
      onClose();
    }
  };

  const contentClasses = `${maxWidth} ${className}`;

  return (
    <Dialog open={true} onOpenChange={closeOnBackdropClick ? handleOpenChange : undefined}>
      <DialogContent className={contentClasses} onPointerDownOutside={(e) => {
        if (!closeOnBackdropClick) {
          e.preventDefault();
        }
      }}>
        {useCard ? (
          <Card className="border-0 shadow-none">{children}</Card>
        ) : (
          <div>{children}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
