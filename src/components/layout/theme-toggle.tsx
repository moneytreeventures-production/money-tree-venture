"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const themes = ["light", "dark", "system"] as const;
const subscribe = () => () => undefined;

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const activeTheme = theme ?? "light";
  const currentIndex = themes.findIndex((option) => option === activeTheme);
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  const Icon = mounted ? activeTheme === "light" ? Sun : activeTheme === "dark" ? Moon : Monitor : Monitor;

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(themes[(safeIndex + 1) % themes.length]);
      }}
      aria-label={mounted ? `${activeTheme}. Change theme` : "Change theme"}
      title={mounted ? `${activeTheme} — Change theme` : "Change theme"}
      className="flex size-10 items-center justify-center rounded-full border border-border bg-surface text-foreground transition-colors hover:bg-surface-secondary"
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
