import { z } from "zod";

export const rpcEnvelopeSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        data: z.unknown().optional(),
      })
      .optional(),
  })
  .passthrough();

export const accountReadResponseSchema = z.object({
  account: z
    .object({
      type: z.string().optional(),
      email: z.string().optional(),
    })
    .passthrough()
    .nullable(),
  requiresOpenaiAuth: z.boolean(),
});

export const loginStartResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chatgpt"),
    loginId: z.string(),
    authUrl: z.string(),
  }),
  z.object({ type: z.literal("apiKey") }),
]);

export const modelListResponseSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.string(),
        model: z.string(),
        displayName: z.string(),
        hidden: z.boolean().default(false),
      })
      .passthrough(),
  ),
  nextCursor: z.string().nullable().optional(),
});

export const threadResponseSchema = z.object({
  thread: z.object({ id: z.string() }).passthrough(),
  model: z.string(),
});

export const turnResponseSchema = z.object({
  turn: z.object({ id: z.string() }).passthrough(),
});

export const codexNotificationParamsSchema = z
  .object({
    threadId: z.string().optional(),
    turnId: z.string().optional(),
    itemId: z.string().optional(),
    delta: z.string().optional(),
    message: z.string().optional(),
    thread: z.object({ id: z.string() }).passthrough().optional(),
    turn: z.object({ id: z.string() }).passthrough().optional(),
    item: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
