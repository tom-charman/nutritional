"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/entry", label: "Daily Entry" },
  { href: "/foods", label: "Food Database" },
  { href: "/meals", label: "Meal Planner" },
];

export default function Navbar({ signedIn = false }: { signedIn?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="navbar-brand">Nutritional Tracker</span>
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
          {signedIn && (
            <form action={signOutAction} style={{ display: "inline" }}>
              <button type="submit" className="nav-link nav-link-button">
                Sign out
              </button>
            </form>
          )}
        </div>
      </div>
    </nav>
  );
}
