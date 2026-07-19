import { Collapsible } from "@base-ui/react/collapsible";

import { cn } from "@/lib/utils";

type AgentRunState = "running" | "completed" | "failed" | "stopped";

type AgentRunProps = Collapsible.Root.Props & {
  state?: AgentRunState;
};

export function AgentRun({ state, className, ...props }: AgentRunProps) {
  return (
    <Collapsible.Root
      className={cn(
        "group/run flex flex-col rounded-outer border border-border bg-surface",
        "data-[state=running]:border-inflight/60 data-[state=running]:ring-2 data-[state=running]:ring-inflight/30",
        "data-[state=failed]:border-destructive/60 data-[state=failed]:ring-2 data-[state=failed]:ring-destructive/30",
        className,
      )}
      data-slot="agent-run"
      data-state={state}
      {...props}
    />
  );
}

export function AgentRunHeader({
  className,
  children,
  ...props
}: Collapsible.Trigger.Props) {
  return (
    <Collapsible.Trigger
      className={cn(
        "flex w-full cursor-pointer select-none items-center gap-3 rounded-outer bg-transparent px-4 py-3 text-left text-sm text-foreground",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
      data-slot="agent-run-header"
      {...props}
    >
      <svg
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-open/run:rotate-90"
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      {children}
    </Collapsible.Trigger>
  );
}

export function AgentRunTitle({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "min-w-0 truncate font-medium text-foreground group-data-[state=failed]/run:text-destructive",
        className,
      )}
      data-slot="agent-run-title"
      {...props}
    />
  );
}

export function AgentRunMeta({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
      data-slot="agent-run-meta"
      {...props}
    />
  );
}

export function AgentRunContent({
  className,
  children,
  ...props
}: Collapsible.Panel.Props) {
  return (
    <Collapsible.Panel
      className={cn(
        "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0",
        className,
      )}
      data-slot="agent-run-content"
      {...props}
    >
      <div className="flex flex-col gap-1 px-4 pb-4">{children}</div>
    </Collapsible.Panel>
  );
}

export function AgentRunStep({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col text-sm text-foreground", className)}
      data-slot="agent-run-step"
      {...props}
    />
  );
}

export function AgentRunText({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "text-sm text-foreground/80",
        "[&_code]:rounded [&_code]:bg-surface-elevated [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-foreground",
        className,
      )}
      data-slot="agent-run-text"
      {...props}
    />
  );
}
