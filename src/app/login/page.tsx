"use client";

import gsap from "gsap";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import DigiCubeMark from "@/components/DigiCubeMark";
import PrismMark from "@/components/PrismMark";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-reveal]",
        { y: 18, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          stagger: 0.1,
          ease: "power3.out",
        },
      );
    }, root);
    return () => ctx.revert();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
    router.push("/auth/continue");
  }

  const labelCls =
    "block font-mono text-[11px] tracking-[0.2em] text-ink-soft uppercase";
  const inputCls =
    "w-full rounded-xl border border-line bg-card/70 px-4 py-3 text-base outline-none transition-colors focus:border-lit focus:ring-1 focus:ring-lit";

  return (
    <div ref={root} className="paper-bg flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
        <Link href="/" className="flex items-center gap-2.5">
          <PrismMark />
          <span className="font-mono text-sm tracking-widest uppercase">
            Prism
          </span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-md">
          <p
            data-reveal
            className="font-mono text-xs tracking-[0.25em] text-ink-soft uppercase"
          >
            Admin sign in
          </p>
          <h1
            data-reveal
            className="font-display mt-4 text-4xl font-medium tracking-tight"
          >
            Welcome back.
          </h1>
          <p data-reveal className="mt-4 text-sm leading-relaxed text-ink-soft">
            Sign in to the federal AI governance dashboard.
          </p>
          <form data-reveal onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label htmlFor="login-email" className={labelCls}>
                Admin email
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="login-password" className={labelCls}>
                  Password
                </label>
              </div>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className={inputCls}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-ember">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </main>

      <footer className="flex justify-center pb-8">
        <DigiCubeMark />
      </footer>
      <ThemeSwitcher />
    </div>
  );
}
