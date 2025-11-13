/**
 * FormField Component
 *
 * Reusable form field wrapper with label and input/select.
 * Reduces boilerplate for common form patterns.
 *
 * @example Text input
 * <FormField
 *   label="Token Address"
 *   type="text"
 *   value={address}
 *   onChange={(e) => setAddress(e.target.value)}
 *   placeholder="Enter token address"
 * />
 *
 * @example Select dropdown
 * <FormField
 *   label="Network"
 *   type="select"
 *   value={network}
 *   onChange={(e) => setNetwork(e.target.value)}
 *   options={[
 *     { value: 'mainnet', label: 'Mainnet' },
 *     { value: 'testnet', label: 'Testnet' }
 *   ]}
 * />
 */

import { Input } from './input';
import { Select } from './select';

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldProps {
  /** Field label */
  label: string;
  /** Input type or 'select' */
  type?: 'text' | 'number' | 'password' | 'select';
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether field is disabled */
  disabled?: boolean;
  /** For select: array of options */
  options?: FormFieldOption[];
  /** Optional helper text */
  helperText?: string;
  /** Custom className for the container */
  className?: string;
  /** Label size (default: 'sm') */
  labelSize?: 'xs' | 'sm' | 'md';
}

export function FormField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
  options = [],
  helperText,
  className = '',
  labelSize = 'sm',
}: FormFieldProps) {
  const labelSizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
  };

  const labelClass = `${labelSizeClasses[labelSize]} font-medium`;

  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      {type === 'select' ? (
        <Select value={value} onChange={onChange} disabled={disabled}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
      {helperText && (
        <p className="text-xs text-muted-foreground mt-1">{helperText}</p>
      )}
    </div>
  );
}
