export class BoundedBodyError extends Error {
  constructor(readonly code: "payload_too_large" | "invalid_json") {
    super(code);
    this.name = "BoundedBodyError";
  }
}

async function readBoundedBytes(
  source: Request | Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }
  const declared = source.headers.get("Content-Length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new BoundedBodyError("payload_too_large");
  }
  if (!source.body) return new Uint8Array();

  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("bounded_body_limit").catch(() => undefined);
        throw new BoundedBodyError("payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readBoundedText(
  source: Request | Response,
  maxBytes: number,
): Promise<string> {
  const bytes = await readBoundedBytes(source, maxBytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new BoundedBodyError("invalid_json");
  }
}

export async function readBoundedJson(
  source: Request | Response,
  maxBytes: number,
): Promise<unknown> {
  const text = await readBoundedText(source, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new BoundedBodyError("invalid_json");
  }
}
