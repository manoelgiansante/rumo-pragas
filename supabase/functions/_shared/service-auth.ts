/**
 * Constant-work bearer verification for dedicated server-to-server Pragas jobs.
 * Both inputs are reduced to fixed-length SHA-256 digests before comparison, so
 * a wrong token length does not create the early-return oracle of string loops.
 */
export async function constantTimeEqualSecret(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function authenticateServiceBearer(
  req: Request,
  expectedSecret: string,
): Promise<boolean> {
  if (!expectedSecret) return false;
  const header = req.headers.get("Authorization") ?? "";
  // Bound attacker-controlled hashing work while still comparing a fixed
  // sentinel for malformed headers.
  const match = header.length <= 4096 ? /^Bearer ([^\s]+)$/.exec(header) : null;
  const supplied = match?.[1] ?? "__invalid_bearer__";
  const equal = await constantTimeEqualSecret(supplied, expectedSecret);
  return match !== null && equal;
}
