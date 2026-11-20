import assert from "node:assert/strict";
import test from "node:test";
import { checkCitizenMessage, draftCitizenMessage } from "../src/lib/un/citizen-message.ts";
import { AR, gateKeys, tr, verdictKeys } from "../src/lib/un/i18n/dict.ts";
import { addStepMetering, estimatedWh, totalTokens } from "../src/lib/un/metering.ts";

test("every verdict and gate has an Arabic label; unknown keys fall back to English", () => {
  for (const k of [...verdictKeys(), ...gateKeys()]) assert.ok(AR[k], k);
  assert.equal(tr("ar", "no.such.key", "Fallback"), "Fallback");
  assert.equal(tr("en", "verdict.NO_GO", "NO GO"), "NO GO");
  assert.notEqual(tr("ar", "verdict.NO_GO", "NO GO"), "NO GO");
});

test("citizen message: a filled Arabic draft passes all three checks", () => {
  const r = checkCitizenMessage(draftCitizenMessage("هيئة الخدمات", "800 1234"), "ar");
  assert.equal(r.ok, true, JSON.stringify(r.checks));
});

test("citizen message: placeholder contact, missing disclosure and wrong language fail", () => {
  const draft = draftCitizenMessage("هيئة الخدمات", "[contact]");
  assert.equal(checkCitizenMessage(draft, "ar").checks.find((c) => c.id === "human_route")!.ok, false);
  const noAi = "مرحبًا بكم. للتحدث مع موظف اتصل على 800 1234.";
  assert.equal(checkCitizenMessage(noAi, "ar").checks.find((c) => c.id === "ai_disclosure")!.ok, false);
  const en = draftCitizenMessage("Dept", "800 1234", "en");
  assert.equal(checkCitizenMessage(en, "ar").checks.find((c) => c.id === "language")!.ok, false);
  assert.equal(checkCitizenMessage(en, "en").ok, true);
  assert.equal(checkCitizenMessage("", "ar").ok, false);
});

test("metering sums usage, counts calls with no usage block, and the energy is tokens x the constant", () => {
  const m = addStepMetering(undefined, [{ prompt_tokens: 1000, completion_tokens: 500 }, undefined], 1.5);
  const m2 = addStepMetering(m, [], 0.25);
  assert.equal(m2.llm_calls, 2);
  assert.equal(m2.calls_without_usage, 1);
  assert.equal(totalTokens(m2), 1500);
  assert.equal(m2.wall_seconds, 1.75);
  assert.equal(estimatedWh(m2, 1), 1.5);
});
