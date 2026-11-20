# Accessibility check (static)

Run: `npm run a11y` (eslint-plugin-jsx-a11y recommended rules, 19 files under `src/app/admin/federal`).

Result: PASS, 0 error(s), 1 warning(s).

- src/app/admin/federal/_components/Lang.tsx:23 `null` '// eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount to avoid a hydration mismatch' has no effect because you have 'noInlineConfig' setting in your config.

Scope and limits: this is a static JSX check (alt text, form labels, ARIA validity, roles, keyboard handlers).
It does not run in a browser, so it cannot check colour contrast, focus order, RTL layout or screen-reader output.
Those need a manual pass (or axe in a browser, which is not installed here).
