import { z } from "zod";

export const artifactPathSchema = z.object({
  path: z.string().trim().min(1, "Choose a page or document."),
});
