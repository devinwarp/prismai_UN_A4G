/** Small "Built by DigiCube" credit — isometric cube glyph + wordmark. */
export default function DigiCubeMark({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-ink-soft/80 uppercase ${className}`}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 2.5 21 7.5v9l-9 5-9-5v-9l9-5Z" />
        <path d="M12 12 21 7.5M12 12v9.5M12 12 3 7.5" />
      </svg>
      Built by DigiCube
    </span>
  );
}
