# Accessibility check (static)

Run: `npm run a11y` (eslint-plugin-jsx-a11y recommended rules, 43 files under `src/app/admin/federal`).

Result: PASS, 0 error(s), 0 warning(s).


Scope and limits: this is a static JSX check (alt text, form labels, ARIA validity, roles, keyboard handlers).
It does not run in a browser, so it cannot check colour contrast, focus order, RTL layout or screen-reader output.
Those need a manual pass (or axe in a browser, which is not installed here).
