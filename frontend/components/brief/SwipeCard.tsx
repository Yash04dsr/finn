"use client";

import { type ReactNode, useRef, useState } from "react";

const COMMIT = 110;

/**
 * A quiet touch shortcut over the focus card: swipe left for No impact, right for
 * Watch closer. Mouse input is ignored so text stays selectable; the verdict bar
 * is always the primary control.
 */
export default function SwipeCard({
  children,
  onLeft,
  onRight,
  disabled,
}: {
  children: ReactNode;
  onLeft: () => void;
  onRight: () => void;
  disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);

  const reset = () => {
    start.current = null;
    setDragging(false);
    setDx(0);
  };

  return (
    <div className="relative">
      {dx !== 0 ? (
        <p
          aria-hidden="true"
          className={`pointer-events-none absolute -top-6 text-[12px] font-bold uppercase tracking-[0.08em] ${dx < 0 ? "right-0" : "left-0"}`}
          style={{ opacity: Math.min(1, Math.abs(dx) / COMMIT) }}
        >
          {dx < 0 ? "No impact" : "Watch closer"}
        </p>
      ) : null}
      <div
        style={{
          transform: dx ? `translateX(${dx}px) rotate(${dx / 90}deg)` : undefined,
          transition: dragging ? "none" : "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          touchAction: "pan-y",
        }}
        onPointerDown={(e) => {
          if (disabled || e.pointerType === "mouse") return;
          moved.current = false;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const ddx = e.clientX - s.x;
          const ddy = e.clientY - s.y;
          if (s.horizontal === null && (Math.abs(ddx) > 14 || Math.abs(ddy) > 14)) {
            s.horizontal = Math.abs(ddx) > Math.abs(ddy) * 1.5;
            if (s.horizontal) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
          if (s.horizontal) {
            moved.current = true;
            setDragging(true);
            setDx(ddx);
          }
        }}
        onPointerUp={() => {
          const s = start.current;
          if (!s) return;
          if (s.horizontal && Math.abs(dx) > COMMIT) {
            const left = dx < 0;
            setDx(left ? -520 : 520);
            start.current = null;
            setDragging(false);
            window.setTimeout(() => {
              (left ? onLeft : onRight)();
              setDx(0);
            }, 170);
            return;
          }
          reset();
        }}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
