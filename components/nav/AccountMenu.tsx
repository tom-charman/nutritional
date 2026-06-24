"use client";

import Link from "next/link";
import { useState } from "react";
import { signOutAction } from "@/app/actions/auth";
import ExportModal from "@/components/export/ExportModal";
import NavMenu from "@/components/nav/NavMenu";

/**
 * Account dropdown — the signed-in user's name opens a menu holding navigation
 * (Food Database) and account actions (Export, Sign out), with room for future
 * Settings. Built on the shared NavMenu primitive.
 */
export default function AccountMenu({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  const [exportOpen, setExportOpen] = useState(false);

  const label = name || email || "Account";

  return (
    <>
      <NavMenu label={label} align="right" triggerClassName="account-menu-trigger">
        {(close) => (
          <>
            {(name || email) && (
              <div className="account-menu-header">
                {name && <div className="account-menu-name">{name}</div>}
                {email && <div className="account-menu-email">{email}</div>}
              </div>
            )}
            <div className="account-menu-divider" />
            <Link
              href="/foods"
              role="menuitem"
              className="nav-menu-item"
              onClick={close}
            >
              Food Database
            </Link>
            <button
              type="button"
              role="menuitem"
              className="nav-menu-item"
              onClick={() => {
                close();
                setExportOpen(true);
              }}
            >
              Export data
            </button>
            <form action={signOutAction}>
              <button type="submit" role="menuitem" className="nav-menu-item">
                Sign out
              </button>
            </form>
          </>
        )}
      </NavMenu>
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
    </>
  );
}
