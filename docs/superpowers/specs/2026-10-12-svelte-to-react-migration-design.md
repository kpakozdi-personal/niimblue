# Svelte to React migration (Vite, shadcn/ui)

Status: draft for review. Date: 2026-10-12.

## Goal

Replace the Svelte 5 + Bootstrap UI with React + Vite + shadcn/ui while keeping every feature and behavior: same printer and canvas logic, same persisted data, same locales.

## Decisions (agreed)

- **Visual target:** shadcn-native look, re-tinted with the current palette (cool gray, one desaturated blue accent). Layout and behavior match today's app; pixel fidelity is not a goal. The app stays dark-only.
- **Verification:** Playwright smoke suite written against the Svelte app first, then run against React.
- **Strategy:** side-by-side. A second Vite entry (`react.html`) is built next to the Svelte one; Svelte stays the default until parity is proven, then it is deleted in one revertable PR.
- **Context:** fork-only (`kpakozdi-personal/niimblue`). Upstream (MultiMote) stays on Svelte; see Consequences.

## Out of scope

- New features, UI rethinks beyond what shadcn components imply.
- Changes to the persisted data format (`localStorage` keys, zod schemas, label export JSON).
- Changes to `@mmote/niimbluelib` or the printer protocol.

## Current state (facts)

- 36 Svelte components, about 4.9k lines; about 5.8k lines of TS. No tests.
- Largest components: `PrintPreview` (731), `LabelDesigner` (652), `LabelPropsEditor` (514), `PrinterConnector` (337).
- Svelte-specific TS: only `stores.ts`, `i18n.ts`, `persistence.ts`, `file_utils.ts` import `svelte/store`; `index.ts` calls `mount`.
- `$tr` is used 242 times; `$printerClient` 30; `$appConfig` 14.
- Bootstrap CSS and JS are deeply used: 118 `.btn`, 50 `.input-group`, about 15 dropdown menus (most with `data-bs-auto-close="outside"`, so they are popovers holding forms), one `AppModal` wrapper used by 7 `bind:show` sites, 2 collapses.
- Icons: Material Icons font through `MdIcon`; `IconPicker` stores codepoints inside saved labels.
- 21 locale dictionaries, hand-rolled `tr` store.
- Build outputs also feed `standalone-apps/capacitor` and `standalone-apps/tauri-windows` (`vite build --base=./`).
- Svelte references outside `src`: `Dockerfile`, `.github/workflows/check.yml`, `.gitea/workflows/deploy-to-server.yml`, `CONTRIBUTING.md`, `eslint.config.js`, `.prettierrc`, `svelte.config.js`, `.fallowrc.json` (review).

## 1. Architecture and layout

```
index.html            Svelte entry (unchanged until cutover)
react.html            React entry (new)
src/                  shared, framework-agnostic: fabric-object, utils, defaults, types, locale, stores
src/svelte/           existing Svelte tree (App, components, index.ts), moved in one mechanical commit
src/react/            main.tsx, App.tsx, components/ui (shadcn), components/*, hooks/, styles.css
e2e/                  Playwright suite, run against both entries
```

- `src/react` and `src/svelte` may import the shared layer; never each other.
- Tailwind v4 and shadcn tokens load only from `src/react/styles.css`; the Svelte entry keeps Bootstrap/SCSS, so the two never clash.
- One `vite.config.ts` with `svelte()` and `@vitejs/plugin-react` (+ `@tailwindcss/vite`); `build.rollupOptions.input` lists both HTML files. Existing `manualChunks`, `define`, `alias` (`$/*`) and `preserveSymlinks` stay. Add `@/*` -> `src/react` for shadcn.
- `LabelDesigner` owns the `CustomCanvas` in a ref; canvas and undo logic stay imperative, React mirrors selection and undo state.
- The existing branch preview deploy serves both entries (`<branch>.niimblue.pkzd.hu/react.html`).

## 2. Shared state, i18n, Svelte-to-React mapping

- `src/react/hooks/useStore.ts`: `useSyncExternalStore(store.subscribe, () => get(store))` over the existing store contract. Store files are unchanged until the post-cutover swap.
- Plain TS keeps calling `get(appConfig)` / `.set()`. `printerClient` keeps holding the mutable client instance; event handlers keep writing to stores; React only subscribes.
- Persistence unchanged (`writablePersisted`, same keys and schemas).
- `useTr()` returns the same lookup as the `tr` store and re-renders on locale change. Dictionaries, `guessBrowserLanguage` and the storage key are unchanged.

| Svelte | React |
|---|---|
| `$state`, `$derived` | `useState`, expression / `useMemo` |
| `$effect`, `onMount`/`onDestroy` | `useEffect` with cleanup |
| `$props`, `$bindable` | props; `value` + `onChange` for the 37 `bind:value` |
| `bind:show` | shadcn `Dialog` `open` / `onOpenChange` |
| snippets | `children`, `footer` prop |
| `bind:this` | `useRef` |
| `{#if}`, `{#each}` | `&&`, `.map` with stable keys |

Pitfalls:
- **StrictMode double effects:** fabric canvas init must be idempotent with `dispose()` in cleanup. Highest-risk spot of the port.
- **Imperative handles:** `AppModal.hide()` and similar become `useImperativeHandle` or are replaced by controlled `open`.
- **Toasts:** `Toasts` stays shared and keeps calling Toastify until cutover; then it is switched to sonner's imperative `toast()` in that single file.

## 3. Bootstrap to shadcn mapping

