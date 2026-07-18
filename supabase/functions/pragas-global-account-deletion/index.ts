import { BoundedBodyError, readBoundedJson } from "../_shared/bounded-body.ts";
import {
  consumeDurableRateLimit,
  fingerprintRateLimitRequest,
  normalizeRateLimitResult,
  rateLimitHeaders,
} from "../_shared/durable-rate-limit.ts";
import {
  appleIdentitySubject,
  AppleSignInRevocationError,
  exchangeAppleAuthorizationCode,
  isAppleAuthorizationCode,
  revokeAppleRefreshToken,
} from "../_shared/apple-sign-in-revocation.ts";
import {
  bearerToken,
  formatGlobalDeletionReceipt,
  GLOBAL_DELETION_CONFIRMATION,
  GLOBAL_DELETION_CONFIRMATION_VERSION,
  isHexSecret,
  isUuid,
  parseGlobalDeletionReceipt,
  parseValidatedSessionClaims,
  randomHexSecret,
  sha256Hex,
} from "../_shared/global-account-deletion-contract.ts";
import {
  createPragasAdminClient,
  getPragasCorsHeaders,
  jsonResponse,
} from "../_shared/pragas-edge.ts";
import { captureException, withSentry } from "../_shared/pragas-sentry.ts";

const MAX_BODY_BYTES = 16 * 1024;
const AUTHENTICATED_RATE_LIMIT = 6;
const STATUS_RATE_LIMIT = 30;

type JsonBody = Record<string, unknown>;

