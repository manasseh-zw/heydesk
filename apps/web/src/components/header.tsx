import { Link } from "@tanstack/react-router";

import { ModeToggle } from "./mode-toggle";

export default function Header() {
  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Heydesk home">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary font-heading text-lg font-semibold text-primary-foreground">
            h
          </span>
          <span className="font-heading text-lg font-semibold tracking-tight">heydesk</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px]">D</kbd>
            <span>toggle theme</span>
          </div>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
