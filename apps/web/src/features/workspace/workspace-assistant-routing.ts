export type ComposerCommandId =
  | "create-page"
  | "create-document"
  | "summarize-workspace"
  | "summarize-page"
  | "improve-page"
  | "make-page-concise"
  | "find-page-gaps"
  | "summarize-document"
  | "improve-document"
  | "review-document-structure"
  | "make-document-concise";

export type ComposerSubmission = {
  commandId?: ComposerCommandId;
};

const commandInstructions: Partial<Record<ComposerCommandId, string>> = {
  "create-page": "Create a page for this request.",
  "create-document": "Create a Word document for this request.",
  "summarize-workspace": "Summarize this workspace.",
  "summarize-page": "Summarize this page.",
  "improve-page": "Improve this page.",
  "make-page-concise": "Make this page more concise.",
  "find-page-gaps": "Find gaps in this page.",
  "summarize-document": "Summarize this document.",
  "improve-document": "Improve the writing in this document.",
  "review-document-structure": "Review this document's structure.",
  "make-document-concise": "Make this document more concise.",
};

export function messageForComposerSubmission(
  message: string,
  submission?: ComposerSubmission,
): string {
  const instruction = submission?.commandId
    ? commandInstructions[submission.commandId]
    : undefined;
  return instruction ? `${instruction}\n\n${message}` : message;
}
