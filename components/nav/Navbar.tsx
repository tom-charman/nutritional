"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountMenu from "@/components/nav/AccountMenu";
import PlanningMenu from "@/components/nav/PlanningMenu";

const LINKS = [
  { href: "/entry", label: "Daily Entry" },
  { href: "/dashboard", label: "Dashboard" },
];

export interface NavUser {
  name?: string | null;
  email?: string | null;
}

export default function Navbar({
  user = null,
  gated = false,
}: {
  user?: NavUser | null;
  /** The consent gate is showing — hide the app nav (and the Export action in
   *  the account menu) so it can't be used before consent; keep only the brand
   *  and links to the still-reachable notice/contact pages. */
  gated?: boolean;
}) {
  const pathname = usePathname();
  // The sign-in / access-denied pages are pre-auth and stand on their own (the
  // card carries the full brand identity): no navbar at all, for a clean canvas.
  const authPage = pathname === "/signin" || pathname === "/denied";
  if (authPage) return null;
  if (gated) {
    return (
      <nav className="navbar">
        <div className="navbar-inner">
          <span className="navbar-brand">Nutritional</span>
          <div className="navbar-links">
            <Link href="/privacy" className="nav-link">Privacy</Link>
            <Link href="/contact" className="nav-link">Contact</Link>
          </div>
        </div>
      </nav>
    );
  }
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="navbar-brand">Nutritional</span>
        <div className="navbar-links">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
          <PlanningMenu />
          {user && <AccountMenu name={user.name} email={user.email} />}
        </div>
      </div>
    </nav>
  );
}
