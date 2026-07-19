import { PanelRightCloseIcon } from "lucide-react";

import { Button } from "@heydesk/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@heydesk/ui/components/sheet";

import type { WorkspaceSummary } from "@/features/workspace/workspace.types";
import type { ComposerContext } from "@/features/workspace/components/home-composer";
import type { AssistantRunPreferences } from "../assistant.types";
import { AssistantHome } from "./assistant-home";

type AssistantRailProps = {
  composerContext?: ComposerContext;
  disabled: boolean;
  minimalHeader?: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onOpenPage: (path: string) => void;
  onSend: (
    message: string,
    preferences?: AssistantRunPreferences,
  ) => Promise<void>;
  onWidthChange: (width: number) => void;
  open: boolean;
  title?: string;
  width: number;
  workspace: WorkspaceSummary;
};

export function AssistantRail({
  composerContext = "page",
  disabled,
  minimalHeader = false,
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
      <aside
        aria-hidden={!open}
        className={`relative hidden shrink-0 flex-col overflow-hidden border-l bg-background transition-[width,min-width,max-width,opacity,border-color] duration-200 ease-linear lg:flex ${open ? "border-border opacity-100" : "pointer-events-none border-transparent opacity-0"}`}
        inert={open ? undefined : true}
        style={{
          width: open ? width : 0,
          minWidth: open ? 320 : 0,
          maxWidth: open ? 520 : 0,
        }}
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
        {minimalHeader ? (
          <div className="flex h-12 shrink-0 items-center justify-end px-2">
            <Button
              aria-label="Close assistant"
              onClick={() => onOpenChange(false)}
              size="icon-sm"
              variant="ghost"
            >
              <PanelRightCloseIcon />
            </Button>
          </div>
        ) : (
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
        )}
        <div className="min-h-0 flex-1">
          <AssistantHome
            compactSurface
            composerContext={composerContext}
            disabled={disabled}
            onOpenPage={onOpenPage}
            onSend={onSend}
            workspace={workspace}
          />
        </div>
      </aside>

      <Sheet onOpenChange={onMobileOpenChange} open={mobileOpen}>
        <SheetContent className="w-[min(92vw,28rem)] max-w-none p-0" side="right">
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <AssistantHome
            compactSurface
            composerContext={composerContext}
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
