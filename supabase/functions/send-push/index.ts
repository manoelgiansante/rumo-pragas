/**
 * send-push edge function
 * =======================
 *
 * Fan-out: given a target audience + category + payload, look up active
 * push tokens in `pragas_push_tokens`, filter by user notification
 * preferences, dedup by notification_id, POST to Expo Push API with retry,
 * and write an audit row to `pragas_push_notifications`.
 *
 * SECURITY MODEL
 *  - Auth: service_role key required (this is a server-to-server endpoint).
 *    We reject any caller without the SUPABASE_SERVICE_ROLE_KEY in the
 *    `Authorization: Bearer` header. Mobile clients NEVER call this.
 *  - Idempotency: `notification_id` is the PRIMARY KEY of the audit table.
 *    Replays with the same id are no-ops returning the original status.
 *  - Filtering: outbreaks_regional / daily_reminder / news / marketing are
 *    each respected per-user. Category `transactional` (account events) is
 *    NEVER filtered — those always go through.
 *
 * RETRY MODEL
 *  - Expo Push API is called once per batch of ≤100 tokens (Expo limit).
 *  - On 5xx or network error: exponential backoff retry up to 3 attempts.
 *  - On `DeviceNotRegistered`: soft-revoke the row (is_active = false).
 *
 * INVOCATION
 *   POST /functions/v1/send-push
 *   Authorization: Bearer <SERVICE_ROLE_KEY>
 *   {
 *     "notification_id": "<uuid>",
 *     "category": "outbreaks_regional" | "daily_reminder" | "news" | "marketing" | "transactional",
 *     "title": "string",
 *     "body": "string",
 *     "data": { "screen": "diagnosis" | "paywall" | ..., "diagnosisId": "<uuid>" },
 *     "target_user_ids": ["uuid", ...]   // explicit list
 *       OR
 *     "target_state": "MG",              // broadcast: all users in a state
 *     "sender": "system" | string         // optional, default 'system'
 *   }
 *
 * RESPONSE
 *   { "ok": true, "notification_id": "...", "recipient_count": 12,
 *     "accepted_count": 11, "error_count": 1, "status": "partial" }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { captureException, captureMessage, withSentry } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100; // Expo hard limit per request
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 250;

// ---- Whitelists (mirror client useNotifications.ts) -----------------------

const VALID_CATEGORIES = new Set([
  'outbreaks_regional',
  'daily_reminder',
  'news',
  'marketing',
  'transactional',
]);
const VALID_SCREENS = new Set(['diagnosis', 'paywall', 'settings', 'history', 'home']);
const UUID_STRICT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---- Types -----------------------------------------------------------------

interface RequestBody {
  notification_id?: string;
  category?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  target_user_ids?: string[];
  target_state?: string;
  sender?: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

// ---- Helpers --------------------------------------------------------------

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

function sanitizeData(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object') return {};
  const data = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof data.screen === 'string' && VALID_SCREENS.has(data.screen)) {
    out.screen = data.screen;
  }
  if (typeof data.diagnosisId === 'string' && UUID_STRICT_RE.test(data.diagnosisId)) {
    out.diagnosisId = data.diagnosisId;
  }
  // Allow any other string-keyed primitive (string/number/boolean) for tracking
  for (const [k, v] of Object.entries(data)) {
    if (k === 'screen' || k === 'diagnosisId') continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function sendBatchWithRetry(
  messages: Array<{
    to: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    sound: string;
    channelId?: string;
  }>,
): Promise<ExpoTicket[]> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(messages),
      });

      if (res.status >= 500) {
        // Retryable
        lastErr = new Error(`expo_${res.status}`);
      } else if (!res.ok) {
        // 4xx — not retryable. Capture + return synthetic errors.
        const text = await res.text();
        await captureMessage('expo push 4xx', {
          level: 'warning',
          tags: { feature: 'send-push', status: String(res.status) },
          extra: { body: text.slice(0, 500) },
        });
        return messages.map(() => ({ status: 'error', message: `expo_${res.status}` }));
      } else {
        const payload = (await res.json()) as { data?: ExpoTicket[] };
        return payload.data ?? messages.map(() => ({ status: 'error', message: 'no_data' }));
      }
    } catch (err) {
      lastErr = err;
    }
    // Backoff before next attempt
    if (attempt < MAX_RETRIES) {
      await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
    }
  }
  await captureException(lastErr ?? new Error('expo_unknown'), {
    tags: { feature: 'send-push', step: 'expo_call' },
  });
  return messages.map(() => ({ status: 'error', message: 'expo_unreachable' }));
}

// ---- Handler --------------------------------------------------------------

async function handler(req: Request, { requestId }: { requestId: string }): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, { status: 405 });
  }

  // ── Service-role auth ────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const presented = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    // Misconfigured deployment — never silently accept.
    await captureMessage('send-push missing service role key', {
      level: 'fatal',
      tags: { feature: 'send-push', requestId },
    });
    return jsonResponse({ ok: false, error: 'misconfigured' }, { status: 500 });
  }
  if (presented !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // ── Body parsing + validation ────────────────────────────────────────
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const {
    notification_id,
    category,
    title,
    body: messageBody,
    data: rawData,
    target_user_ids,
    target_state,
    sender,
  } = body;

  if (!notification_id || typeof notification_id !== 'string' || notification_id.length < 8) {
    return jsonResponse({ ok: false, error: 'notification_id_required' }, { status: 400 });
  }
  if (!category || !VALID_CATEGORIES.has(category)) {
    return jsonResponse({ ok: false, error: 'invalid_category' }, { status: 400 });
  }
  if (!title || typeof title !== 'string' || title.length === 0 || title.length > 100) {
    return jsonResponse({ ok: false, error: 'invalid_title' }, { status: 400 });
  }
  if (
    !messageBody ||
    typeof messageBody !== 'string' ||
    messageBody.length === 0 ||
    messageBody.length > 240
  ) {
    return jsonResponse({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  if (!Array.isArray(target_user_ids) && typeof target_state !== 'string') {
    return jsonResponse(
      { ok: false, error: 'target_user_ids_or_target_state_required' },
      { status: 400 },
    );
  }

  const sanitizedData = sanitizeData(rawData);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Idempotency: short-circuit if we've already sent this id ────────
  const existing = await supabase
    .from('pragas_push_notifications')
    .select('notification_id, status, recipient_count, accepted_count, error_count')
    .eq('notification_id', notification_id)
    .maybeSingle();

  if (existing.data) {
    return jsonResponse({
      ok: true,
      ...existing.data,
      deduped: true,
      requestId,
    });
  }

  // Reserve the row (pending) so concurrent retries dedup against us.
  // ON CONFLICT DO NOTHING: if a race lost, exit with the existing row.
  const reserve = await supabase.from('pragas_push_notifications').insert({
    notification_id,
    sender: sender ?? 'system',
    category,
    payload: { title, body: messageBody, data: sanitizedData },
    status: 'pending',
  });

  if (reserve.error) {
    if (reserve.error.code === '23505') {
      // unique violation — another worker beat us; re-read and return.
      const again = await supabase
        .from('pragas_push_notifications')
        .select('notification_id, status, recipient_count, accepted_count, error_count')
        .eq('notification_id', notification_id)
        .maybeSingle();
      return jsonResponse({
        ok: true,
        ...(again.data ?? { notification_id }),
        deduped: true,
        requestId,
      });
    }
    await captureException(reserve.error, {
      tags: { feature: 'send-push', step: 'reserve', requestId },
    });
    return jsonResponse({ ok: false, error: 'reserve_failed' }, { status: 500 });
  }

  // ── Resolve recipients ──────────────────────────────────────────────
  // Step 1: active push tokens for the audience
  let tokensQuery = supabase
    .from('pragas_push_tokens')
    .select('user_id, expo_token, platform')
    .eq('is_active', true);

  if (Array.isArray(target_user_ids) && target_user_ids.length > 0) {
    tokensQuery = tokensQuery.in('user_id', target_user_ids);
  } else if (typeof target_state === 'string' && target_state.length > 0) {
    // Get user ids in the target state via a subselect
    const profiles = await supabase
      .from('pragas_profiles')
      .select('id')
      .eq('state', target_state);
    if (profiles.error) {
      await captureException(profiles.error, {
        tags: { feature: 'send-push', step: 'resolve_state', requestId },
      });
      return jsonResponse({ ok: false, error: 'resolve_failed' }, { status: 500 });
    }
    const ids = (profiles.data ?? []).map((p) => p.id);
    if (ids.length === 0) {
      await supabase
        .from('pragas_push_notifications')
        .update({ status: 'sent', recipient_count: 0 })
        .eq('notification_id', notification_id);
      return jsonResponse({
        ok: true,
        notification_id,
        recipient_count: 0,
        accepted_count: 0,
        error_count: 0,
        status: 'sent',
        requestId,
      });
    }
    tokensQuery = tokensQuery.in('user_id', ids);
  }

  const tokensRes = await tokensQuery;
  if (tokensRes.error) {
    await captureException(tokensRes.error, {
      tags: { feature: 'send-push', step: 'resolve_tokens', requestId },
    });
    return jsonResponse({ ok: false, error: 'resolve_failed' }, { status: 500 });
  }
  const allTokens = tokensRes.data ?? [];

  // Step 2: filter by user notification preferences (unless transactional)
  let eligibleTokens: typeof allTokens = [];
  if (category === 'transactional') {
    eligibleTokens = allTokens;
  } else {
    const userIds = [...new Set(allTokens.map((t) => t.user_id))];
    if (userIds.length === 0) {
      eligibleTokens = [];
    } else {
      const prefsRes = await supabase
        .from('pragas_profiles')
        .select('id, notification_preferences')
        .in('id', userIds);
      if (prefsRes.error) {
        await captureException(prefsRes.error, {
          tags: { feature: 'send-push', step: 'resolve_prefs', requestId },
        });
        return jsonResponse({ ok: false, error: 'resolve_failed' }, { status: 500 });
      }
      const optedInUsers = new Set<string>();
      for (const row of prefsRes.data ?? []) {
        const prefs = (row.notification_preferences ?? {}) as Record<string, unknown>;
        // Default to true for outbreaks_regional/daily_reminder/news (parity
        // with column DEFAULT), false for marketing.
        const defaults: Record<string, boolean> = {
          outbreaks_regional: true,
          daily_reminder: true,
          news: true,
          marketing: false,
        };
        const value = typeof prefs[category] === 'boolean' ? prefs[category] : defaults[category];
        if (value) optedInUsers.add(row.id);
      }
      eligibleTokens = allTokens.filter((t) => optedInUsers.has(t.user_id));
    }
  }

  // ── Send in batches of 100 ───────────────────────────────────────────
  let accepted = 0;
  let errors = 0;
  const invalidTokenIds: string[] = [];

  for (let i = 0; i < eligibleTokens.length; i += EXPO_BATCH_SIZE) {
    const batch = eligibleTokens.slice(i, i + EXPO_BATCH_SIZE);
    const messages = batch.map((row) => ({
      to: row.expo_token,
      title,
      body: messageBody,
      data: sanitizedData,
      sound: 'default',
      ...(row.platform === 'android' ? { channelId: 'pest-alerts' } : {}),
    }));
    const tickets = await sendBatchWithRetry(messages);
    for (let j = 0; j < tickets.length; j++) {
      const ticket = tickets[j];
      if (ticket.status === 'ok') {
        accepted += 1;
      } else {
        errors += 1;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          invalidTokenIds.push(batch[j].expo_token);
        }
      }
    }
  }

  // ── Soft-revoke dead tokens ──────────────────────────────────────────
  if (invalidTokenIds.length > 0) {
    const revoke = await supabase
      .from('pragas_push_tokens')
      .update({ is_active: false })
      .in('expo_token', invalidTokenIds);
    if (revoke.error) {
      await captureException(revoke.error, {
        tags: { feature: 'send-push', step: 'revoke', requestId },
      });
    }
  }

  const finalStatus: 'sent' | 'partial' | 'failed' =
    accepted === eligibleTokens.length && eligibleTokens.length > 0
      ? 'sent'
      : accepted > 0
        ? 'partial'
        : eligibleTokens.length === 0
          ? 'sent'
          : 'failed';

  const update = await supabase
    .from('pragas_push_notifications')
    .update({
      recipient_count: eligibleTokens.length,
      accepted_count: accepted,
      error_count: errors,
      status: finalStatus,
    })
    .eq('notification_id', notification_id);
  if (update.error) {
    await captureException(update.error, {
      tags: { feature: 'send-push', step: 'audit_update', requestId },
    });
  }

  return jsonResponse({
    ok: true,
    notification_id,
    recipient_count: eligibleTokens.length,
    accepted_count: accepted,
    error_count: errors,
    status: finalStatus,
    requestId,
  });
}

Deno.serve(withSentry('send-push', handler));
