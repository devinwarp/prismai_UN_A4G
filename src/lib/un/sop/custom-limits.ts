// Limits on a custom SOP and its job profiles. Kept apart from custom.ts, which reads the SOP analyzer (and so node:fs), so a client component can import them.
export const MAX_PROFILES = 20;
export const MAX_TASKS = 30;
export const MAX_SOP_CHARS = 200_000;
