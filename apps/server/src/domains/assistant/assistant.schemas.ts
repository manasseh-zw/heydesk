import { z } from "zod";

export const startAssistantRunSchema = z.object({
  runId: z.string().min(1).max(200),
  message: z.string().trim().min(1).max(100_000),
  context: z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("page"),
        path: z.string().trim().min(1).max(2_000),
        expectedRevision: z.string().length(64),
      }),
      z.object({
        kind: z.literal("document"),
        path: z.string().trim().min(1).max(2_000),
        expectedRevision: z.string().length(64),
      }),
    ])
    .optional(),
  scope: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("workspace") }),
      z.object({
        kind: z.literal("home"),
        sessionId: z.string().uuid(),
      }),
      z.object({
        kind: z.literal("page"),
        path: z.string().trim().min(1).max(2_000),
      }),
      z.object({
        kind: z.literal("document"),
        path: z.string().trim().min(1).max(2_000),
      }),
    ])
    .optional(),
  preferences: z
    .object({
      model: z.string().trim().min(1).max(200),
      effort: z.string().trim().min(1).max(50),
      serviceTier: z.string().trim().min(1).max(100).optional(),
    })
    .optional(),
});

export const loginIdSchema = z.object({
  loginId: z.string().min(1).max(500),
});

export const assistantInteractionResponseSchema = z
  .object({
    approved: z.boolean().optional(),
    answers: z.record(z.string(), z.array(z.string().max(10_000))).optional(),
  })
  .refine(
    (value) => value.approved !== undefined || value.answers !== undefined,
    {
      message: "Provide an approval decision or answers.",
    },
  );

export const documentToolResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().max(20_000).optional(),
  revision: z.string().length(64).optional(),
});
