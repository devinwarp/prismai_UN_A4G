import type { ReactNode } from "react";
import type { SetupProgress, SetupState, SetupStepId } from "@/lib/un/setup-progress";
import { T } from "./Lang";

// The shell of one setup step and the bar that shows all five. The state is always a word and a drawn icon, never a colour alone.
// Pine marks a step that is done or open; a locked step is quiet, and ember is not used here (a locked step is not a failure).

const STATE_WORD: Record<SetupState, ReactNode> = {
  done: <T k="su.state.done" en="Done" />,
  current: <T k="su.state.current" en="Next" />,
  locked: <T k="su.state.locked" en="Locked" />,
};

export const STEP_TITLE: Record<SetupStepId, ReactNode> = {
  country: <T k="su.country" en="Country setup" />,
  goals: <T k="su.goals" en="Entity goals and measures" />,
  cases: <T k="su.cases" en="Use cases" />,
  targets: <T k="su.targets" en="Process targets" />,
  sop: <T k="su.sop" en="SOP intake" />,
};

export function StateIcon({ state }: { state: SetupState }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "shrink-0" };
  if (state === "done") return <svg {...common}><circle cx="8" cy="8" r="6.25" /><path d="M5.2 8.2l2 2 3.6-4" /></svg>;
  if (state === "current") return <svg {...common}><circle cx="8" cy="8" r="6.25" /><circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" /></svg>;
  return <svg {...common}><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5.5a2.5 2.5 0 015 0V7" /></svg>;
}

const tone = (state: SetupState) => (state === "locked" ? "text-ink-soft" : "text-lit-deep");

/** The five steps, in order, with how far each has got. Each is a link to its section on the same page. */
export function SetupBar({ progress, counts, hrefFor = (id) => `#step-${id}`, dense = false }: { progress: SetupProgress; counts: Partial<Record<SetupStepId, string>>; hrefFor?: (id: SetupStepId) => string; dense?: boolean }) {
  return (
    <nav aria-label="Setup steps" className={dense ? "min-w-0" : "rounded-xl border border-line bg-card px-3 py-2.5"}>
      <ol className="grid gap-2 md:grid-cols-5 md:gap-3">
        {progress.steps.map((s) => (
          <li key={s.id} aria-current={s.state === "current" ? "step" : undefined} className={`relative min-w-0 rounded-lg border px-2.5 py-2 ${s.state === "current" ? "border-lit bg-paper ring-1 ring-lit" : s.state === "done" ? "border-lit/50 bg-lit-soft/50" : "border-line bg-paper"}`}>
            <a href={hrefFor(s.id)} className="block min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lit">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{s.n}. {STEP_TITLE[s.id]}</span>
              </span>
              <span className={`mt-0.5 flex items-center gap-1.5 text-xs ${tone(s.state)}`}>
                <StateIcon state={s.state} />
                <span className={s.state === "current" ? "font-medium" : ""}>{STATE_WORD[s.state]}</span>
                {counts[s.id] && s.state !== "locked" && <span className="font-mono text-[11px] text-ink-soft">· {counts[s.id]}</span>}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** One step. Locked: no controls, only what it waits for. Open: the controls. Done: a summary, and the controls behind a disclosure. */
export default function SetupSection({ id, n, state, summary, waitingFor, openWhenDone = false, children }: {
  id: SetupStepId; n: number; state: SetupState; summary: ReactNode; waitingFor: ReactNode; openWhenDone?: boolean; children: ReactNode;
}) {
  return (
    <section id={`step-${id}`} aria-labelledby={`step-${id}-h`} className={`scroll-mt-4 rounded-xl border bg-card p-4 ${state === "current" ? "border-lit" : state === "done" ? "border-lit/40" : "border-line"} ${state === "locked" ? "bg-paper" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`step-${id}-h`} className="font-display text-2xl font-medium">{n}. {STEP_TITLE[id]}</h2>
        <span className={`inline-flex items-center gap-1.5 text-sm ${tone(state)}`}><StateIcon state={state} />{STATE_WORD[state]}</span>
      </div>
      {state === "locked" ? (
        <p className="mt-2 text-sm text-ink-soft">{waitingFor}</p>
      ) : state === "done" ? (
        <>
          <div className="mt-2 text-sm text-ink-soft">{summary}</div>
          <details className="mt-3" open={openWhenDone}>
            <summary className="w-fit cursor-pointer text-sm font-medium underline decoration-line underline-offset-4 hover:decoration-ink"><T k="su.change" en="Review or change" /></summary>
            <div className="mt-3">{children}</div>
          </details>
        </>
      ) : (
        <>
          <div className="mt-2 max-w-[68ch] text-sm text-ink-soft">{summary}</div>
          <div className="mt-4">{children}</div>
        </>
      )}
    </section>
  );
}
