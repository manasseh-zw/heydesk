import { z } from "zod";

export const createPageSchema = z.object({
  name: z.string().trim().min(1, "Name this page.").max(120),
});

export const pagePathSchema = z.object({
  path: z.string().trim().min(1, "Choose a page."),
});

export const writePageSchema = z.object({
  content: z.string().max(2 * 1024 * 1024),
  expectedRevision: z.string().length(64),
  origin: z.enum(["user", "quick-edit"]),
});

export const quickEditPageSchema = z
  .object({
    path: z.string().trim().min(1),
    expectedRevision: z.string().length(64),
    selectionMarkdown: z.string().trim().min(1).max(20_000),
    command: z.enum([
      "improve",
      "shorten",
      "summarize",
      "fix-grammar",
      "custom",
    ]),
    instruction: z.string().trim().max(2_000).optional(),
  })
  .refine(
    (value) => value.command !== "custom" || Boolean(value.instruction),
    { message: "Describe the custom edit.", path: ["instruction"] },
  );
