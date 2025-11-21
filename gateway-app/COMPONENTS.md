# Gateway App - Component Library

This document describes the reusable UI components available in the Gateway App.

## Base Components

### BaseModal

A reusable modal component with consistent styling and behavior.

**Location**: `src/components/ui/BaseModal.tsx`

**Props**:
- `isOpen: boolean` - Controls modal visibility
- `onClose: () => void` - Callback when modal is closed
- `title: string` - Modal header title
- `children: React.ReactNode` - Modal content
- `size?: 'sm' | 'md' | 'lg' | 'xl'` - Modal width (default: 'md')

**Usage**:
```tsx
import { BaseModal } from '@/components/ui/BaseModal';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="Confirm Action"
      size="md"
    >
      <p>Are you sure you want to proceed?</p>
      <div className="flex gap-2 mt-4">
        <button onClick={() => setIsOpen(false)}>Cancel</button>
        <button onClick={handleConfirm}>Confirm</button>
      </div>
    </BaseModal>
  );
}
```

**Features**:
- Click outside to close
- Escape key to close
- Smooth fade-in/fade-out animation
- Responsive sizing
- Centered positioning with scrolling support

---

### EmptyState

Displays a message when no data is available.

**Location**: `src/components/ui/EmptyState.tsx`

**Props**:
- `message: string` - Text to display
- `icon?: React.ReactNode` - Optional icon to display above message

**Usage**:
```tsx
import { EmptyState } from '@/components/ui/EmptyState';

function PoolsList({ pools }) {
  if (pools.length === 0) {
    return <EmptyState message="No pools available" />;
  }

  return <div>{/* Render pools */}</div>;
}
```

**Styling**:
- Centered text
- Muted color (text-gray-500)
- Padding for spacing

---

### LoadingState

Displays a loading spinner with optional message.

**Location**: `src/components/ui/LoadingState.tsx`

**Props**:
- `message?: string` - Optional loading message (default: 'Loading...')

**Usage**:
```tsx
import { LoadingState } from '@/components/ui/LoadingState';

function DataView({ isLoading, data }) {
  if (isLoading) {
    return <LoadingState message="Fetching balances..." />;
  }

  return <div>{/* Render data */}</div>;
}
```

**Features**:
- Animated spinner
- Customizable message
- Centered layout

---

### FormField

Consistent form field styling with label and input.

**Location**: `src/components/ui/FormField.tsx`

**Props**:
- `label: string` - Field label text
- `type?: string` - Input type (default: 'text')
- `value: string` - Input value
- `onChange: (e: React.ChangeEvent<HTMLInputElement>) => void` - Change handler
- `placeholder?: string` - Placeholder text
- `required?: boolean` - Mark field as required
- `disabled?: boolean` - Disable input

**Usage**:
```tsx
import { FormField } from '@/components/ui/FormField';

function SwapForm() {
  const [amount, setAmount] = useState('');

  return (
    <FormField
      label="Amount"
      type="number"
      value={amount}
      onChange={(e) => setAmount(e.target.value)}
      placeholder="0.0"
      required
    />
  );
}
```

**Features**:
- Consistent label styling
- Full-width responsive input
- Required field indicator
- Disabled state styling

---

### ActionButtons

Container for form action buttons with consistent layout.

**Location**: `src/components/ui/ActionButtons.tsx`

**Props**:
- `children: React.ReactNode` - Button elements

**Usage**:
```tsx
import { ActionButtons } from '@/components/ui/ActionButtons';

function SwapForm() {
  return (
    <form>
      {/* Form fields */}

      <ActionButtons>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="bg-blue-500 text-white">
          Execute Swap
        </button>
      </ActionButtons>
    </form>
  );
}
```

**Features**:
- Flexbox layout with gap spacing
- Right-aligned buttons
- Responsive spacing

---

### Button (with variants)

Styled button component with multiple variants.

**Location**: `src/components/ui/button.tsx`

