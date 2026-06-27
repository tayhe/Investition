"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("theme") as Theme) || "system";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => {
    const current = theme === "system" ? getSystemTheme() : theme;
    const next: Theme = current === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    applyTheme(next);
  };

  const effectiveTheme = theme === "system" ? getSystemTheme() : theme;

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-accent/50 w-full transition-colors"
      title={effectiveTheme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
    >
      {effectiveTheme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      {effectiveTheme === "dark" ? "亮色模式" : "暗色模式"}
    </button>
  );
}
