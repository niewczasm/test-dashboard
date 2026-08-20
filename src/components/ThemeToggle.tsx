"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

export function ThemeToggle() {
  // Best-effort default for the very first paint before the mount effect
  // below corrects it from whatever the inline head script (see layout.tsx)
  // already applied — that script runs before hydration and is the real
  // source of truth, this is just a placeholder so the icon isn't blank.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    queueMicrotask(() => {
      const applied = document.documentElement.getAttribute("data-theme");
      if (applied === "light" || applied === "dark") {
        setTheme(applied);
      } else {
        setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      }
    });
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore unavailable storage
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 w-8 items-center justify-center rounded-md text-sm"
      style={{ border: "1px solid var(--border)", background: "var(--page)" }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
