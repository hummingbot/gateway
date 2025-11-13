import { BaseModal } from './ui/BaseModal';
import { ActionButtons } from './ui/ActionButtons';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <BaseModal onClose={onCancel} useCard={false}>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-muted-foreground">{message}</p>
        <div className="flex justify-end">
          <ActionButtons
            primary={{ label: confirmText, onClick: onConfirm, variant: 'destructive' }}
            secondary={{ label: cancelText, onClick: onCancel }}
          />
        </div>
      </div>
    </BaseModal>
  );
}
