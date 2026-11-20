"use client";

import { useEffect, useRef, useState } from "react";

/** Counts 0 -> value once per tab session (key). Reduced motion, or a repeat visit, shows the value at once. */
export default function CountUp({ value, id, ms = 1100 }: { value: number; id: string; ms?: number }) {
  const [n, setN] = useState(value);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let seen = false;
    try { seen = sessionStorage.getItem(`fed-count-${id}`) === "1"; sessionStorage.setItem(`fed-count-${id}`, "1"); } catch {}
    if (seen || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(Math.round(value * (1 - Math.pow(1 - p, 4)))); // ease-out-quart
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setN(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, id, ms]);
  return <>{n}</>;
}