function isRecord(value: unknown): value is JsonBody {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function authenticatedContext(
  req: Request,
  admin: ReturnType<typeof createPragasAdminClient>,
): Promise<
  {
    userId: string;
    user: NonNullable<Awaited<ReturnType<typeof admin.auth.getUser>>["data"]["user"]>;
    claims: NonNullable<ReturnType<typeof parseValidatedSessionClaims>>;
  } | null
> {
  const token = bearerToken(req);
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  // auth.getUser above is the trust boundary. Decoding before it would accept
  // attacker-controlled claims and is intentionally forbidden.
  const claims = parseValidatedSessionClaims(token);
  if (!claims) return null;
  return { userId: user.id, user, claims };
}

function statusRateLimitActor(req: Request): string {
  for (const header of ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"]) {
    const raw = req.headers.get(header)?.split(",", 1)[0]?.trim() ?? "";
    if (/^[0-9a-f:.]{3,64}$/i.test(raw)) return `network:${raw.toLowerCase()}`;
  }
  // The fallback is intentionally shared and bounded. It preserves availability
  // for native/gateway variants without persisting any device identifier.
  return "network:unavailable";
}

function deletionResultResponse(
  result: Record<string, unknown> | null,
  headers: Record<string, string>,
  requestId: string,
): Response | null {
  if (
    !result || !isUuid(result.receipt_id) || result.pragas_access_suspended !== true ||
    result.pragas_push_revoked !== true || result.manual_global_processing !== true ||
    result.global_identity_deleted !== false ||
    !["revoked", "retry_pending", "not_required"].includes(
      String(result.apple_authorization_status),
    )
  ) return null;
  return jsonResponse(
    {
      ok: true,
      code: result.state === "already_requested"
        ? "GLOBAL_ACCOUNT_DELETION_ALREADY_REQUESTED"
        : "GLOBAL_ACCOUNT_DELETION_REQUESTED",
      receipt: formatGlobalDeletionReceipt(result.receipt_id),
      status: result.status,
      requestedAt: result.requested_at,
      dueAt: result.due_at,
      pragasAccessSuspended: true,
      pragasPushRevoked: true,
      appCleanupState: result.app_cleanup_state,
      appleAuthorizationStatus: result.apple_authorization_status,
      manualGlobalProcessing: true,
      globalIdentityDeleted: false,
    },
    { headers, requestId },
  );
}

async function reportStableFailure(step: string): Promise<void> {
  await captureException(new Error(`global_account_deletion_${step}_failed`), {
    tags: { fn: "pragas-global-account-deletion", step },
  });
}

type PublicAppleAuthorizationStatus = "revoked" | "retry_pending" | "not_required";

function publicAppleStatus(value: unknown): PublicAppleAuthorizationStatus | null {
  return value === "revoked" || value === "retry_pending" || value === "not_required"
    ? value
    : null;
}

function stableAppleError(error: unknown): string {
  return error instanceof AppleSignInRevocationError ? error.code : "apple_token_revocation_failed";
}

async function recordAppleRevocationResult(
  admin: ReturnType<typeof createPragasAdminClient>,
  userId: string,
  idempotencyKey: string,
  attemptToken: string,
  outcome: "revoked" | "retry_pending",
  detailCode: string,
): Promise<boolean> {
  const result = await admin.rpc("record_agrorumo_apple_revocation_result", {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
    p_attempt_token: attemptToken,
    p_outcome: outcome,
    p_detail_code: detailCode,
  });
  if (!result.error) return true;
  await reportStableFailure("apple_revocation_result_persist");
  return false;
}

interface AppleRevocationProcessResult {
  status: PublicAppleAuthorizationStatus;
  needsAuthorizationCode: boolean;
  retryAfterSeconds?: number;
}

/**
 * Resume Apple work only after the deletion reservation exists. Every external
 * effect is bracketed by durable DB state; a failure never withdraws the data
 * subject's accepted deletion request.
 */
async function processReservedAppleRevocation(
  admin: ReturnType<typeof createPragasAdminClient>,
  userId: string,
  idempotencyKey: string,
  appleSubject: string | null,
  authorizationCode: string | undefined,
): Promise<AppleRevocationProcessResult> {
  const authorizationCodeDigest = authorizationCode ? await sha256Hex(authorizationCode) : null;
  let attempt = await admin.rpc("begin_agrorumo_apple_revocation_attempt", {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
    p_authorization_code_digest: authorizationCodeDigest,
  });
  if (attempt.error) {
    await reportStableFailure("apple_revocation_attempt_reserve");
    return { status: "retry_pending", needsAuthorizationCode: false };
  }
  let attemptResult = (Array.isArray(attempt.data) ? attempt.data[0] : attempt.data) as
    | Record<string, unknown>
    | null;
  const currentStatus = publicAppleStatus(attemptResult?.apple_authorization_status);
  if (!attemptResult || typeof attemptResult.action !== "string" || !currentStatus) {
    await reportStableFailure("apple_revocation_attempt_contract");
    return { status: "retry_pending", needsAuthorizationCode: false };
  }
  if (attemptResult.action === "none") {
    return { status: currentStatus, needsAuthorizationCode: false };
  }
  if (attemptResult.action === "wait") {
    const retryAfterSeconds = typeof attemptResult.retry_after_seconds === "number" &&
        Number.isSafeInteger(attemptResult.retry_after_seconds) &&
        attemptResult.retry_after_seconds > 0 && attemptResult.retry_after_seconds <= 120
      ? attemptResult.retry_after_seconds
      : 1;
    return { status: "retry_pending", needsAuthorizationCode: false, retryAfterSeconds };
  }
  if (attemptResult.action === "needs_authorization_code") {
    return { status: "retry_pending", needsAuthorizationCode: true };
  }

  let attemptToken = isUuid(attemptResult.attempt_token) ? attemptResult.attempt_token : null;
  if (!attemptToken) {
    await reportStableFailure("apple_revocation_attempt_token_contract");
    return { status: "retry_pending", needsAuthorizationCode: false };
  }

  if (attemptResult.action === "exchange_code") {
    if (!authorizationCode || !appleSubject) {
      await recordAppleRevocationResult(
        admin,
        userId,
        idempotencyKey,
        attemptToken,
        "retry_pending",
        "apple_authorization_code_missing",
      );
      return { status: "retry_pending", needsAuthorizationCode: true };
    }
    try {
      const { refreshToken } = await exchangeAppleAuthorizationCode(
        authorizationCode,
        appleSubject,
      );
      const stored = await admin.rpc("store_agrorumo_apple_revocation_token", {
        p_user_id: userId,
        p_idempotency_key: idempotencyKey,
        p_attempt_token: attemptToken,
        p_authorization_code_digest: authorizationCodeDigest,
        p_refresh_token: refreshToken,
      });
      if (stored.error) {
        await reportStableFailure("apple_token_vault_store");
        await recordAppleRevocationResult(
          admin,
          userId,
          idempotencyKey,
          attemptToken,
          "retry_pending",
          "apple_token_vault_store_failed",
        );
        return { status: "retry_pending", needsAuthorizationCode: false };
      }
    } catch (error) {
      const code = stableAppleError(error);
      await reportStableFailure(code);
      await recordAppleRevocationResult(
        admin,
        userId,
        idempotencyKey,
        attemptToken,
        "retry_pending",
        code,
      );
      return { status: "retry_pending", needsAuthorizationCode: true };
    }

    attempt = await admin.rpc("begin_agrorumo_apple_revocation_attempt", {
      p_user_id: userId,
      p_idempotency_key: idempotencyKey,
      p_authorization_code_digest: null,
    });
    if (attempt.error) {
      await reportStableFailure("apple_revocation_after_vault_reserve");
      return { status: "retry_pending", needsAuthorizationCode: false };
    }
    attemptResult = (Array.isArray(attempt.data) ? attempt.data[0] : attempt.data) as
      | Record<string, unknown>
      | null;
    if (attemptResult?.action === "wait") {
      return { status: "retry_pending", needsAuthorizationCode: false, retryAfterSeconds: 1 };
    }
    attemptToken = isUuid(attemptResult?.attempt_token) ? attemptResult.attempt_token : null;
    if (attemptResult?.action !== "revoke_token" || !attemptToken) {
      await reportStableFailure("apple_revocation_after_vault_contract");
      return { status: "retry_pending", needsAuthorizationCode: false };
    }
  } else if (attemptResult.action !== "revoke_token") {
    await reportStableFailure("apple_revocation_unknown_action");
    return { status: "retry_pending", needsAuthorizationCode: false };
  }

  const claimed = await admin.rpc("claim_agrorumo_apple_revocation_token", {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
    p_attempt_token: attemptToken,
  });
  if (claimed.error || typeof claimed.data !== "string" || claimed.data.length < 16) {
    await reportStableFailure("apple_token_vault_claim");
    await recordAppleRevocationResult(
      admin,
      userId,
      idempotencyKey,
      attemptToken,
      "retry_pending",
      "apple_vault_token_unavailable",
    );
    return { status: "retry_pending", needsAuthorizationCode: false };
  }
  try {
    await revokeAppleRefreshToken(claimed.data);
  } catch (error) {
    const code = stableAppleError(error);
    await reportStableFailure(code);
    await recordAppleRevocationResult(
      admin,
      userId,
      idempotencyKey,
      attemptToken,
      "retry_pending",
      code,
    );
    return { status: "retry_pending", needsAuthorizationCode: false };
  }
  return await recordAppleRevocationResult(
      admin,
      userId,
      idempotencyKey,
      attemptToken,
      "revoked",
      "apple_authorization_revoked",
    )
    ? { status: "revoked", needsAuthorizationCode: false }
    : { status: "retry_pending", needsAuthorizationCode: false };
}

Deno.serve(withSentry("pragas-global-account-deletion", async (req, { requestId }) => {
  const cors = getPragasCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405, headers: cors, requestId });
  }

  const requestHash = await fingerprintRateLimitRequest(req, MAX_BODY_BYTES);
  if (!requestHash) {
    return jsonResponse({ error: "payload_too_large" }, {
      status: 413,
      headers: cors,
      requestId,
    });
  }

  let input: unknown;
  try {
    input = await readBoundedJson(req, MAX_BODY_BYTES);
  } catch (error) {
    const tooLarge = error instanceof BoundedBodyError && error.code === "payload_too_large";
    return jsonResponse(
      { error: tooLarge ? "payload_too_large" : "invalid_json" },
      { status: tooLarge ? 413 : 400, headers: cors, requestId },
    );
  }
  if (!isRecord(input) || typeof input.action !== "string") {
    return jsonResponse({ error: "invalid_request" }, { status: 400, headers: cors, requestId });
  }

  const admin = createPragasAdminClient();

  if (input.action === "status") {
    const receiptId = parseGlobalDeletionReceipt(input.receipt);
    if (!receiptId) {
      return jsonResponse({ error: "request_not_found" }, {
        status: 404,
        headers: cors,
        requestId,
      });
    }
    const statusRateResult = await admin.rpc("consume_agrorumo_deletion_status_rate_limit", {
      p_actor_key: statusRateLimitActor(req),
      p_limit: STATUS_RATE_LIMIT,
      p_window_seconds: 60,
    });
    const statusRateLimit = statusRateResult.error
      ? null
      : normalizeRateLimitResult(statusRateResult.data);
    if (!statusRateLimit) {
      await reportStableFailure("status_rate_limit");
      return jsonResponse({ error: "status_temporarily_unavailable" }, {
        status: 503,
        headers: { ...cors, "Retry-After": "30" },
        requestId,
      });
    }
    const statusHeaders = {
      ...cors,
      ...rateLimitHeaders(STATUS_RATE_LIMIT, statusRateLimit),
    };
    if (!statusRateLimit.allowed) {
      return jsonResponse({ error: "rate_limit_exceeded" }, {
        status: 429,
        headers: {
          ...statusHeaders,
          "Retry-After": String(Math.max(1, statusRateLimit.retryAfterSeconds)),
        },
        requestId,
      });
    }

    const { data, error } = await admin.rpc("get_agrorumo_account_deletion_status", {
      p_receipt_id: receiptId,
    });
    if (error) {
      await reportStableFailure("status_lookup");
      return jsonResponse({ error: "status_temporarily_unavailable" }, {
        status: 503,
        headers: { ...statusHeaders, "Retry-After": "30" },
        requestId,
      });
    }
    const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!result || result.found !== true) {
      return jsonResponse({ error: "request_not_found" }, {
        status: 404,
        headers: statusHeaders,
        requestId,
      });
    }
    return jsonResponse(
      {
        ok: true,
        code: "GLOBAL_ACCOUNT_DELETION_STATUS",
        status: result.status,
        requestedAt: result.requested_at,
        dueAt: result.due_at,
        lastStatusAt: result.last_status_at,
        completedAt: result.completed_at,
        appCleanupState: result.app_cleanup_state,
        appleAuthorizationStatus: result.apple_authorization_status,
        manualGlobalProcessing: true,
      },
      { headers: statusHeaders, requestId },
    );
  }

  const context = await authenticatedContext(req, admin);
  if (!context) {
    return jsonResponse({ error: "unauthorized" }, { status: 401, headers: cors, requestId });
  }

  if (input.action === "begin") {
    const rateLimit = await consumeDurableRateLimit(admin, {
      userId: context.userId,
      scope: "delete_user_account",
      limit: AUTHENTICATED_RATE_LIMIT,
      windowSeconds: 86_400,
      idempotencyKey: requestId,
      requestHash,
    });
    if (!rateLimit) {
      return jsonResponse({ error: "rate_limit_temporarily_unavailable" }, {
        status: 503,
        headers: { ...cors, "Retry-After": "30" },
        requestId,
      });
    }
    const headers = {
      ...cors,
      ...rateLimitHeaders(AUTHENTICATED_RATE_LIMIT, rateLimit),
    };
    if (rateLimit.conflict) {
      return jsonResponse({ error: "idempotency_key_conflict" }, {
        status: 409,
        headers,
        requestId,
      });
    }
    if (!rateLimit.allowed) {
      return jsonResponse({ error: "rate_limit_exceeded" }, {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(Math.max(1, rateLimit.retryAfterSeconds)),
        },
        requestId,
      });
    }
    const challengeId = crypto.randomUUID();
    const challengeSecret = randomHexSecret();
    const secretDigest = await sha256Hex(challengeSecret);
    const { data, error } = await admin.rpc("begin_agrorumo_account_deletion_challenge", {
      p_user_id: context.userId,
      p_initial_session_id: context.claims.sessionId,
      p_challenge_id: challengeId,
      p_secret_digest: secretDigest,
      p_confirmation_version: GLOBAL_DELETION_CONFIRMATION_VERSION,
    });
    if (error) {
      await reportStableFailure("challenge_create");
      return jsonResponse({ error: "challenge_temporarily_unavailable" }, {
        status: 503,
        headers: { ...headers, "Retry-After": "30" },
        requestId,
      });
    }
    const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!result || typeof result.state !== "string") {
      await reportStableFailure("challenge_contract");
      return jsonResponse({ error: "challenge_temporarily_unavailable" }, {
        status: 503,
        headers: { ...headers, "Retry-After": "30" },
        requestId,
      });
    }
    if (result.state === "already_requested" && isUuid(result.receipt_id)) {
      return jsonResponse(
        {
          ok: true,
          code: "GLOBAL_ACCOUNT_DELETION_ALREADY_REQUESTED",
          receipt: formatGlobalDeletionReceipt(result.receipt_id),
          status: result.status,
          requestedAt: result.requested_at,
          dueAt: result.due_at,
          appCleanupState: result.app_cleanup_state,
          appleAuthorizationStatus: result.apple_authorization_status,
          pragasAccessSuspended: true,
          manualGlobalProcessing: true,
          globalIdentityDeleted: false,
        },
        { headers, requestId },
      );
    }
    if (result.state !== "challenge_created") {
      await reportStableFailure("challenge_state");
      return jsonResponse({ error: "challenge_temporarily_unavailable" }, {
        status: 503,
        headers: { ...headers, "Retry-After": "30" },
        requestId,
      });
    }
    return jsonResponse(
      {
        ok: true,
        code: "REAUTHENTICATION_REQUIRED",
        challengeId,
        challengeSecret,
        reauthenticateAfter: result.reauthentication_not_before_at,
        expiresAt: result.expires_at,
        confirmationVersion: GLOBAL_DELETION_CONFIRMATION_VERSION,
      },
      { headers, requestId },
    );
  }

  if (input.action === "resume_apple_revocation") {
    const idempotencyKey = req.headers.get("Idempotency-Key");
    const receiptId = parseGlobalDeletionReceipt(input.receipt);
    if (!isUuid(idempotencyKey) || !receiptId) {
      return jsonResponse({ error: "invalid_apple_revocation_resume" }, {
        status: 400,
        headers: cors,
        requestId,
      });
    }
    const rateLimit = await consumeDurableRateLimit(admin, {
      userId: context.userId,
      scope: "delete_user_account",
      limit: AUTHENTICATED_RATE_LIMIT,
      windowSeconds: 86_400,
      idempotencyKey: requestId,
      requestHash,
    });
    if (!rateLimit) {
      return jsonResponse({ error: "rate_limit_temporarily_unavailable" }, {
        status: 503,
        headers: { ...cors, "Retry-After": "30" },
        requestId,
      });
    }
    const headers = {
      ...cors,
      ...rateLimitHeaders(AUTHENTICATED_RATE_LIMIT, rateLimit),
    };
    if (!rateLimit.allowed) {
      return jsonResponse({ error: "rate_limit_exceeded" }, {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(Math.max(1, rateLimit.retryAfterSeconds)),
        },
        requestId,
      });
    }
    const replayLookup = await admin.rpc("get_agrorumo_account_deletion_replay", {
      p_user_id: context.userId,
      p_idempotency_key: idempotencyKey,
    });
    if (replayLookup.error) {
      const message = typeof replayLookup.error.message === "string"
        ? replayLookup.error.message
        : "";
      if (message.includes("global_deletion_idempotency_conflict")) {
        return jsonResponse({ error: "idempotency_key_conflict" }, {
          status: 409,
          headers,
          requestId,
        });
      }
      await reportStableFailure("apple_resume_lookup");
      return jsonResponse({ error: "apple_revocation_resume_unavailable" }, {
        status: 503,
        headers: { ...headers, "Retry-After": "30" },
        requestId,
      });
    }
    const replay = (Array.isArray(replayLookup.data) ? replayLookup.data[0] : replayLookup.data) as
      | Record<string, unknown>
      | null;
    if (
      replay?.state !== "already_requested" || replay.receipt_id !== receiptId ||
      !publicAppleStatus(replay.apple_authorization_status)
    ) {
      return jsonResponse({ error: "request_not_found" }, {
        status: 404,
        headers,
        requestId,
      });
    }
    if (
      input.appleAuthorizationCode !== undefined &&
      !isAppleAuthorizationCode(input.appleAuthorizationCode)
    ) {
      return jsonResponse({ error: "invalid_apple_authorization_code" }, {
        status: 400,
        headers,
        requestId,
      });
    }
    const appleSubject = appleIdentitySubject(context.user);
    if (appleSubject === "") {
      return jsonResponse({ error: "apple_identity_mismatch" }, {
        status: 422,
        headers,
        requestId,
      });
    }
    if (appleSubject === null && input.appleAuthorizationCode !== undefined) {
      return jsonResponse({ error: "unexpected_apple_authorization_code" }, {
        status: 400,
        headers,
        requestId,
      });
    }
    const appleResult = await processReservedAppleRevocation(
      admin,
      context.userId,
      idempotencyKey,
      appleSubject,
      input.appleAuthorizationCode,
    );
    if (appleResult.needsAuthorizationCode) {
      return jsonResponse({ error: "apple_reauthentication_required" }, {
        status: 403,
        headers,
        requestId,
      });
    }
    const responseHeaders = appleResult.retryAfterSeconds
      ? { ...headers, "Retry-After": String(appleResult.retryAfterSeconds) }
      : headers;
    const response = deletionResultResponse(
      { ...replay, apple_authorization_status: appleResult.status },
      responseHeaders,
      requestId,
    );
    if (!response) {
      await reportStableFailure("apple_resume_contract");
      return jsonResponse({ error: "apple_revocation_resume_unavailable" }, {
        status: 503,
        headers: { ...headers, "Retry-After": "30" },
        requestId,
      });
    }
    return response;
  }

  if (input.action !== "confirm") {
    return jsonResponse({ error: "invalid_action" }, { status: 400, headers: cors, requestId });
  }
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (
    !isUuid(idempotencyKey) || !isUuid(input.challengeId) ||
    !isHexSecret(input.challengeSecret) ||
    input.confirmation !== GLOBAL_DELETION_CONFIRMATION ||
    input.confirmationVersion !== GLOBAL_DELETION_CONFIRMATION_VERSION
  ) {
    return jsonResponse({ error: "explicit_global_confirmation_required" }, {
      status: 400,
      headers: cors,
      requestId,
    });
  }
  // Apple authorization codes are intentionally excluded: a crash after code
  // exchange may require a new code while preserving the same durable request
  // idempotency key. The confirmation/challenge identity remains immutable.
  const confirmRateLimitHash = await sha256Hex(
    `global-delete-confirm:${idempotencyKey}:${input.challengeId}:${input.challengeSecret}`,
  );
  const rateLimit = await consumeDurableRateLimit(admin, {
    userId: context.userId,
    scope: "delete_user_account",
    limit: AUTHENTICATED_RATE_LIMIT,
    windowSeconds: 86_400,
    idempotencyKey,
    requestHash: confirmRateLimitHash,
  });
  if (!rateLimit) {
    return jsonResponse({ error: "rate_limit_temporarily_unavailable" }, {
      status: 503,
      headers: { ...cors, "Retry-After": "30" },
      requestId,
    });
  }
  const headers = {
    ...cors,
    ...rateLimitHeaders(AUTHENTICATED_RATE_LIMIT, rateLimit),
  };
  if (rateLimit.conflict) {
    return jsonResponse({ error: "idempotency_key_conflict" }, {
      status: 409,
      headers,
      requestId,
    });
  }
  if (!rateLimit.allowed) {
    return jsonResponse({ error: "rate_limit_exceeded" }, {
      status: 429,
      headers: {
        ...headers,
        "Retry-After": String(Math.max(1, rateLimit.retryAfterSeconds)),
      },
      requestId,
    });
  }
  if (!context.claims.reauthenticationMethod || !context.claims.authenticationAt) {
    return jsonResponse({ error: "fresh_reauthentication_required" }, {
      status: 403,
      headers,
      requestId,
    });
  }
  // Both the new session issue time and its actual AMR event must be recent.
  // A refresh token may create a new JWT `iat`, but it keeps the older AMR
  // timestamp and therefore cannot satisfy this proof.
  const now = Date.now();
  if (
    context.claims.authenticationAt.getTime() < now - 15 * 60 * 1_000 ||
    context.claims.authenticationAt.getTime() > now + 60 * 1_000
  ) {
    return jsonResponse({ error: "fresh_reauthentication_required" }, {
      status: 403,
      headers,
      requestId,
    });
  }

  const replayLookup = await admin.rpc("get_agrorumo_account_deletion_replay", {
    p_user_id: context.userId,
    p_idempotency_key: idempotencyKey,
  });
  if (replayLookup.error) {
    const message = typeof replayLookup.error.message === "string"
      ? replayLookup.error.message
      : "";
    if (message.includes("global_deletion_idempotency_conflict")) {
      return jsonResponse({ error: "idempotency_key_conflict" }, {
        status: 409,
        headers,
        requestId,
      });
    }
    await reportStableFailure("replay_lookup");
    return jsonResponse({ error: "request_not_saved" }, {
      status: 503,
      headers: { ...headers, "Retry-After": "30" },
      requestId,
    });
  }
  const replay = (Array.isArray(replayLookup.data) ? replayLookup.data[0] : replayLookup.data) as
    | Record<string, unknown>
    | null;
  if (replay?.state !== "already_requested" && replay?.state !== "not_found") {
    await reportStableFailure("replay_state");
    return jsonResponse({ error: "request_not_saved" }, {
      status: 503,
      headers: { ...headers, "Retry-After": "30" },
      requestId,
    });
  }

  const appleSubject = appleIdentitySubject(context.user);
  const appleAuthorizationCode = isAppleAuthorizationCode(input.appleAuthorizationCode)
    ? input.appleAuthorizationCode
    : undefined;
  let result = replay?.state === "already_requested" ? replay : null;

  if (replay?.state === "not_found") {
    if (appleSubject === "") {
      return jsonResponse({ error: "apple_identity_mismatch" }, {
        status: 422,
        headers,
        requestId,
      });
    }
    if (appleSubject !== null && !appleAuthorizationCode) {
      return jsonResponse({ error: "apple_reauthentication_required" }, {
        status: 403,
        headers,
        requestId,
      });
    }
    if (appleSubject === null && input.appleAuthorizationCode !== undefined) {
      return jsonResponse({ error: "unexpected_apple_authorization_code" }, {
        status: 400,
        headers,
        requestId,
      });
    }
    const secretDigest = await sha256Hex(input.challengeSecret);
    const authorizationCodeDigest = appleAuthorizationCode
      ? await sha256Hex(appleAuthorizationCode)
      : null;
    const reservation = await admin.rpc("reserve_agrorumo_account_deletion_request", {
      p_user_id: context.userId,
      p_current_session_id: context.claims.sessionId,
      p_current_session_issued_at: context.claims.issuedAt.toISOString(),
      p_reauthentication_at: context.claims.authenticationAt.toISOString(),
      p_challenge_id: input.challengeId,
      p_challenge_secret_digest: secretDigest,
      p_confirmation_version: GLOBAL_DELETION_CONFIRMATION_VERSION,
      p_reauthentication_method: context.claims.reauthenticationMethod,
      p_has_apple_authorization_code: Boolean(appleAuthorizationCode),
      p_apple_authorization_code_digest: authorizationCodeDigest,
      p_idempotency_key: idempotencyKey,
      p_receipt_id: crypto.randomUUID(),
    });
    if (reservation.error) {
      const message = typeof reservation.error.message === "string"
        ? reservation.error.message
        : "";
      if (
        message.includes("fresh_reauthentication_required") ||
        message.includes("global_deletion_challenge_invalid_or_expired")
      ) {
        return jsonResponse({ error: "fresh_reauthentication_required" }, {
          status: 403,
          headers,
          requestId,
        });
      }
      if (message.includes("global_deletion_idempotency_conflict")) {
        return jsonResponse({ error: "idempotency_key_conflict" }, {
          status: 409,
          headers,
          requestId,
        });
      }
      await reportStableFailure("request_reservation");
      return jsonResponse({ error: "request_not_saved" }, {
        status: 503,
        headers: { ...headers, "Retry-After": "30" },
        requestId,
      });
    }
    result = (Array.isArray(reservation.data) ? reservation.data[0] : reservation.data) as
      | Record<string, unknown>
      | null;
  }

  if (!result || !publicAppleStatus(result.apple_authorization_status)) {
    await reportStableFailure("request_contract_before_apple");
    return jsonResponse({ error: "request_not_saved" }, {
      status: 503,
      headers: { ...headers, "Retry-After": "30" },
      requestId,
    });
  }
  const appleResult = await processReservedAppleRevocation(
    admin,
    context.userId,
    idempotencyKey,
    appleSubject,
    appleAuthorizationCode,
  );
  const response = deletionResultResponse(
    { ...result, apple_authorization_status: appleResult.status },
    headers,
    requestId,
  );
  if (!response) {
    await reportStableFailure("request_contract");
    return jsonResponse({ error: "request_not_saved" }, {
      status: 503,
      headers: { ...headers, "Retry-After": "30" },
      requestId,
    });
  }

  return response;
}));
