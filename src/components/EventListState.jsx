export function EventSkeleton({ compact = false }) {
  return (
    <div
      role="status"
      aria-label="Loading events"
      className={`grid gap-4 ${compact ? '' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full'}`}
    >
      {[0, 1, 2].map((id) => (
        <div
          key={id}
          aria-hidden="true"
          className={`rounded-2xl border border-white/10 bg-black/40 p-4 motion-safe:animate-pulse ${compact ? 'flex gap-3' : ''}`}
        >
          <div className={`rounded-lg bg-white/10 ${compact ? 'w-16 h-16 shrink-0' : 'h-64 mb-4'}`} />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-3/4 rounded bg-white/10" />
            <div className="h-3 w-1/2 rounded bg-white/10" />
            <div className="h-3 w-2/3 rounded bg-white/10" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading events...</span>
    </div>
  )
}

export function EventLoadError({ onRetry }) {
  return (
    <div role="alert" className="text-center py-10 text-neutral-400">
      <p>Unable to load events. Please try again.</p>
      <button type="button" className="mt-3 text-red-400 underline" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
