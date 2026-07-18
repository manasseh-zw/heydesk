import { z } from "zod";

export const documentPathSchema = z.object({
  path: z.string().trim().min(1, "Choose a document."),
});

export const createDocumentSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const importDocumentSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

export const documentRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/u);
