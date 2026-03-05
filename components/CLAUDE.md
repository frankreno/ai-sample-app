# Components — Conventions

Reusable UI components live here. The main page (`app/page.tsx`) is the SPA entry point.

## General Patterns

- All components are client components — include `"use client"` directive
- Props are defined via TypeScript interfaces (named `Props` by convention)
- Components are named exports, not default exports

## State Management

The parent page (`app/page.tsx`) owns all state. Components receive data and callbacks via props:

```typescript
interface Props {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}
```

Components never fetch data directly — they call callbacks that trigger re-fetches in the parent.

## Styling

- **Tailwind CSS v4** — utility classes only, no separate CSS files per component
- **Color palette:** stone (neutrals) + orange (accent). Severity and status have dedicated color maps.
- **Style maps** are defined in `types/index.ts` and imported where needed:
  - `SEVERITY_STYLES` — maps severity names to Tailwind class strings (e.g., `"bg-red-600 text-white"`)
  - `STATUS_STYLES` — maps status names to Tailwind class strings with borders
- Keep the same visual language: rounded corners (`rounded-lg`/`rounded-xl`), subtle shadows (`shadow-sm`), stone borders

## Existing Components

- **`SeverityBadge`** — renders a colored pill for a severity value. Uses `SEVERITY_STYLES` map.
- **`StatusBadge`** — renders a status pill with optional click-to-cycle. Accepts `onClick` and `loading` props.
- **`NewDeficiencyModal`** — full-screen modal overlay with a form for creating deficiencies. Handles photo upload as a separate POST after creation.
