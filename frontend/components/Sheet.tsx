"use client";

import { useEffect } from "react";

/** Slide-up detail sheet with backdrop, drag-handle, ESC + scroll lock. */
export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={title || "Details"} className="sheet-panel">
        <div className="sticky top-0 z-10 flex justify-center bg-gradient-to-b from-[#131A26] via-[#131A26] to-transparent pt-2.5 pb-1">
          <button aria-label="Close" onClick={onClose} className="h-1.5 w-11 rounded-full bg-white/20" />
        </div>
        {children}
      </div>
    </>
  );
}
