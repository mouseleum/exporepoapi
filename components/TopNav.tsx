"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Ranker" },
  { href: "/library", label: "Library" },
  { href: "/library/compare", label: "Compare" },
  { href: "/library/tags", label: "Tags" },
];

export function TopNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="top-nav">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`top-nav-link${active ? " active" : ""}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
