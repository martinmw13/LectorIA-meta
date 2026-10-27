// Shared HTTP retry and concurrency pool. One copy serves segment and
// classify so the retry policy stays identical and testable.
export interface RetryOpts {
  attempts?: number;
  backoffMs?: number;
}

export function isRetryable(status: number | null): boolean {
  if (status === null) return true; // network failure, no response
  return status === 429 || status >= 500;
}

export function retryableError(message: string): Error {
  return Object.assign(new Error(message), { retryable: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  opts?: RetryOpts,
): Promise<Response> {
  const attempts = opts?.attempts ?? 3;
  const backoffMs = opts?.backoffMs ?? 1000;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetchFn(url, init);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(backoffMs * attempt);
      continue;
    }
    if (response.ok) return response;
    const body = await response.text().catch(() => "");
    const message = `${url} failed with status ${response.status}: ${body.slice(0, 300)}`;
    if (!isRetryable(response.status) || attempt === attempts) {
      throw Object.assign(new Error(message), { status: response.status, retryable: false });
    }
    lastError = message;
    await sleep(backoffMs * attempt);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// Bounded parallelism that keeps input order in the output.
export async function runPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}
