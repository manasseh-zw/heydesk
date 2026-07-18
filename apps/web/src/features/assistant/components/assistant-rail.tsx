import { PanelRightCloseIcon } from "lucide-react";

import { Button } from "@heydesk/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@heydesk/ui/components/sheet";

import type { WorkspaceSummary } from "@/features/workspace/workspace.types";
import { AssistantHome } from "./assistant-home";

type AssistantRailProps = {
  disabled: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onOpenPage: (path: string) => void;
  onSend: (message: string) => Promise<void>;
  onWidthChange: (width: number) => void;
  open: boolean;
  title?: string;
  width: number;
  workspace: WorkspaceSummary;
};

export function AssistantRail({
  disabled,
  mobileOpen,
  onMobileOpenChange,
  onOpenChange,
  onOpenPage,
  onSend,
  onWidthChange,
  open,
  title = "Page assistant",
  width,
  workspace,
}: AssistantRailProps) {
  return (
    <>
      {open && (
        <aside
          className="relative hidden min-w-80 max-w-[32.5rem] flex-col overflow-hidden border-l bg-background lg:flex"
          style={{ width }}
        >
          <div
            aria-label="Resize assistant"
            className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize hover:bg-primary/30"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              const startX = event.clientX;
              const startWidth = width;
              const move = (moveEvent: PointerEvent) => {
                onWidthChange(
                  Math.min(
                    520,
                    Math.max(320, startWidth + startX - moveEvent.clientX),
                  ),
                );
              };
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up, { once: true });
            }}
            role="separator"
          />
          <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
            <span className="text-sm font-medium">{title}</span>
            <Button
              aria-label="Close assistant"
              onClick={() => onOpenChange(false)}
              size="icon-sm"
              variant="ghost"
            >
              <PanelRightCloseIcon />
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <AssistantHome
              compactSurface
              disabled={disabled}
              onOpenPage={onOpenPage}
              onSend={onSend}
              workspace={workspace}
            />
          </div>
        </aside>
      )}

      <Sheet onOpenChange={onMobileOpenChange} open={mobileOpen}>
        <SheetContent className="w-[min(92vw,28rem)] max-w-none p-0" side="right">
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <AssistantHome
            compactSurface
            disabled={disabled}
            onOpenPage={onOpenPage}
            onSend={onSend}
            workspace={workspace}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
