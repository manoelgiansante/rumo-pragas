export class UpstreamTimeoutError extends Error {
  constructor() {
    super("upstream_timeout");
    this.name = "UpstreamTimeoutError";
  }
}

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    if (controller.signal.aborted) throw new UpstreamTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
