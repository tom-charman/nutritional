"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavMenu from "@/components/nav/NavMenu";

const ITEMS = [
  { href: "/planner", label: "Weekly Planner" },
  { href: "/meals", label: "Recipes" },
];

/** Planning dropdown — groups the forward-looking tools (weekly planner + recipes). */
export default function PlanningMenu() {
  const pathname = usePathname();
  const active = ITEMS.some((i) => pathname.startsWith(i.href));
  return (
    <NavMenu label="Planning" active={active}>
      {(close) =>
        ITEMS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            role="menuitem"
            className="nav-menu-item"
            onClick={close}
          >
            {i.label}
          </Link>
        ))
      }
    </NavMenu>
  );
}
