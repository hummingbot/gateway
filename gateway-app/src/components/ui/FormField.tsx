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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { Label } from './label';

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
  /** Change handler - for inputs, regular event handler; for selects, value handler */
  onChange: (e: React.ChangeEvent<HTMLInputElement> | string) => void;
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

  return (
    <div className={className}>
      <Label className={`${labelSizeClasses[labelSize]} block mb-2`}>{label}</Label>
      {type === 'select' ? (
        <Select
          value={value}
          onValueChange={(val) => onChange(val)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={type}
          value={value}
          onChange={onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
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
