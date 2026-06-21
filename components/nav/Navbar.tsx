"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountMenu from "@/components/nav/AccountMenu";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/entry", label: "Daily Entry" },
  { href: "/foods", label: "Food Database" },
  { href: "/meals", label: "Meal Planner" },
];

export interface NavUser {
  name?: string | null;
  email?: string | null;
}

export default function Navbar({ user = null }: { user?: NavUser | null }) {
  const pathname = usePathname();
  // The sign-in / access-denied pages are pre-auth: show only the brand, not the
  // app nav (links there go nowhere useful and read as a broken logged-out state).
  const authPage = pathname === "/signin" || pathname === "/denied";
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="navbar-brand">Nutritional Tracker</span>
        {!authPage && (
          <div className="navbar-links">
            {LINKS.map((l) => {
              const active =
                l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
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
            {user && <AccountMenu name={user.name} email={user.email} />}
          </div>
        )}
      </div>
    </nav>
  );
}
