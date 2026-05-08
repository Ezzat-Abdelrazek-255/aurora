/**
 * Run async `fn` over `items` with at most `concurrency` in flight. Used by
 * scripts that spawn ffmpeg / fan out HTTP — unbounded fan-out OOMs the host
 * or trips upstream rate limits. `fn` is responsible for catching its own
 * errors; an uncaught throw aborts the whole pool.
 */
export async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const idx = next++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx], idx);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
