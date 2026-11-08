import Image from "next/image";

/**
 * The Prism logo mark on its cream tile — stays legible in the dark theme
 * where the navy artwork would otherwise sink into the background.
 */
export default function PrismMark({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-[#f6f4ec] ${className ?? "h-9 w-9"}`}
    >
      <Image
        src="/prism-mark.png"
        alt=""
        width={512}
        height={512}
        className="h-full w-full object-contain p-0.5"
      />
    </span>
  );
}
