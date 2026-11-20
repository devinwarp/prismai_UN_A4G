// Static accessibility check (npm run a11y): eslint-plugin-jsx-a11y recommended
// rules over the federal screens, with the plugin that eslint-config-next
// already installs. Writes docs/accessibility-check.md. Exit 1 on any error.
// This is a lint-style check of JSX (alt, labels, aria, roles, keyboard
// handlers). It does NOT replace axe in a browser, colour-contrast or a screen-reader pass.
import { ESLint } from "eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tsParser from "@typescript-eslint/parser";
import { writeFileSync } from "node:fs";

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.tsx"],
      linterOptions: { noInlineConfig: true }, // other rules' disable comments are not ours
      languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { "jsx-a11y": jsxA11y },
      rules: jsxA11y.flatConfigs.recommended.rules,
    },
  ],
});
const results = await eslint.lintFiles(["src/app/admin/federal/**/*.tsx"]);
const msgs = results.flatMap((r) => r.messages.map((m) => ({ file: r.filePath.replace(process.cwd() + "/", ""), ...m })));
const errors = msgs.filter((m) => m.severity === 2);

const lines = [
  "# Accessibility check (static)",
  "",
  `Run: \`npm run a11y\` (eslint-plugin-jsx-a11y recommended rules, ${results.length} files under \`src/app/admin/federal\`).`,
  "",
  `Result: ${errors.length === 0 ? "PASS" : "FAIL"}, ${errors.length} error(s), ${msgs.length - errors.length} warning(s).`,
  "",
  ...msgs.map((m) => `- ${m.file}:${m.line} \`${m.ruleId}\` ${m.message}`),
  "",
  "Scope and limits: this is a static JSX check (alt text, form labels, ARIA validity, roles, keyboard handlers).",
  "It does not run in a browser, so it cannot check colour contrast, focus order, RTL layout or screen-reader output.",
  "Those need a manual pass (or axe in a browser, which is not installed here).",
  "",
];
writeFileSync("docs/accessibility-check.md", lines.join("\n"));
console.log(lines.slice(4, 5).join(""), "-> docs/accessibility-check.md");
process.exit(errors.length ? 1 : 0);
