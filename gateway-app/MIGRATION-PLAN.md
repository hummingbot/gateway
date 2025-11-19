# Gateway App - shadcn/ui Migration Plan

## Executive Summary

Refactor the gateway-app to use **only** shadcn/ui components for consistency, best practices, and to serve as a reference implementation. This migration will replace custom implementations and ensure all UI elements follow shadcn/ui patterns.

---

## Current State Audit

### ✅ Already Using shadcn/ui
- **Button** - Component exists, but many native `<button>` elements remain (9 files)
- **Card** - Fully migrated
- **Input** - Fully migrated
- **Select** - Just completed migration (Nov 18, 2024)
- **Dialog** - Used via BaseModal wrapper
- **Form** - Installed but not yet used
- **Label** - Fully migrated
- **Switch** - Available and used
- **Tabs** - Available but need to verify usage

### ⚠️ Custom Wrappers (Built on shadcn)
These are **acceptable** as they provide convenience APIs:
- **BaseModal** - Wraps Dialog (provides simpler API for common cases)
- **ActionButtons** - Wraps Button (reduces boilerplate for submit/cancel patterns)
- **FormField** - Wraps Input/Select/Label (convenient form field pattern)
- **EmptyState** - Custom component for empty states
- **LoadingState** - Custom component for loading states

### ❌ Needs Migration
1. **Notifications**: react-hot-toast → Sonner
2. **Tables**: Native `<table>` → shadcn Table component (2 files)
3. **Buttons**: Native `<button>` → Button component (9 files, ~30 buttons)
4. **Typography**: Raw headings → shadcn typography patterns (12 headings)
5. **Missing Components**: Separator, Badge, Alert (not yet used but should be available)

---

## Migration Strategy

### Phase 1: Install Missing Components
**Priority: HIGH | Effort: LOW | Impact: Foundation**

1. Install Sonner for toast notifications
2. Install Table component
3. Install Separator component
4. Install Badge component
5. Install Alert component

**Commands:**
```bash
npx shadcn@latest add sonner
npx shadcn@latest add table
npx shadcn@latest add separator
npx shadcn@latest add badge
npx shadcn@latest add alert
```

**Files to create/update:**
- `src/components/ui/sonner.tsx` (new)
- `src/components/ui/table.tsx` (new)
- `src/components/ui/separator.tsx` (new)
- `src/components/ui/badge.tsx` (new)
- `src/components/ui/alert.tsx` (new)

---

### Phase 2: Migrate Notifications (react-hot-toast → Sonner)
**Priority: HIGH | Effort: MEDIUM | Impact: App-wide**

**Why this matters:**
- Sonner is the recommended shadcn/ui toast component
- Better TypeScript support and API
- Consistent with shadcn/ui design system
- Better mobile support and animations

**Files to update:**
1. `src/App.tsx` - Replace Toaster component
2. `src/lib/notifications.ts` - Replace toast API calls
3. All components using notifications (test that they work)

**Migration steps:**
```typescript
// Before (react-hot-toast):
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
<Toaster position="top-center" />
toast.success('Message');
toast.error('Error');

// After (Sonner):
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
<Toaster />
toast.success('Message');
toast.error('Error');
```

**Testing checklist:**
- [ ] Success notifications display correctly
- [ ] Error notifications display correctly
- [ ] Toast position is correct (top-center)
- [ ] Toast dismissal works
- [ ] Multiple toasts stack properly

---

### Phase 3: Migrate Tables
**Priority: MEDIUM | Effort: MEDIUM | Impact: 2 files**

**Files to update:**
1. `src/components/PortfolioView.tsx` - Token balances table
2. `src/components/ConfigView.tsx` - Configuration table

**Migration pattern:**
```typescript
// Before:
<table className="w-full">
  <thead>
    <tr>
      <th>Header</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Data</td>
    </tr>
  </tbody>
</table>

// After:
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Header</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Data</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

**Benefits:**
- Responsive design built-in
- Consistent styling
- Better accessibility
- Hover states and interactions

---

### Phase 4: Migrate Native Buttons to Button Component
**Priority: HIGH | Effort: HIGH | Impact: 9 files**

**Files to update:**
1. `src/App.tsx` - Mobile modal buttons, navigation buttons
2. `src/components/ActivityView.tsx` - Refresh button, transaction list buttons
3. `src/components/ConfigView.tsx` - Sidebar buttons, namespace buttons
4. `src/components/NetworkStatus.tsx` - Status indicators
5. `src/components/PoolsView.tsx` - Filter buttons, pool selection buttons
6. `src/components/PortfolioView.tsx` - Refresh button
7. `src/components/RestartButton.tsx` - Restart button
8. `src/components/SwapView.tsx` - Swap direction button

**Migration pattern:**
```typescript
// Before:
<button
  onClick={handleClick}
  className="p-2 hover:bg-accent rounded transition-colors"
  disabled={loading}
