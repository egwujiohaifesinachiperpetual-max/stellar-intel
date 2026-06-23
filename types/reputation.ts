import { z } from 'zod';

export const OutcomeRowSchema = z.object({
  intentHash: z.string().regex(/^[0-9a-f]{64}$/, {
    message: 'intentHash must be a lowercase hex-encoded SHA-256 (64 chars)',
  }),
  anchorId: z.string().min(1),
  filled: z.boolean(),
  settleMs: z.number().nullable(),
  slippage: z.number().nullable(),
  recordedAt: z.number().int().positive(),
  disputed: z.boolean().optional(),
  disputed_reason: z.string().nullable().optional(),
});

export type OutcomeRow = z.infer<typeof OutcomeRowSchema>;

export interface DisputeRecord {
  id: string;
  intentHash: string;
  publicKey: string;
  anchorId: string;
  reason: string;
  disputed: true;
  createdAt: string;
}
