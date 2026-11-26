"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lang } from "@/lib/un/i18n/dict";
import { track } from "@/lib/track";

export const SIGN_IN_COPY = {
  en: {
    title: "Sign in to Prism",
    judgeLead: "Judges: skip the form",
    judge: "Enter as a judge (read-only)",
    judgeBusy: "Opening the demo…",
    judgeNote: "No typing. Read-only, synthetic data. Nothing you do changes anything.",
    judgeFailed: "The one-click entry is not available right now. Watch the replay, or sign in below.",
    or: "or sign in with an account",
    email: "Email",
    password: "Password",
    show: "Show",
    hide: "Hide",
    submit: "Sign in",
    busy: "Signing in…",
    emailEmpty: "Enter your email address.",
    emailBad: "That does not look like an email address. Check for a missing @ or dot.",
    passEmpty: "Enter your password.",
    badCreds: "That email and password do not match. Check both and try again.",
    network: "Could not reach the sign-in service. Check your connection and try again.",
    trust: "Demo data is synthetic. Judge access is read-only.",
  },
  ar: {
    title: "تسجيل الدخول إلى بريزم",
    judgeLead: "للمحكّمين: تخطَّ النموذج",
    judge: "ادخل كمحكّم (للقراءة فقط)",
    judgeBusy: "جارٍ فتح العرض…",
    judgeNote: "بلا كتابة. للقراءة فقط وببيانات اصطناعية. لا شيء تفعله يغيّر أي بيانات.",
    judgeFailed: "الدخول بنقرة واحدة غير متاح الآن. شاهد إعادة العرض أو سجّل الدخول أدناه.",
    or: "أو سجّل الدخول بحساب",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    show: "إظهار",
    hide: "إخفاء",
    submit: "تسجيل الدخول",
    busy: "جارٍ تسجيل الدخول…",
    emailEmpty: "أدخل بريدك الإلكتروني.",
    emailBad: "لا يبدو هذا بريدًا إلكترونيًا. تحقق من وجود @ ونقطة.",
    passEmpty: "أدخل كلمة المرور.",
    badCreds: "البريد وكلمة المرور غير متطابقين. تحقق منهما وحاول مجددًا.",
    network: "تعذر الوصول إلى خدمة الدخول. تحقق من اتصالك وحاول مجددًا.",
    trust: "بيانات العرض اصطناعية. دخول المحكّمين للقراءة فقط.",
  },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const input = "block w-full rounded-lg border bg-card px-4 py-3 text-base text-ink outline-none focus:border-lit focus:ring-1 focus:ring-lit";

/**
 * The sign-in form, shared by the /login page and the sign-in dialog on the landing page. `data-autofocus` marks the field a dialog should focus when
 * it opens; the page itself focuses it on load (`focusOnMount`).
 */
export default function SignInForm({ lang, judge, judgeFailed = false, focusOnMount = false }: { lang: Lang; judge: boolean; judgeFailed?: boolean; focusOnMount?: boolean }) {
  const c = SIGN_IN_COPY[lang];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const emailErr = !touched.email ? null : !email.trim() ? c.emailEmpty : !EMAIL_RE.test(email.trim()) ? c.emailBad : null;
  const passErr = touched.password && !password ? c.passEmpty : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setError(null);
    if (!EMAIL_RE.test(email.trim()) || !password) return;
    setLoading(true);
    track("login_submit");
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setLoading(false);
        setError(/invalid login|credentials/i.test(error.message) ? c.badCreds : error.message);
        return;
      }
      router.push("/auth/continue");
    } catch {
      setLoading(false);
      setError(c.network);
    }
  }

  return (
    <>
      {judge && (
        <div className="mt-6">
          <p className="text-sm font-medium">{c.judgeLead}</p>
          <a
            href="/api/judge-login"
            data-autofocus
            autoFocus={focusOnMount}
            aria-busy={judgeBusy}
            onClick={() => { setJudgeBusy(true); track("judge_login"); }}
            className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-lit-deep px-5 text-base font-medium text-paper hover:opacity-90"
          >
            {judgeBusy ? c.judgeBusy : c.judge}
          </a>
          <p className="mt-2 text-sm text-ink-soft">{c.judgeNote}</p>
          <p className="mt-6 flex items-center gap-3 text-sm text-ink-soft"><span className="h-px flex-1 bg-line" />{c.or}<span className="h-px flex-1 bg-line" /></p>
        </div>
      )}
      {judgeFailed && <p role="alert" className="mt-4 text-sm font-medium text-ember">{c.judgeFailed}</p>}

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1 block text-sm font-medium">{c.email}</label>
          <input
            id="login-email" type="email" autoComplete="email" inputMode="email" dir="ltr"
            data-autofocus={judge ? undefined : true}
            autoFocus={focusOnMount && !judge}
            value={email} onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={!!emailErr} aria-describedby={emailErr ? "email-err" : undefined}
            className={`${input} ${emailErr ? "border-ember" : "border-line"}`}
          />
          {emailErr && <p id="email-err" className="mt-1 text-sm text-ember">{emailErr}</p>}
        </div>
        <div>
          <label htmlFor="login-password" className="mb-1 block text-sm font-medium">{c.password}</label>
          <div className="relative">
            <input
              id="login-password" type={show ? "text" : "password"} autoComplete="current-password" dir="ltr"
              value={password} onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={!!passErr} aria-describedby={passErr ? "pass-err" : undefined}
              className={`${input} pe-20 ${passErr ? "border-ember" : "border-line"}`}
            />
            <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} className="absolute inset-y-0 end-0 px-4 text-sm font-medium text-ink-soft hover:text-ink">
              {show ? c.hide : c.show}
            </button>
          </div>
          {passErr && <p id="pass-err" className="mt-1 text-sm text-ember">{passErr}</p>}
        </div>
        {error && <p role="alert" className="text-sm font-medium text-ember">{error}</p>}
        <button type="submit" disabled={loading} className={`inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-base font-medium disabled:opacity-60 ${judge ? "border border-ink text-ink hover:bg-paper-deep" : "bg-lit-deep text-paper hover:opacity-90"}`}>
          {loading ? c.busy : c.submit}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink-soft">{c.trust}</p>
    </>
  );
}