>
  Click me
</button>

// After:
import { Button } from '@/components/ui/button';

<Button
  onClick={handleClick}
  variant="ghost"
  size="icon"
  disabled={loading}
>
  Click me
</Button>
```

**Button variants to use:**
- **default** - Primary actions (submit, save, add)
- **destructive** - Dangerous actions (delete, remove)
- **outline** - Secondary actions (cancel, back)
- **ghost** - Tertiary/icon buttons (close, refresh, toggle)
- **link** - Link-style buttons

**Button sizes:**
- **default** - Standard size (h-10)
- **sm** - Small buttons (h-9)
- **lg** - Large buttons (h-11)
- **icon** - Icon-only buttons (h-10 w-10)

**Special cases:**
1. **Navigation buttons** (bottom nav) - Use `variant="ghost"` with custom active state
2. **Icon buttons** (refresh, close) - Use `size="icon"` with `variant="ghost"`
3. **Filter buttons** (pools, config) - Use `variant="outline"` with active state
4. **Swap direction button** - Use `variant="ghost"` with `size="icon"`

---

### Phase 5: Implement Typography Patterns
**Priority: MEDIUM | Effort: LOW | Impact: App-wide**

**Why this matters:**
- Consistent text hierarchy
- Better readability
- Accessible heading structure
- Design system consistency

**Typography scale:**
```typescript
// Headings
<h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
<h2 className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0">
<h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
<h4 className="scroll-m-20 text-xl font-semibold tracking-tight">

// Body text
<p className="leading-7 [&:not(:first-child)]:mt-6">

// Lead text
<p className="text-xl text-muted-foreground">

// Large text
<div className="text-lg font-semibold">

// Small text
<small className="text-sm font-medium leading-none">

// Muted text
<p className="text-sm text-muted-foreground">
```

**Files to review:**
- All CardTitle elements (should use consistent typography)
- All headings in modals
- Section headers in views
- Helper text and descriptions

**Create typography utility:**
```typescript
// src/lib/typography.ts
export const typography = {
  h1: "scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl",
  h2: "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight",
  h3: "scroll-m-20 text-2xl font-semibold tracking-tight",
  h4: "scroll-m-20 text-xl font-semibold tracking-tight",
  p: "leading-7 [&:not(:first-child)]:mt-6",
  lead: "text-xl text-muted-foreground",
  large: "text-lg font-semibold",
  small: "text-sm font-medium leading-none",
  muted: "text-sm text-muted-foreground",
};
```

---

### Phase 6: Add Missing Components Where Appropriate
**Priority: LOW | Effort: LOW | Impact: Enhancement**

**Separator:**
Use in:
- Between sections in sidebars (Pools, Activity, Config)
- Between groups in dropdowns (WalletSelector)
- Between sections in forms

**Badge:**
Use for:
- Status indicators (Connected, Disconnected, Pending)
- Pool type labels (AMM, CLMM, Router)
- Network indicators
- Transaction status

**Alert:**
Use for:
- Error messages (replace inline error divs)
- Warning messages
- Info messages (empty states, help text)
- Success messages (persistent notifications)

**Example usage:**
```typescript
// Separator
import { Separator } from '@/components/ui/separator';
<Separator />

// Badge
import { Badge } from '@/components/ui/badge';
<Badge variant="default">Active</Badge>
<Badge variant="destructive">Failed</Badge>
<Badge variant="outline">Pending</Badge>

