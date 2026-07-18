import { Extension, type Editor } from "@tiptap/core";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

type SuggestionRange = {
  from: number;
  to: number;
};

type SuggestionTransaction =
  | { type: "show"; range: SuggestionRange }
  | { type: "clear" };

const suggestionPluginKey = new PluginKey<DecorationSet>(
  "pageQuickEditSuggestion",
);

export const PageQuickEditSuggestion = Extension.create({
  name: "pageQuickEditSuggestion",

  addProseMirrorPlugins() {
    return [createPageQuickEditSuggestionPlugin()];
  },
});

export function createPageQuickEditSuggestionPlugin() {
  return new Plugin<DecorationSet>({
    key: suggestionPluginKey,
    state: {
      init: () => DecorationSet.empty,
      apply(transaction, decorations) {
        const action = transaction.getMeta(suggestionPluginKey) as
          | SuggestionTransaction
          | undefined;

        if (action?.type === "clear") return DecorationSet.empty;
        if (action?.type === "show") {
          const from = Math.max(0, action.range.from);
          const to = Math.min(transaction.doc.content.size, action.range.to);
          if (from >= to) return DecorationSet.empty;

          return DecorationSet.create(transaction.doc, [
            Decoration.inline(from, to, {
              class:
                "rounded-sm bg-primary/20 ring-1 ring-inset ring-primary/20 box-decoration-clone",
              "data-page-quick-edit-suggestion": "true",
            }),
          ]);
        }

        return decorations.map(transaction.mapping, transaction.doc);
      },
    },
    props: {
      decorations(state) {
        return suggestionPluginKey.getState(state) ?? null;
      },
    },
  });
}

export function showPageQuickEditSuggestion(
  editor: Editor,
  range: SuggestionRange,
) {
  editor.view.dispatch(withPageQuickEditSuggestion(editor.state.tr, range));
}

export function clearPageQuickEditSuggestion(editor: Editor) {
  editor.view.dispatch(withoutPageQuickEditSuggestion(editor.state.tr));
}

export function getPageQuickEditSuggestionRange(
  state: EditorState,
): SuggestionRange | null {
  const [suggestion] = suggestionPluginKey.getState(state)?.find() ?? [];
  return suggestion ? { from: suggestion.from, to: suggestion.to } : null;
}

export function withPageQuickEditSuggestion(
  transaction: Transaction,
  range: SuggestionRange,
) {
  return transaction.setMeta(suggestionPluginKey, { type: "show", range });
}

export function withoutPageQuickEditSuggestion(transaction: Transaction) {
  return transaction.setMeta(suggestionPluginKey, { type: "clear" });
}
