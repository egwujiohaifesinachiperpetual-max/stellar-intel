import type { AnchorRate } from '@/types'

/**
 * Deduplicates anchor rates that share the same SEP-38 quote id.
 *
 * Occasionally two anchors proxy the same underlying liquidity pool and so issue
 * the same firm-quote id. Surfacing both as distinct options would double-count a
 * single pool, skewing the comparison. This collapses such collisions to one rate.
 *
 * Rules:
 *  - Keyed by {@link AnchorRate.quoteId}. Rates without a quoteId cannot collide
 *    and are always kept (e.g. SEP-24 fee rates, unavailable placeholders).
 *  - On collision, the earliest-received rate wins — the first quote observed for
 *    a pool is treated as canonical and later duplicates are dropped. "Earliest"
 *    is measured by {@link AnchorRate.updatedAt}; ties keep the incumbent, so
 *    input order breaks them.
 *  - Relative order of the surviving rates is preserved (a deduped rate keeps the
 *    position of its first appearance).
 */
export function dedupeByQuoteId(rates: AnchorRate[]): AnchorRate[] {
  // Resolve, per quote id, which rate wins on collision.
  const winners = new Map<string, AnchorRate>()
  for (const rate of rates) {
    if (rate.quoteId === undefined) continue
    const existing = winners.get(rate.quoteId)
    if (existing === undefined || rate.updatedAt.getTime() < existing.updatedAt.getTime()) {
      winners.set(rate.quoteId, rate)
    }
  }

  // Re-emit in original order. quoteId-less rates pass through untouched; each
  // colliding group is emitted once, at the position of its first appearance.
  const emitted = new Set<string>()
  const result: AnchorRate[] = []
  for (const rate of rates) {
    if (rate.quoteId === undefined) {
      result.push(rate)
      continue
    }
    if (emitted.has(rate.quoteId)) continue
    emitted.add(rate.quoteId)
    result.push(winners.get(rate.quoteId)!)
  }

  return result
}
