import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpIcon,
  BookOpenTextIcon,
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  MessageSquareIcon,
  ScanSearchIcon,
  SparklesIcon,
  SquareIcon,
  TextQuoteIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@heydesk/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@heydesk/ui/components/dropdown-menu";

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
import { CodexIcon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { assistantKeys } from "@/features/assistant/assistant.queries";
import { getAssistantModels } from "@/features/assistant/assistant.service";
import type {
  AssistantModel,
  AssistantRunPreferences,
} from "@/features/assistant/assistant.types";
import {
  composerCommandRequiresInput,
  type ComposerCommandId,
  type ComposerSubmission,
} from "../workspace-assistant-routing";
import { useState } from "react";

export type ComposerContext = "workspace" | "page" | "document";

const commandsByContext = {
  workspace: [
    { id: "create-page", label: "Create a page", icon: <SparklesIcon /> },
    {
      id: "create-document",
      label: "Create a document",
      icon: <FileTextIcon />,
    },
    {
      id: "summarize-workspace",
      label: "Summarize my workspace",
      icon: <MessageSquareIcon />,
    },
  ],
  page: [
    {
      id: "summarize-page",
      label: "Summarize this page",
      icon: <BookOpenTextIcon />,
    },
    {
      id: "improve-page",
      label: "Improve this page",
      icon: <SparklesIcon />,
    },
    {
      id: "make-page-concise",
      label: "Make this more concise",
      icon: <TextQuoteIcon />,
    },
    {
      id: "find-page-gaps",
      label: "Find gaps in this page",
      icon: <ScanSearchIcon />,
    },
  ],
  document: [
    {
      id: "summarize-document",
      label: "Summarize this document",
      icon: <BookOpenTextIcon />,
    },
    {
      id: "improve-document",
      label: "Improve the writing",
      icon: <SparklesIcon />,
    },
    {
      id: "review-document-structure",
      label: "Review the structure",
      icon: <ScanSearchIcon />,
    },
    {
      id: "make-document-concise",
      label: "Make this more concise",
      icon: <TextQuoteIcon />,
    },
  ],
} satisfies Record<ComposerContext, Array<ComposerItem & { id: ComposerCommandId }>>;

type HomeComposerProps = {
  compact?: boolean;
  context?: ComposerContext;
  disabled?: boolean;
  isRunning?: boolean;
  onStop?: () => void;
  onSubmit?: (
    text: string,
    preferences?: AssistantRunPreferences,
    submission?: ComposerSubmission,
  ) => void | Promise<void>;
};

const emptyValue: ComposerValue = { text: "", segments: [] };
const codexModels = [
  {
    id: "gpt-5.6-luna",
    label: "Luna",
  },
  {
    id: "gpt-5.6-terra",
    label: "Terra",
  },
  {
    id: "gpt-5.6-sol",
    label: "Sol",
  },
] as const;

type CodexModelId = (typeof codexModels)[number]["id"];

export function HomeComposer({
  compact = false,
  context = "workspace",
  disabled = false,
  isRunning = false,
  onStop,
  onSubmit,
}: HomeComposerProps) {
  const [value, setValue] = useState<ComposerValue>(emptyValue);
  const [selectedModelId, setSelectedModelId] =
    useState<CodexModelId>("gpt-5.6-luna");
  const [selectedCommandId, setSelectedCommandId] =
    useState<ComposerCommandId | undefined>();
  const modelsQuery = useQuery({
    queryKey: assistantKeys.models(),
    queryFn: getAssistantModels,
    staleTime: 60_000,
  });
  const selectedModel = findModel(modelsQuery.data, selectedModelId);
  const selectedModelLabel = codexModels.find(
    (model) => model.id === selectedModelId,
  )!.label;
  const preferences = selectedModel
    ? {
        model: selectedModel.model,
        effort: selectedModel.defaultReasoningEffort,
      }
    : undefined;
  const selectedCommand = commandsByContext[context].find(
    (command) => command.id === selectedCommandId,
  );

  const submit = (next: ComposerValue) => {
    const text = next.text.trim();
    if (!onSubmit || (!text && !selectedCommandId)) return;
    void onSubmit(
      text,
      preferences,
      selectedCommandId ? { commandId: selectedCommandId } : undefined,
    );
    setSelectedCommandId(undefined);
    setValue(emptyValue);
  };

  return (
    <div
      className={
        compact
          ? "w-full max-w-3xl"
          : "flex w-full max-w-2xl -translate-y-8 flex-col items-start md:-translate-y-12"
      }
    >
      {!compact && (
        <div className="w-full px-2">
          <div className="flex items-center gap-2">
            <LogoMark className="size-6.5 shrink-0 text-logo-mark" />
            <span className="font-brand text-3xl font-normal tracking-normal text-foreground/80">
              Heydesk
            </span>
          </div>
          <p className="mt-2 text-sm font-brand leading-6 text-foreground/70 md:whitespace-nowrap">
            Turn your workspace context into useful work with Codex
          </p>
        </div>
      )}

      <Composer
        className={`${compact ? "rounded-2xl" : "mt-6 rounded-3xl"} w-full border border-border/60 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.18)] focus-within:border-primary/25 focus-within:ring-1 focus-within:ring-primary/20 dark:border-border/70 dark:shadow-[0_8px_24px_-16px_rgba(0,0,0,0.45)] [&_[data-slot=composer-toolbar]]:py-1.5`}
        disabled={disabled}
      >
        {selectedCommand && (
          <div className="px-3 pt-3">
            <button
              aria-label={`Remove ${selectedCommand.label} action`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&>svg]:size-3.5"
              onClick={() => setSelectedCommandId(undefined)}
              type="button"
            >
              {selectedCommand.icon}
              <span>{selectedCommand.label}</span>
              <XIcon className="size-3" />
            </button>
          </div>
        )}
        <ComposerRichInput
          autoFocus={!compact}
          className={`${compact ? "[&_[data-slot=composer-rich-input]]:max-h-40" : "[&_[data-slot=composer-rich-input]]:max-h-44"} [&_[data-slot=composer-rich-input]]:min-h-18 [&_[data-slot=composer-rich-input]]:px-4 [&_[data-slot=composer-rich-input]]:py-3 [&_[data-slot=composer-rich-input-skeleton]]:min-h-18 [&_[data-slot=composer-rich-input-skeleton]]:px-4 [&_[data-slot=composer-rich-input-skeleton]]:py-3`}
          onSubmit={submit}
          onValueChange={setValue}
          placeholder={
            selectedCommandId === "create-page"
              ? "What should the page contain?"
              : selectedCommandId === "create-document"
                ? "What should the document contain?"
                : "Ask Heydesk anything. Type / for actions."
          }
          triggers={{
            "/": {
              items: commandsByContext[context],
              onSelect(item, selection) {
                selection.clearTrigger();
                const commandId = item.id as ComposerCommandId;
                if (composerCommandRequiresInput(commandId)) {
                  setSelectedCommandId(commandId);
                  return;
                }
                setSelectedCommandId(undefined);
                setValue(emptyValue);
                void onSubmit?.("", preferences, { commandId });
              },
            },
          }}
          value={value}
        />
        <ComposerSuggestions fitContent />
        <ComposerToolbar>
          <div
            aria-label="Codex is active"
            className="flex h-8 items-center gap-1.5 px-1 text-sm text-muted-foreground"
          >
            <CodexIcon className="size-4" />
            <span>Codex</span>
          </div>

          <ComposerToolbarSpacer>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={`Choose Codex model. Current model: GPT-5.6 ${selectedModelLabel}`}
                    className="h-7 gap-1 px-1.5 text-xs font-normal text-muted-foreground"
                    disabled={disabled || !modelsQuery.data}
                    size="xs"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                GPT-5.6 {selectedModelLabel}
                <ChevronDownIcon className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-40 rounded-lg p-1"
                side="top"
              >
                {codexModels.map((option) => {
                  const available = findModel(modelsQuery.data, option.id);
                  const selected = option.id === selectedModelId;
                  return (
                    <DropdownMenuItem
                      className="gap-2 rounded-md px-2 py-1.5 text-xs font-normal"
                      disabled={!available}
                      key={option.id}
                      onClick={() => setSelectedModelId(option.id)}
                    >
                      <span className="min-w-0 flex-1">
                        GPT-5.6 {option.label}
                      </span>
                      {selected && (
                        <CheckIcon className="size-3.5 text-primary" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
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

function findModel(
  models: AssistantModel[] | undefined,
  modelId: CodexModelId,
): AssistantModel | undefined {
  return models?.find(
    (model) => model.id === modelId || model.model === modelId,
  );
}