// Alert
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
<Alert>
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Failed to load data</AlertDescription>
</Alert>
```

---

## Implementation Order

### Week 1: Foundation
1. ✅ Install all missing components (Phase 1)
2. 🔲 Migrate notifications to Sonner (Phase 2)
3. 🔲 Test notification system end-to-end

### Week 2: Visual Consistency
4. 🔲 Migrate tables (Phase 3)
5. 🔲 Implement typography patterns (Phase 5)
6. 🔲 Add Separator where appropriate

### Week 3: Interactive Elements
7. 🔲 Migrate all native buttons (Phase 4) - Start with high-traffic pages
   - SwapView buttons
   - ActivityView buttons
   - PoolsView filter buttons
8. 🔲 Add Badge components for status indicators
9. 🔲 Replace error divs with Alert components

### Week 4: Polish & Documentation
10. 🔲 Final review and testing
11. 🔲 Update component documentation
12. 🔲 Create component usage guide
13. 🔲 Remove unused dependencies (react-hot-toast)

---

## Testing Checklist

### Functional Testing
- [ ] All notifications display correctly (Sonner)
- [ ] All tables are responsive and accessible
- [ ] All buttons maintain correct behavior
- [ ] Forms still validate and submit correctly
- [ ] Modals open/close correctly
- [ ] Dropdowns work on mobile and desktop

### Visual Testing
- [ ] Typography hierarchy is consistent
- [ ] Button variants are used appropriately
- [ ] Tables render correctly on mobile
- [ ] Spacing and layout are consistent
- [ ] Dark mode works correctly
- [ ] Color contrast meets accessibility standards

### Accessibility Testing
- [ ] Keyboard navigation works
- [ ] Screen reader announces elements correctly
- [ ] Focus states are visible
- [ ] ARIA labels are appropriate
- [ ] Heading hierarchy is logical

---

## Risk Mitigation

### High Risk Areas
1. **Notification system** - Used throughout app
   - **Mitigation**: Thorough testing of all notification scenarios
   - **Rollback plan**: Keep react-hot-toast as fallback

2. **Button event handlers** - Many interactive elements
   - **Mitigation**: Migrate incrementally, test each page
   - **Rollback plan**: Git branches for each phase

3. **Table responsiveness** - Complex data display
   - **Mitigation**: Test on multiple screen sizes
   - **Rollback plan**: Keep native tables temporarily

### Breaking Changes
None expected. All migrations maintain existing functionality while improving consistency.

---

## Success Criteria

1. ✅ Zero native `<button>` elements in codebase
2. ✅ Zero native `<table>` elements in codebase
3. ✅ react-hot-toast completely removed
4. ✅ Consistent typography across all pages
5. ✅ All shadcn/ui components properly imported
6. ✅ Component documentation updated
7. ✅ All tests passing
8. ✅ No TypeScript errors
9. ✅ Lighthouse accessibility score > 95
10. ✅ Mobile and desktop testing complete

---

## File-by-File Migration Checklist

### Notifications (Phase 2)
- [ ] `src/App.tsx` - Replace Toaster
- [ ] `src/lib/notifications.ts` - Replace toast API
- [ ] Test all notification scenarios

### Tables (Phase 3)
- [ ] `src/components/PortfolioView.tsx` - Balances table
- [ ] `src/components/ConfigView.tsx` - Config table

### Buttons (Phase 4)
- [ ] `src/components/SwapView.tsx` - Swap direction button
- [ ] `src/components/ActivityView.tsx` - Refresh + transaction buttons
- [ ] `src/components/PoolsView.tsx` - Filter + pool buttons
- [ ] `src/components/PortfolioView.tsx` - Refresh button
- [ ] `src/components/ConfigView.tsx` - Namespace buttons
- [ ] `src/components/NetworkStatus.tsx` - Status button
- [ ] `src/components/RestartButton.tsx` - Restart button
- [ ] `src/App.tsx` - Navigation + modal buttons

### Typography (Phase 5)
- [ ] All CardTitle elements
- [ ] All modal headers
- [ ] All section headers
- [ ] All helper text

---

## Dependencies

**To Install:**
- `sonner` - Toast notifications
- No additional dependencies needed (shadcn uses existing Radix UI)

**To Remove:**
- `react-hot-toast` - After Sonner migration complete

**Keep:**
- All existing shadcn/ui dependencies
- `@radix-ui/*` packages
- `class-variance-authority`
- `clsx` / `tailwind-merge`

---

## Notes

1. **Custom wrappers are OK**: BaseModal, ActionButtons, FormField provide good DX and are built on shadcn/ui
2. **EmptyState/LoadingState are OK**: These are application-specific and don't have shadcn equivalents
3. **Focus on consistency**: Use shadcn Button variants consistently (don't mix with native buttons)
4. **Typography is guidelines**: shadcn typography is more of a pattern guide than components
5. **Test incrementally**: Each phase should be tested before moving to next
6. **Git branches**: Use feature branches for each phase for easy rollback

---

## Reference Links

- [shadcn/ui Components](https://ui.shadcn.com/docs/components)
- [shadcn/ui Button](https://ui.shadcn.com/docs/components/button)
- [shadcn/ui Table](https://ui.shadcn.com/docs/components/table)
- [shadcn/ui Sonner](https://ui.shadcn.com/docs/components/sonner)
- [shadcn/ui Typography](https://ui.shadcn.com/docs/components/typography)
- [shadcn/ui Dialog](https://ui.shadcn.com/docs/components/dialog)
- [shadcn/ui Form](https://ui.shadcn.com/docs/components/form)

---

**Plan Created:** 2025-11-18
**Target Completion:** 4 weeks
**Status:** Ready for implementation
