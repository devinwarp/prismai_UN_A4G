import { SEED_QUESTIONS, runQuestions } from "../src/lib/un/tuning-bank.ts";
import { DEFAULT_REACT_CONFIG as DEFAULT_REACT } from "../src/lib/un/react-config.ts";
import { searchSop } from "../src/lib/un/sop-kb.ts";
const retrieve = async (q: string, kind?: string) => (await searchSop("SOP-LIC-014", q, { k: 5, kind })).hits;
const ex = { chunks: ["SOP-LIC-014#Q5", "SOP-LIC-014#R6", "SOP-LIC-014#T04"] };
const qs = [...SEED_QUESTIONS.filter((q) => q.id === "q02"), { id: "q30", split: "tune" as const, question: "Is an excepsion possible for my expired licence?", expect: ex }, { id: "q31", split: "holdout" as const, question: "Who decides whether an excepsion is possible outside the grace period?", expect: ex }];
for (const r of await runQuestions("SOP-LIC-014", DEFAULT_REACT, qs, retrieve)) console.log(r.id, r.verdict, r.status);