Setup: `@vitejs/plugin-react`, `tailwindcss` + `@tailwindcss/vite`, `npx shadcn init`, Radix primitives (not Base UI), `class="dark"` on `<html>`. Palette from SCSS vars (`#121418` base, `#1f2229` surface, blue accent) moves into shadcn CSS variables.

| Bootstrap | shadcn |
|---|---|
| `.btn` variants, `-sm` | `Button` default / secondary / outline / destructive / ghost; dock = ghost, Print = filled |
| `.input-group`, `.input-group-text` | `InputGroup`, `InputGroupAddon`, `InputGroupInput` |
| `.form-control`, `.form-select` | `Input`, `Select` (non-native: check empty values and keyboard per use) |
| `.form-check`, `.form-switch`, `.form-range` | `Checkbox`, `Switch`, `Slider` |
| `.btn-check` groups, `.btn-group` | `ToggleGroup` (single) |
| `.dropdown` with auto-close "outside" | `Popover` |
| `.dropdown-item` / header | `DropdownMenu` |
| `.collapse` | `Collapsible` |
| `.modal` (`AppModal`) | `Dialog` |
| `.progress`, `.alert`, `.card` | `Progress`, `Alert`, `Card` |
| Material Icons | `MdIcon` ported unchanged |

Behavior risks:
- Global hotkeys (Esc, Ctrl+Z/Y, Ctrl+Shift+Z, Ctrl+D, arrows) and `isAnyInputFocused` vs Radix focus traps and portals; covered by e2e.
- `LabelDesigner` closes Bootstrap dropdowns manually (`[data-bs-toggle='dropdown']`); replace with controlled popover state or drop if Radix outside-click covers it.
- No Tooltip layer; keep `title` / `aria-label`.

## 4. Playwright parity suite (phase 1, on the Svelte app)

- `playwright.config.ts` projects `svelte` (`/`) and `react` (`/react.html`); chromium only; `localStorage.locale = "en"` seeded.
- Selectors: roles, labels, text. Add `aria-label` to both apps where a control has no accessible name; no test IDs.
- CI: `vite build` + `vite preview`; locally the dev server.

Coverage (about 20 tests):
1. Loads with no console errors.
2. Add each object type (text, rect, circle, line, QR, barcode, ArUco); edit text, QR, barcode params.
3. Select, arrow-move, Ctrl+D clone, delete, undo/redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z).
4. Label props (size, orientation, DPI) and presets browser.
5. Saved labels (save / load / delete) and JSON export / import.
6. CSV load, variable insert, per-row preview.
7. Print preview: open, switch algorithms, dimensions, close.
8. Language switch persists across reload.
9. Icon picker, font picker, font import.
10. Hotkeys from (3) with a popover or dialog open.

Key checks:
- **Data compatibility:** a fixture `localStorage` snapshot created by Svelte loads in both entries with the same object counts and key set.
- **Raster identity:** for a fixture label, the print-preview bitmap hash is identical in both entries.
- No visual snapshots (look is allowed to change).

Printer I/O: spike a fake `navigator.serial` port (`addInitScript`) answering only the handshake and print packets `niimbluelib` needs. If too heavy, connect and print move to a manual hardware checklist that gates cutover.

## 5. Rollout and cutover

PR sequence (each mergeable to `main`; Svelte remains default):
1. Playwright suite, green on Svelte.
2. Move Svelte to `src/svelte`; add React foundation, `useStore`, `useTr`.
3. Component PRs bottom-up: primitives (`MdIcon`, `AppModal`/`Dialog`, `ColorSelect`), designer controls, then `PrintPreview`, `LabelDesigner`, `PrinterConnector`, `MainPage`.
4. Cutover.
5. Store swap to zustand (follow-up PR), removing the last `svelte/store` use.

Cutover gate (all required): e2e `react` project as green as `svelte`; manual hardware checklist passed (USB + Bluetooth connect, print, firmware updater, RFID info); side-by-side preview review.

Cutover PR (one revertable change, after tagging `svelte-final`):
- `react.html` -> `index.html`; delete `src/svelte`, `svelte.config.js`.
- Remove `svelte`, `@sveltejs/vite-plugin-svelte`, `svelte-check`, `eslint-plugin-svelte`, `prettier-plugin-svelte`, `bootstrap`, `@popperjs/core`, `@types/bootstrap`, and `sass` if unused.
- `toasts.ts` -> sonner.
- Tooling: `sv-check` -> `typecheck` (`tsc --noEmit`); ESLint uses `eslint-plugin-react-hooks`; Prettier without the Svelte plugin; `format-all` globs `*.tsx`; review `.fallowrc.json`.
- Update `Dockerfile`, `.github/workflows/check.yml`, `.gitea/workflows/deploy-to-server.yml`, `CONTRIBUTING.md`, README, CHANGELOG.
- e2e job stays in `check.yml`, `react` project only.
- Standalone apps: keep `vite build --base=./` working with relative asset paths; run the Android and Tauri workflows on the cutover PR (cannot be verified locally).

Rollback: revert the cutover PR, or check out `svelte-final`.

## Consequences

- After cutover, upstream MultiMote changes to Svelte files must be ported by hand. Changes to the shared TS layer still merge normally.
- Two UI trees coexist in the repo between phases 2 and 4.

## Open items for the plan

- Result of the fake-serial spike (decides how much of connect/print is automated).
- Radix `Select` vs native `<select>` for long option lists (font family) — decide when porting `FontFamilyPicker`.
- Whether `sass` is still needed after Bootstrap removal (`font.scss` check).
