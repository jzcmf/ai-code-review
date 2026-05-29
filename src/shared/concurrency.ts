/**
 * 以固定并发上限执行异步任务，按输入顺序返回结果。
 */
export async function runWithConcurrency<T, TResult>(
  items: T[],
  handler: (item: T, index: number) => Promise<TResult>,
  limit = 3
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length)
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await handler(items[idx], idx)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}
