"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SyncButton } from "@/components/SyncButton";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/tags", label: "Tags" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header
      className="sticky top-0 z-10 border-b"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-sm tracking-tight">
            Test Failures Dashboard
          </span>
          <nav className="flex gap-4">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm"
                  style={{
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: active ? 600 : 400,
                    borderBottom: active ? "2px solid var(--series-1)" : "2px solid transparent",
                    paddingBottom: 2,
                  }}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <SyncButton />
      </div>
    </header>
  );
}
