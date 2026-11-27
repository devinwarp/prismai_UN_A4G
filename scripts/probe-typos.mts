import { DEFAULT_REACT_CONFIG } from "../src/lib/un/react-config.ts";
import { runQuestions } from "../src/lib/un/tuning-bank.ts";
import { searchSop } from "../src/lib/un/sop-kb.ts";
const retrieve = async (q: string, kind?: string) => (await searchSop("SOP-LIC-014", q, { k: 5, kind })).hits;
const ex = { chunks: ["SOP-LIC-014#Q5", "SOP-LIC-014#R6", "SOP-LIC-014#T04"] };
const qs = ["Is an excepsoin posible for my expierd licence?", "Can the authority grant an excepsion once the grace period has finished?", "Does the verificaton analyst escalat a blocked renewel?", "Is an excepsion posible after my licence expierd?"].map((question, i) => ({ id: `t${i}`, split: "tune" as const, question, expect: ex }));
for (const r of await runQuestions("SOP-LIC-014", DEFAULT_REACT_CONFIG, qs, retrieve)) console.log(r.id, r.verdict, r.status);
