/** Shared backdrop for /login and /setup: a slow radar sweep behind a single panel. */
export function AuthFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[900px] -translate-x-1/2 -translate-y-1/2 opacity-60">
        {[1, 0.72, 0.46, 0.22].map((s) => (
          <div key={s} className="absolute inset-0 m-auto rounded-full border border-accent/10" style={{ width: `${s * 100}%`, height: `${s * 100}%` }} />
        ))}
        <div className="absolute inset-0 animate-sweep rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgb(var(--accent)/0.12)_30deg,transparent_60deg)] [animation-duration:6s]" />
        <span className="absolute left-[30%] top-[38%] size-1.5 rounded-full bg-down shadow-[0_0_10px_rgb(var(--down))]" />
        <span className="absolute left-[64%] top-[58%] size-1.5 rounded-full bg-up shadow-[0_0_10px_rgb(var(--up))]" />
        <span className="absolute left-[55%] top-[26%] size-1.5 rounded-full bg-accent shadow-[0_0_10px_rgb(var(--accent))]" />
      </div>
      <div className="panel relative w-full max-w-sm bg-surface/95 p-6 shadow-2xl sm:p-8">
        <p className="label-caps text-accent">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
      <p className="absolute bottom-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">NetWatch · self-hosted · nothing leaves your network</p>
    </main>
  )
}
