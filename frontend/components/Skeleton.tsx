"use client";

/** Shimmering placeholder block. */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skel ${className}`} style={style} aria-hidden="true" />;
}

/** Feed-shaped skeleton (rows of cards). */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-3.5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-6 w-14 rounded-none" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-10" />
          </div>
          <Skeleton className="mt-3 h-4 w-[92%]" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Chat-bubble skeleton. */
export function ChatSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex justify-end">
        <Skeleton className="h-9 w-40 rounded-none " />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-20 w-64 rounded-none " />
      </div>
    </div>
  );
}

/** Generic inline error + retry row. */
export function ErrorRow({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-6 text-center">
      <p className="text-[13px] text-[#4B5563]">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="press min-h-11 border border-black/30 px-4 py-2 text-[12px] font-semibold text-[#000000]"
        >
          Retry
        </button>
      )}
    </div>
  );
}
