import {
  ArrowUpIcon,
  FileTextIcon,
  MessageSquareIcon,
  MicIcon,
  PaperclipIcon,
  PlusIcon,
  SquareIcon,
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
  type ComposerValue,
} from "@/components/ai/composer-rich";
import { LogoMark } from "@/components/logo";
import { useState } from "react";

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
    label: "Draft a page",
    description: "Create a durable Markdown page from your instructions",
    icon: <FileTextIcon />,
  },
];

type HomeComposerProps = {
  compact?: boolean;
  disabled?: boolean;
  isRunning?: boolean;
  onStop?: () => void;
  onSubmit?: (text: string) => void | Promise<void>;
};

const emptyValue: ComposerValue = { text: "", segments: [] };

export function HomeComposer({
  compact = false,
  disabled = false,
  isRunning = false,
  onStop,
  onSubmit,
}: HomeComposerProps) {
  const [value, setValue] = useState<ComposerValue>(emptyValue);

  const submit = (next: ComposerValue) => {
    const text = next.text.trim();
    if (!text || !onSubmit) return;
    void onSubmit(text);
    setValue(emptyValue);
  };

  return (
    <div
      className={
        compact
          ? "w-full max-w-3xl"
          : "flex w-full max-w-2xl -translate-y-8 flex-col items-center md:-translate-y-12"
      }
    >
      {!compact && <LogoMark className="size-10 text-logo-mark" />}
      {!compact && (
        <h1 className="mt-5 font-brand text-2xl font-light tracking-tight">
          Create something wonderful
        </h1>
      )}

      <Composer
        className={`${compact ? "" : "mt-8"} w-full rounded-4xl border border-border/60 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.18)] focus-within:border-primary/25 focus-within:ring-1 focus-within:ring-primary/20 dark:border-border/70 dark:shadow-[0_8px_24px_-16px_rgba(0,0,0,0.45)]`}
        disabled={disabled}
      >
        <ComposerRichInput
          autoFocus={!compact}
          className={`${compact ? "[&_[data-slot=composer-rich-input]]:max-h-40" : "[&_[data-slot=composer-rich-input]]:max-h-52"} [&_[data-slot=composer-rich-input]]:min-h-20 [&_[data-slot=composer-rich-input]]:px-4 [&_[data-slot=composer-rich-input]]:py-4 [&_[data-slot=composer-rich-input-skeleton]]:min-h-20 [&_[data-slot=composer-rich-input-skeleton]]:px-4 [&_[data-slot=composer-rich-input-skeleton]]:py-4`}
          onSubmit={submit}
          onValueChange={setValue}
          placeholder="Ask Heydesk anything. Type / for actions."
          triggers={{
            "/": { items: commands },
          }}
          value={value}
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
            {isRunning ? (
              <Button
                aria-label="Stop"
                className="rounded-full"
                onClick={onStop}
                size="icon-sm"
                type="button"
              >
                <SquareIcon className="size-3 fill-current" />
              </Button>
            ) : (
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
            )}
          </ComposerToolbarSpacer>
        </ComposerToolbar>
      </Composer>
    </div>
  );
}
