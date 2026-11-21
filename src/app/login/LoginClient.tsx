"use client";

import { Noto_Sans_Arabic } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PrismMark from "@/components/PrismMark";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { DIR, type Lang } from "@/lib/un/i18n/dict";
import { track } from "@/lib/track";

const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic" });

const COPY = {
  en: {
    back: "Back to the overview",
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
    replay: "Watch the replay instead",
    leftTitle: "Know when a government AI helper is safe to switch on, and prove it.",
    points: [
      "60 of 60 test runs reached the outcome the rules require.",
      "Every source the AI cited is a real passage from an official document.",
      "Each answer is signed in a logbook that shows any later edit.",
    ],
    lang: "العربية",
    langAria: "Switch to Arabic",
  },
  ar: {
    back: "العودة إلى الصفحة الرئيسية",
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
    replay: "شاهد إعادة العرض بدلًا من ذلك",
    leftTitle: "اعرف متى يكون مساعد الذكاء الاصطناعي الحكومي آمنًا للتشغيل، وأثبت ذلك.",
    points: [
      "60 من 60 تشغيلًا اختباريًا وصل إلى النتيجة التي تفرضها القواعد.",
      "كل مصدر استشهد به الذكاء الاصطناعي مقطع حقيقي من وثيقة رسمية.",
      "يُوقَّع كل جواب في سجل يكشف أي تعديل لاحق.",
    ],
    lang: "English",
    langAria: "التبديل إلى الإنجليزية",
  },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const input = "block w-full rounded-lg border bg-card px-4 py-3 text-base text-ink outline-none focus:border-lit focus:ring-1 focus:ring-lit";

export default function LoginClient({ judge, judgeFailed }: { judge: boolean; judgeFailed: boolean }) {
  const [lang, setLang] = useState<Lang>("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const c = COPY[lang];

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount to avoid a hydration mismatch
      if (localStorage.getItem("prism-un-lang") === "ar") setLang("ar");
    } catch {}
  }, []);

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

  const toggleLang = () => {
    const next: Lang = lang === "en" ? "ar" : "en";
    setLang(next);
    try { localStorage.setItem("prism-un-lang", next); } catch {}
  };

  return (
    <div dir={DIR[lang]} lang={lang} className={`paper-bg flex min-h-dvh flex-col ${arabic.variable} ${lang === "ar" ? "[&_*]:font-[family-name:var(--font-arabic)]" : ""}`}>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Prism">
          <PrismMark className="h-8 w-8" />
          <span className="font-display text-xl font-medium">{lang === "ar" ? "بريزم" : "Prism"}</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeSwitcher variant="inline" />
          <button type="button" onClick={toggleLang} aria-label={c.langAria} className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:border-ink-soft"><span lang={lang === "en" ? "ar" : "en"}>{c.lang}</span></button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-20 lg:py-12">
        <div className="order-2 lg:order-1">
          <h2 className="font-display text-3xl leading-tight font-medium text-balance lg:text-4xl">{c.leftTitle}</h2>
          <ul className="mt-6 max-w-[48ch]">
            {c.points.map((p, i) => (
              <li key={p} className="flex gap-3 border-t border-line py-3 text-ink-soft">
                <span className="font-mono text-xs leading-6">{i + 1}</span>{p}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link className="underline underline-offset-4" href="/">{c.back}</Link>
            <a className="underline underline-offset-4" href="/replay">{c.replay}</a>
          </p>
        </div>

        <div className="order-1 w-full max-w-md lg:order-2 lg:justify-self-end">
          <h1 className="font-display text-3xl font-medium">{c.title}</h1>

          {judge && (
            <div className="mt-6">
              <p className="text-sm font-medium">{c.judgeLead}</p>
              <a
                href="/api/judge-login"
                autoFocus
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
                autoFocus={!judge}
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
        </div>
      </main>
    </div>
  );
}
