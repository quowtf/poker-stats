"use client";

import { useState, useRef, useEffect } from "react";

/**
 * Tap/click an ⓘ icon to reveal an explanation popover.
 * Mobile-first: closes when tapping outside.
 */
export default function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-700 text-[10px] font-bold text-gray-300 transition hover:bg-gray-600 align-middle"
        aria-label="Más info"
      >
        i
      </button>
      {open && (
        <span className="absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-lg bg-black/95 p-3 text-xs font-normal leading-relaxed text-gray-200 shadow-xl ring-1 ring-gray-700">
          {text}
        </span>
      )}
    </span>
  );
}
