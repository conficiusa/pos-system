import { onlineManager } from "@tanstack/react-query";

const DEFAULT_API_TIMEOUT_MS = 8_000;

export type ApiFetchInit = RequestInit & {
  timeoutMs?: number;
  updateOnlineState?: boolean;
};

function createTimeoutError(timeoutMs: number) {
  const error = new Error(`Request timed out after ${timeoutMs}ms`);
  error.name = "ApiTimeoutError";
  return error;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: ApiFetchInit = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    updateOnlineState = true,
    signal,
    ...requestInit
  } = init;

  const controller = new AbortController();
  let timedOut = false;
  let abortedByCaller = signal?.aborted ?? false;

  const abortFromCaller = () => {
    abortedByCaller = true;
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, {
      ...requestInit,
      signal: controller.signal,
    });

    if (updateOnlineState) {
      onlineManager.setOnline(true);
    }

    return response;
  } catch (error) {
    if (updateOnlineState && (timedOut || !abortedByCaller)) {
      onlineManager.setOnline(false);
    }

    if (timedOut) {
      throw createTimeoutError(timeoutMs);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
