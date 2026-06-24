"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Navbar dropdown — a trigger button that opens a panel of menu items, with the
 * Combobox dismissal pattern (click-away + Escape); no menu library. Shared by
 * the account menu and the planning menu. `children` is a render-prop receiving
 * a `close` callback so items can dismiss the menu when activated.
 */
export default function NavMenu({
  label,
  active = false,
  align = "left",
  triggerClassName,
  children,
}: {
  label: string;
  active?: boolean;
  align?: "left" | "right";
  /** Extra class on the trigger button — a stable hook for tests/targeting. */
  triggerClassName?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="nav-menu" ref={ref}>
      <button
        type="button"
        className={`nav-link nav-link-button nav-menu-trigger${active ? " active" : ""}${
          triggerClassName ? ` ${triggerClassName}` : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="nav-menu-label">{label}</span>
        <span className="nav-menu-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className={`nav-menu-panel nav-menu-panel-${align}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
