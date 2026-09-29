"use client";

import { useEffect, useState } from "react";

/**
 * Reactive `isDark` matching the `dark` class on <html> set by ThemeProvider.
 * Returns `null` during SSR / first render to avoid hydration mismatch — callers
 * should treat null as "not yet known" (typically fall back to light logo).
 */
export function useDarkMode(): boolean | null {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();

    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
