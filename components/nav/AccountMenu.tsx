"use client";

import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions/auth";
import ExportModal from "@/components/export/ExportModal";

/**
 * Account dropdown — the signed-in user's name opens a menu holding their
 * account actions (Export, Sign out) with room for future Settings. Modeled on
 * the Combobox dismissal pattern (click-away + Escape); no menu library.
 */
export default function AccountMenu({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const label = name || email || "Account";

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
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="nav-link nav-link-button account-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <span className="account-menu-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="account-menu-panel" role="menu">
          {(name || email) && (
            <div className="account-menu-header">
              {name && <div className="account-menu-name">{name}</div>}
              {email && <div className="account-menu-email">{email}</div>}
            </div>
          )}
          <div className="account-menu-divider" />
          <button
            type="button"
            role="menuitem"
            className="account-menu-item"
            onClick={() => {
              setOpen(false);
              setExportOpen(true);
            }}
          >
            Export data
          </button>
          <form action={signOutAction}>
            <button type="submit" role="menuitem" className="account-menu-item">
              Sign out
            </button>
          </form>
        </div>
      )}
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
    </div>
  );
}
