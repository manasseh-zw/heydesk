import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a workspace name.")
    .max(80, "Workspace names must be 80 characters or fewer.")
    .refine(
      (name) => !/[\\/:*?\"<>|]/.test(name),
      "Workspace names cannot contain \\, /, :, *, ?, \", <, >, or |.",
    )
    .refine((name) => name !== "." && name !== "..", "Choose another name."),
});

export const openWorkspaceSchema = z.object({
  path: z.string().trim().min(1, "Enter a folder path."),
});