**Props**:
- `variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'`
- `size?: 'default' | 'sm' | 'lg' | 'icon'`
- Standard HTML button props

**Usage**:
```tsx
import { Button } from '@/components/ui/button';

function ActionPanel() {
  return (
    <div>
      <Button variant="default" size="default">
        Primary Action
      </Button>
      <Button variant="outline" size="sm">
        Secondary
      </Button>
      <Button variant="destructive" size="lg">
        Delete
      </Button>
    </div>
  );
}
```

**Variants**:
- `default`: Primary blue background
- `destructive`: Red background for dangerous actions
- `outline`: Transparent with border
- `secondary`: Gray background
- `ghost`: No background, hover effect only
- `link`: Text-only, underlined on hover

**Sizes**:
- `default`: Medium height (h-10)
- `sm`: Small height (h-9)
- `lg`: Large height (h-11)
- `icon`: Square button for icons (h-10 w-10)

---

## Usage Patterns

### Loading States

Always show loading state while fetching data:

```tsx
function DataComponent() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const result = await gatewayAPI.chains.getBalances(...);
        setData(result);
      } catch (error) {
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <LoadingState />;
  if (!data) return <EmptyState message="No data available" />;

  return <div>{/* Render data */}</div>;
}
```

### Form Validation

Use FormField with validation:

```tsx
function SwapForm() {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (parseFloat(amount) <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    // Proceed with submission
  };

  return (
    <form onSubmit={handleSubmit}>
      <FormField
        label="Amount"
        type="number"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setError('');
        }}
        required
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}

      <ActionButtons>
        <Button type="submit">Submit</Button>
      </ActionButtons>
    </form>
  );
}
```

### Modal Workflows

Chain modals for multi-step workflows:

```tsx
function LiquidityManager() {
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [positionData, setPositionData] = useState(null);

  const handleOpenPosition = (data) => {
    setPositionData(data);
    setShowPositionModal(false);
    setShowConfirmModal(true);
  };

  return (
    <>
      <Button onClick={() => setShowPositionModal(true)}>
        Open Position
      </Button>

      <BaseModal
        isOpen={showPositionModal}
        onClose={() => setShowPositionModal(false)}
        title="Configure Position"
      >
        {/* Position form */}
      </BaseModal>

      <BaseModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirm Transaction"
      >
        {/* Confirmation details */}
      </BaseModal>
    </>
  );
}
```

## Styling Guidelines

### Tailwind CSS

All components use Tailwind CSS for styling:

- **Colors**: Use semantic color classes (bg-blue-500, text-gray-700, etc.)
- **Spacing**: Consistent spacing scale (p-4, mt-2, gap-2, etc.)
- **Borders**: Use border-gray-300 for neutral borders
- **Shadows**: Use shadow-md for cards, shadow-lg for modals
- **Rounded**: Use rounded-lg for containers, rounded for inputs

### Dark Mode (Future)

Components are designed to support dark mode via Tailwind's dark: variant:

```tsx
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
```

## Accessibility

All components follow accessibility best practices:

- **Keyboard Navigation**: Modals support Escape key, buttons are focusable
- **ARIA Labels**: Use appropriate ARIA attributes for screen readers
- **Focus Management**: Modals trap focus, forms have logical tab order
- **Semantic HTML**: Use proper HTML elements (button, form, label, etc.)

## Testing Components

Example test patterns:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { BaseModal } from '@/components/ui/BaseModal';

describe('BaseModal', () => {
  it('renders when open', () => {
    render(
      <BaseModal isOpen={true} onClose={() => {}} title="Test">
        Content
      </BaseModal>
    );
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('calls onClose when clicking outside', () => {
    const onClose = jest.fn();
    render(
      <BaseModal isOpen={true} onClose={onClose} title="Test">
        Content
      </BaseModal>
    );
    fireEvent.click(screen.getByRole('dialog').parentElement);
    expect(onClose).toHaveBeenCalled();
  });
});
```
