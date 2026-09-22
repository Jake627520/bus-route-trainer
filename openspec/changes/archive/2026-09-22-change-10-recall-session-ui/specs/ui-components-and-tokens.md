# Specification: UI Components, Tokens & Accessibility (Change 10)

## 1. Design System & Styling Tokens

### 1.1 Styling Foundations
The application utilizes **Tailwind CSS v4** with CSS variables defined in `src/app/globals.css`:
- Background / Foreground: Light mode (`#ffffff` / `#171717`), Dark mode (`#0a0a0a` / `#ededed`).
- Typography: `Geist Sans` (`var(--font-geist-sans)`), `Geist Mono` (`var(--font-geist-mono)`).
- Semantic Palettes:
  - **Primary / Brand**: Queensland Transit Slate/Blue (`#0284c7` / `#0369a1`)
  - **Success**: Emerald (`#10b981` / `#059669`)
  - **Destructive / Error**: Rose/Red (`#ef4444` / `#dc2626`)
  - **Warning**: Amber (`#f59e0b` / `#d97706`)
  - **Muted / Card Surfaces**: Slate/Zinc (`#f4f4f5` / `#27272a`)

---

## 2. Reusable Component Primitives

The practice interface will rely on modular primitives placed under `src/components/ui/`:

1. **Button (`Button.tsx`)**:
   - Variants: `primary`, `secondary`, `destructive`, `ghost`.
   - Sizes: `sm`, `md`, `lg` (large touch targets >= 48px for mobile driver ergonomics).
   - States: `default`, `hover`, `active`, `disabled`, `loading` (with inline SVG spinner).
2. **Card (`Card.tsx`)**:
   - Elevated and bordered container for prompt cards and feedback panels.
3. **Badge (`Badge.tsx`)**:
   - Recall Mode badges:
     - `NEXT_STOP_FORWARD` (Blue: "Next Stop")
     - `STOP_NAME_RECOGNITION` (Purple: "Station Identification")
   - SRS Outcome badges:
     - `PASS` (Green: "Correct")
     - `FAIL` (Red: "Incorrect")
     - `REPLAY` (Gray: "Duplicate Attempt")
4. **Modal / Dialog (`Modal.tsx`)**:
   - Accessible dialog for session abandonment confirmation.
   - Includes background backdrop, focus trapping, and ESC to dismiss.
5. **ProgressBar (`ProgressBar.tsx`)**:
   - Visual indicator showing `(promptIndex + 1) / totalCards` percentage progress.
6. **TextInput (`TextInput.tsx`)**:
   - High-contrast text input with explicit label, placeholder, and error states.

---

## 3. Screen Layout & Mobile Responsiveness

Queensland bus drivers often review routes on tablets or phones during layovers or at transit depots.

- **Viewport Constraints**: Must be fully operational on viewports down to 360px width.
- **Touch Ergonomics**: All interactive elements (buttons, inputs) maintain at least 44x44px touch targets.
- **Card Sizing**: Centered container with max-width `max-w-2xl` on desktop, edge-to-edge with 16px margins on mobile.

---

## 4. Accessibility (a11y) Standards

1. **WCAG AA Compliance**: High contrast ratios (minimum 4.5:1 for normal text).
2. **ARIA Landmarks & Roles**:
   - `role="dialog"` and `aria-modal="true"` on abandon modal.
   - `aria-live="polite"` on feedback panels to announce evaluation results to screen readers.
   - `aria-valuenow`, `aria-valuemin`, and `aria-valuemax` on progress bars.
3. **Keyboard Navigation**:
   - Full tab sequence without trapped focus (except inside modal).
   - Enter triggers submission on text input.
   - Enter/Space advances to next prompt when viewing feedback.
