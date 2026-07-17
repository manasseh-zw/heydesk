import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import * as React from "react";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

function ThemeShortcut() {
  const { resolvedTheme, setTheme } = useTheme();

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        isEditableTarget(event.target) ||
        event.key.toLowerCase() !== "d"
      ) {
        return;
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [resolvedTheme, setTheme]);

  return null;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeShortcut />
      {children}
    </NextThemesProvider>
  );
}

export { useTheme };
