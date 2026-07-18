import {
  ArrowUpIcon,
  FileTextIcon,
  MessageSquareIcon,
  MicIcon,
  PaperclipIcon,
  PlusIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";

import { Button } from "@heydesk/ui/components/button";

import {
  Composer,
  ComposerSubmit,
  ComposerToolbar,
  ComposerToolbarSpacer,
} from "@/components/ai/composer";
import {
  ComposerRichInput,
  ComposerSuggestions,
  type ComposerItem,
} from "@/components/ai/composer-rich";
import { LogoMark } from "@/components/logo";

const commands: ComposerItem[] = [
  {
    id: "create-page",
    label: "Create a page",
    description: "Turn an idea into an editable page",
    icon: <SparklesIcon />,
  },
  {
    id: "summarize",
    label: "Summarize",
    description: "Condense selected workspace context",
    icon: <MessageSquareIcon />,
  },
  {
    id: "draft-document",
    label: "Draft a document",
    description: "Create a durable document from your instructions",
    icon: <FileTextIcon />,
  },
];

const workspaceItems: ComposerItem[] = [
  { id: "welcome", label: "Welcome", icon: <FileTextIcon /> },
  { id: "company-notes", label: "Company notes", icon: <FileTextIcon /> },
  { id: "weekly-planning", label: "Weekly planning", icon: <FileTextIcon /> },
  { id: "founder-update", label: "Founder update", icon: <FileTextIcon /> },
  { id: "product-brief", label: "Product brief", icon: <FileTextIcon /> },
];

export function HomeComposer() {
  return (
    <div className="flex w-full max-w-2xl -translate-y-8 flex-col items-center md:-translate-y-12">
      <LogoMark className="size-10 text-logo-mark" />
      <h1 className="mt-5 font-brand text-2xl font-light tracking-tight">
        Create something wonderful
      </h1>

      <Composer className="mt-8 w-full rounded-4xl border border-border/60 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.18)] focus-within:border-primary/25 focus-within:ring-1 focus-within:ring-primary/20 dark:border-border/70 dark:shadow-[0_8px_24px_-16px_rgba(0,0,0,0.45)]">
        <ComposerRichInput
          autoFocus
          className="[&_[data-slot=composer-rich-input]]:min-h-20 [&_[data-slot=composer-rich-input]]:px-4 [&_[data-slot=composer-rich-input]]:py-4 [&_[data-slot=composer-rich-input-skeleton]]:min-h-20 [&_[data-slot=composer-rich-input-skeleton]]:px-4 [&_[data-slot=composer-rich-input-skeleton]]:py-4"
          placeholder="Ask Heydesk anything. Type / for actions or @ to add context."
          triggers={{
            "/": { items: commands },
            "@": { items: workspaceItems, hideOnEmpty: false },
          }}
        />
        <ComposerSuggestions />
        <ComposerToolbar>
          <Button
            aria-label="Add attachment"
            className="text-muted-foreground"
            size="icon-sm"
            variant="ghost"
          >
            <PlusIcon />
          </Button>
          <Button className="text-muted-foreground" size="sm" variant="ghost">
            <WrenchIcon />
            Tools
          </Button>

          <ComposerToolbarSpacer>
            <Button
              aria-label="Attach a file"
              className="text-muted-foreground"
              size="icon-sm"
              variant="ghost"
            >
              <PaperclipIcon />
            </Button>
            <Button
              aria-label="Dictate"
              className="text-muted-foreground"
              size="icon-sm"
              variant="ghost"
            >
              <MicIcon />
            </Button>
            <ComposerSubmit
              render={
                <Button
                  aria-label="Send"
                  className="rounded-full"
                  size="icon-sm"
                />
              }
            >
              <ArrowUpIcon />
            </ComposerSubmit>
          </ComposerToolbarSpacer>
        </ComposerToolbar>
      </Composer>
    </div>
  );
}
