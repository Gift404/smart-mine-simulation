export default function EmptyState({
  title,
  hint,
  tone = "neutral",
}: {
  title: string;
  hint?: string;
  tone?: "neutral" | "ok";
}) {
  const ok = tone === "ok";
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-panel2/60 px-6 py-10 text-center">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
          ok ? "bg-status-normal/15 text-status-normal" : "bg-slate-700/60 text-slate-400"
        }`}
        aria-hidden
      >
        {ok ? "✓" : "○"}
      </span>
      <div className={`text-sm font-semibold ${ok ? "text-status-normal" : "text-slate-200"}`}>{title}</div>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
    </div>
  );
}
