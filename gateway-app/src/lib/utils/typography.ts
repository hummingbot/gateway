/**
 * Typography utility classes following shadcn/ui patterns
 * Based on https://ui.shadcn.com/docs/components/typography
 */

export const typography = {
  // Page/Section Titles
  h1: "scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl",
  h2: "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0",
  h3: "scroll-m-20 text-2xl font-semibold tracking-tight",
  h4: "scroll-m-20 text-xl font-semibold tracking-tight",

  // Card/Component Titles (smaller, for UI components)
  cardTitle: "text-lg font-semibold leading-none tracking-tight",
  cardDescription: "text-sm text-muted-foreground",

  // Body Text
  lead: "text-xl text-muted-foreground",
  body: "leading-7 [&:not(:first-child)]:mt-6",
  large: "text-lg font-semibold",
  small: "text-sm font-medium leading-none",
  muted: "text-sm text-muted-foreground",

  // Lists and Inline Elements
  list: "my-6 ml-6 list-disc [&>li]:mt-2",
  inlineCode: "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",

  // Labels and Form Text
  label: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
  helperText: "text-xs text-muted-foreground",
  errorText: "text-xs text-destructive",
} as const;

/**
 * Helper function to combine typography classes with custom classes
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
