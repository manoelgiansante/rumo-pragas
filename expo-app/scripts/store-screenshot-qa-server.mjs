#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { STORE_QA_PROFILE, buildExpoConfig } = require('../app.config.js');

export const QA_BIND_HOST = '127.0.0.1';
export const QA_DIAGNOSIS_PATH = '/functions/v1/diagnose-pragas';

const QA_MODE = 'draft-screenshots';
const AI_CONSENT_VERSION = '2026-07-14.1';
const MAX_DIAGNOSIS_BODY_BYTES = 15_000_000;
const MAX_IMAGE_BASE64_CHARS = 10_000_000;
const MAX_UPSTREAM_JSON_BYTES = 1_000_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_PATH_DECODE_PASSES = 8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9._~+\/-]{16,8192}=*)$/;
const PROXY_PATH_PATTERN = /^\/(?:auth|rest|storage)\/v1(?:\/|$)/;
const PROXY_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const REDIRECT_STATUSES = new Set([300, 301, 302, 303, 305, 307, 308]);
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const HEADER_TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const QA_DRAFT_PEST_ID = 'qa_draft_not_a_diagnosis_x9k2';
const QA_DRAFT_TITLE = 'QA-DRAFT-NÃO-É-DIAGNÓSTICO-X9K2';
const VALID_CROPS = new Map([
  ['Soybean', 'soja'],
  ['Corn', 'milho'],
  ['Coffee', 'cafe'],
  ['Cotton', 'algodao'],
  ['Sugarcane', 'cana'],
  ['Wheat', 'trigo'],
  ['Rice', 'arroz'],
  ['Bean', 'feijao'],
  ['Potato', 'batata'],
  ['Tomato', 'tomate'],
  ['Cassava', 'mandioca'],
  ['Citrus', 'citros'],
  ['Grape', 'uva'],
  ['Banana', 'banana'],
  ['Sorghum', 'sorgo'],
  ['Peanut', 'amendoim'],
  ['Sunflower', 'girassol'],
  ['Onion', 'cebola'],
]);
class RequestValidationError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function requiredEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsePort(raw, name, { allowZero = false } = {}) {
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer`);
  const value = Number(raw);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum || value > 65_535) {
    throw new Error(`${name} must be between ${minimum} and 65535`);
  }
  return value;
}

function readTlsFile(path, name) {
  try {
    return readFileSync(path);
  } catch {
    throw new Error(`${name} could not be read`);
  }
}

function readJsonFile(url, name) {
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch {
    throw new Error(`${name} could not be validated`);
  }
}

function assertBlank(env, name) {
  if ((env[name] ?? '').trim() !== '') {
    throw new Error(`${name} must be empty for ${STORE_QA_PROFILE}`);
  }
}

function validateQaClientUrl(raw, port) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be the local QA HTTPS origin');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== QA_BIND_HOST ||
    Number(url.port) !== port ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be the local QA HTTPS origin');
  }
  return url;
}

export function validateStoreQaBuildContract(env = process.env) {
  if (requiredEnv(env, 'EAS_BUILD_PROFILE') !== STORE_QA_PROFILE) {
    throw new Error(`EAS_BUILD_PROFILE must equal ${STORE_QA_PROFILE}`);
  }
  if (requiredEnv(env, 'NODE_ENV') !== 'development') {
    throw new Error(`NODE_ENV must equal development for ${STORE_QA_PROFILE}`);
  }
  if (requiredEnv(env, 'EXPO_PUBLIC_ENABLE_ANALYTICS') !== 'false') {
    throw new Error(`EXPO_PUBLIC_ENABLE_ANALYTICS must equal false for ${STORE_QA_PROFILE}`);
  }
  if (requiredEnv(env, 'SENTRY_DISABLE_AUTO_UPLOAD') !== 'true') {
    throw new Error(`SENTRY_DISABLE_AUTO_UPLOAD must equal true for ${STORE_QA_PROFILE}`);
  }
  assertBlank(env, 'EXPO_PUBLIC_SENTRY_DSN');
  assertBlank(env, 'SENTRY_AUTH_TOKEN');

  const eas = readJsonFile(new URL('../eas.json', import.meta.url), 'eas.json');
  const profile = eas?.build?.[STORE_QA_PROFILE];
  if (
    profile?.environment !== 'development' ||
    profile?.developmentClient !== true ||
    profile?.distribution !== 'internal' ||
    profile?.android?.buildType !== 'apk' ||
    profile?.ios?.simulator !== true ||
    profile?.channel !== undefined ||
    profile?.env?.NODE_ENV !== 'development' ||
    profile?.env?.EXPO_PUBLIC_ENABLE_ANALYTICS !== 'false' ||
    Object.hasOwn(profile?.env ?? {}, 'EXPO_PUBLIC_SENTRY_DSN') ||
    profile?.env?.SENTRY_DISABLE_AUTO_UPLOAD !== 'true'
  ) {
    throw new Error(`eas.json ${STORE_QA_PROFILE} profile is not fail-closed`);
  }

  const appJson = readJsonFile(new URL('../app.json', import.meta.url), 'app.json');
  const resolved = buildExpoConfig(appJson.expo, env);
  if (
    resolved?.updates?.enabled !== false ||
    resolved?.updates?.checkAutomatically !== 'NEVER' ||
    resolved?.extra?.storeQa?.draftOnly !== true ||
    resolved?.extra?.storeQa?.profile !== STORE_QA_PROFILE ||
    resolved?.extra?.storeQa?.telemetryDisabled !== true ||
    resolved?.extra?.storeQa?.updatesDisabled !== true
  ) {
    throw new Error(`app.config.js ${STORE_QA_PROFILE} isolation is not active`);
  }

  return { profile, resolved };
}

export function validateLocalUpstream(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('STORE_QA_UPSTREAM_URL must be a valid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('STORE_QA_UPSTREAM_URL must use http or https');
  }
  if (url.hostname !== QA_BIND_HOST) {
    throw new Error('STORE_QA_UPSTREAM_URL must use the 127.0.0.1 allowlist');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('STORE_QA_UPSTREAM_URL cannot contain credentials, query, or fragment');
  }
  if (url.pathname !== '/' || !url.port) {
    throw new Error('STORE_QA_UPSTREAM_URL must be a local origin with an explicit port');
  }
  return url;
}

export function loadStoreQaConfig(env = process.env) {
  if (requiredEnv(env, 'STORE_QA_MODE') !== QA_MODE) {
    throw new Error(`STORE_QA_MODE must equal ${QA_MODE}`);
  }
  if (env.STORE_QA_BIND_HOST !== undefined) {
    throw new Error('STORE_QA_BIND_HOST is not configurable');
  }

  validateStoreQaBuildContract(env);

  const upstreamUrl = validateLocalUpstream(requiredEnv(env, 'STORE_QA_UPSTREAM_URL'));
  const anonKey = requiredEnv(env, 'STORE_QA_ANON_KEY');
  if (anonKey.length < 20 || /\s/.test(anonKey)) {
    throw new Error('STORE_QA_ANON_KEY has an invalid shape');
  }

  const port = parsePort(requiredEnv(env, 'STORE_QA_LISTEN_PORT'), 'STORE_QA_LISTEN_PORT');
  if (upstreamUrl.hostname === QA_BIND_HOST && Number(upstreamUrl.port) === port) {
    throw new Error('STORE_QA_UPSTREAM_URL cannot point back to the QA listener');
  }
  const clientUrl = validateQaClientUrl(requiredEnv(env, 'EXPO_PUBLIC_SUPABASE_URL'), port);
  if (requiredEnv(env, 'EXPO_PUBLIC_SUPABASE_ANON_KEY') !== anonKey) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY must match STORE_QA_ANON_KEY');
  }

  const certificatePath = requiredEnv(env, 'STORE_QA_TLS_CERT_PATH');
  const privateKeyPath = requiredEnv(env, 'STORE_QA_TLS_KEY_PATH');
  if (certificatePath === privateKeyPath) {
    throw new Error('STORE_QA TLS certificate and private key must be different files');
  }

  return {
    upstreamUrl,
    clientUrl,
    anonKey,
    port,
    tls: {
      cert: readTlsFile(certificatePath, 'STORE_QA_TLS_CERT_PATH'),
      key: readTlsFile(privateKeyPath, 'STORE_QA_TLS_KEY_PATH'),
    },
  };
}

function safeRequestTarget(raw) {
  if (
    typeof raw !== 'string' ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\') ||
    raw.includes('#') ||
    /[\u0000-\u0020\u007f]/.test(raw)
  ) {
    return null;
  }

  const queryIndex = raw.indexOf('?');
  const rawPath = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  if (!rawPath || /%(?![0-9a-f]{2})/i.test(rawPath)) return null;

  for (const segment of rawPath.split('/')) {
    let decoded = segment;
    for (let pass = 0; pass < MAX_PATH_DECODE_PASSES; pass += 1) {
      if (decoded === '.' || decoded === '..' || /[\\/?#\u0000-\u001f\u007f]/.test(decoded)) {
        return null;
      }
      if (!/%[0-9a-f]{2}/i.test(decoded)) break;
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch {
        return null;
      }
    }
    if (
      decoded === '.' ||
      decoded === '..' ||
      /[\\/?#\u0000-\u001f\u007f]/.test(decoded) ||
      /%[0-9a-f]{2}/i.test(decoded)
    ) {
      return null;
    }
  }

  return { rawPath, rawTarget: raw, hasQuery: queryIndex !== -1 };
}

function respondJson(response, status, body, extraHeaders = {}) {
  if (response.headersSent || response.destroyed) return;
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    'content-type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  response.end(payload);
}

async function readBoundedBody(request, maximumBytes) {
  const declaredLength = request.headers['content-length'];
  if (declaredLength !== undefined) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximumBytes) {
      throw new RequestValidationError(413, 'qa_payload_too_large');
    }
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > maximumBytes) {
      throw new RequestValidationError(413, 'qa_payload_too_large');
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

function validateDiagnosisBody(raw) {
  let value;
  try {
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new RequestValidationError(400, 'qa_invalid_json');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RequestValidationError(400, 'qa_invalid_body');
  }

  const allowedKeys = new Set(['image_base64', 'crop_type', 'latitude', 'longitude']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new RequestValidationError(400, 'qa_unknown_body_field');
  }

  const crop = VALID_CROPS.get(value.crop_type);
  if (!crop) throw new RequestValidationError(400, 'qa_invalid_crop');
  if (
    (value.latitude !== undefined && value.latitude !== null) ||
    (value.longitude !== undefined && value.longitude !== null)
  ) {
    throw new RequestValidationError(400, 'qa_location_forbidden');
  }
  if (typeof value.image_base64 !== 'string' || value.image_base64.length === 0) {
    throw new RequestValidationError(400, 'qa_invalid_image');
  }

  const dataUrl = /^data:image\/(jpeg|png|gif|webp);base64,/.exec(value.image_base64);
  if (value.image_base64.startsWith('data:') && !dataUrl) {
    throw new RequestValidationError(400, 'qa_invalid_image');
  }
  const base64 = dataUrl ? value.image_base64.slice(dataUrl[0].length) : value.image_base64;
  if (
    base64.length > MAX_IMAGE_BASE64_CHARS ||
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  ) {
    throw new RequestValidationError(400, 'qa_invalid_image');
  }

  const bytes = Buffer.from(base64, 'base64');
  const isPng =
    bytes.length >= 33 &&
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.toString('ascii', 12, 16) === 'IHDR';
  const isJpeg =
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9;
  const isGif =
    bytes.length >= 7 &&
    ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) &&
    bytes[bytes.length - 1] === 0x3b;
  const isWebp =
    bytes.length >= 16 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP';
  const detectedMime = isPng ? 'png' : isJpeg ? 'jpeg' : isGif ? 'gif' : isWebp ? 'webp' : null;
  if (!detectedMime || (dataUrl && dataUrl[1] !== detectedMime)) {
    throw new RequestValidationError(400, 'qa_invalid_image');
  }

  return { crop };
}

function extractBearer(request) {
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string') return null;
  return BEARER_PATTERN.exec(authorization)?.[1] ?? null;
}

async function fetchBoundedJson(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    });
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPSTREAM_JSON_BYTES) {
      await response.body?.cancel();
      throw new Error('upstream_json_too_large');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_UPSTREAM_JSON_BYTES) throw new Error('upstream_json_too_large');
    let body = null;
    if (bytes.length > 0) body = JSON.parse(bytes.toString('utf8'));
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticateWithUpstream(config, token) {
  const url = new URL('/auth/v1/user', config.upstreamUrl);
  let result;
  try {
    result = await fetchBoundedJson(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        apikey: config.anonKey,
        authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new RequestValidationError(503, 'qa_auth_unavailable');
  }

  const userId = result.body?.id;
  if (!result.response.ok || typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    throw new RequestValidationError(401, 'qa_invalid_session');
  }
  return userId;
}

function deterministicUuid(userId) {
  const hex = createHash('sha256')
    .update(`rumo-pragas-store-qa-draft-v1:${userId}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const normalized = hex.join('');
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

function buildDraftFixture(userId, crop) {
  const legalWarning =
    'QA/DRAFT local: conteúdo sintético de regressão visual. Não confirma diagnóstico, não mede gravidade e não substitui avaliação em campo por profissional habilitado.';
  const notes = {
    message:
      'QA/DRAFT — CONTEÚDO SINTÉTICO; não representa praga, doença, injúria ou diagnóstico real.',
    legal_warning: legalWarning,
    legal_disclaimer: legalWarning,
    crop,
    crop_confidence: 0.6,
    low_confidence_warning: true,
    predictions: [
      {
        id: QA_DRAFT_PEST_ID,
        confidence: 0.62,
        common_name: 'QA/DRAFT — CONTEÚDO SINTÉTICO',
        category: 'qa_draft_only',
      },
      {
        id: 'qa_draft_alternative_a_x9k2',
        confidence: 0.23,
        common_name: 'QA/DRAFT — ALTERNATIVA SINTÉTICA A',
        category: 'qa_draft_only',
      },
      {
        id: 'qa_draft_alternative_b_x9k2',
        confidence: 0.15,
        common_name: 'QA/DRAFT — ALTERNATIVA SINTÉTICA B',
        category: 'qa_draft_only',
      },
    ],
    enrichment: {
      name_pt: QA_DRAFT_TITLE,
      description:
        'QA/DRAFT — fixture sintética para regressão visual; não representa praga, doença, injúria, severidade ou recomendação real.',
      severity: 'none',
    },
  };

  return {
    row: {
      id: deterministicUuid(userId),
      user_id: userId,
      crop,
      pest_id: QA_DRAFT_PEST_ID,
      pest_name: QA_DRAFT_TITLE,
      confidence: 0.62,
      image_url: null,
      notes: JSON.stringify(notes),
      location_lat: null,
      location_lng: null,
      created_at: '2026-07-15T12:00:00.000Z',
    },
    notes,
  };
}

async function persistDraftFixture(config, token, userId, crop) {
  const fixture = buildDraftFixture(userId, crop);
  const url = new URL('/rest/v1/pragas_diagnoses', config.upstreamUrl);
  url.searchParams.set('on_conflict', 'id');
  url.searchParams.set('select', 'id,crop,pest_id,pest_name,confidence,notes,created_at');

  let result;
  try {
    result = await fetchBoundedJson(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        apikey: config.anonKey,
        authorization: `Bearer ${token}`,
        'content-profile': 'public',
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(fixture.row),
    });
  } catch {
    throw new RequestValidationError(503, 'qa_fixture_persistence_unavailable');
  }

  const saved = Array.isArray(result.body) ? result.body[0] : null;
  if (
    !result.response.ok ||
    !saved ||
    saved.id !== fixture.row.id ||
    saved.crop !== fixture.row.crop ||
    saved.pest_id !== fixture.row.pest_id ||
    saved.pest_name !== fixture.row.pest_name ||
    saved.confidence !== fixture.row.confidence ||
    saved.notes !== fixture.row.notes ||
    typeof saved.created_at !== 'string' ||
    !Number.isFinite(Date.parse(saved.created_at)) ||
    Date.parse(saved.created_at) !== Date.parse(fixture.row.created_at)
  ) {
    throw new RequestValidationError(503, 'qa_fixture_persistence_failed');
  }

  return { ...saved, parsedNotes: fixture.notes };
}

async function handleDiagnosis(request, response, config) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-headers':
        'authorization, apikey, content-type, idempotency-key, x-pragas-ai-consent-version, x-pragas-ai-consent-purpose',
      'access-control-allow-methods': 'POST, OPTIONS',
      'cache-control': 'no-store',
    });
    response.end();
    return;
  }
  if (request.method !== 'POST') {
    respondJson(response, 405, { error: 'qa_method_not_allowed' }, { allow: 'POST, OPTIONS' });
    return;
  }
  const token = extractBearer(request);
  if (!token) {
    respondJson(response, 401, { error: 'qa_auth_required' });
    return;
  }

  try {
    const userId = await authenticateWithUpstream(config, token);
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !UUID_PATTERN.test(idempotencyKey)) {
      throw new RequestValidationError(400, 'qa_invalid_idempotency_key');
    }
    if (
      request.headers['x-pragas-ai-consent-version'] !== AI_CONSENT_VERSION ||
      request.headers['x-pragas-ai-consent-purpose'] !== 'diagnosis'
    ) {
      throw new RequestValidationError(428, 'qa_ai_consent_required');
    }
    const contentType = request.headers['content-type'];
    if (
      typeof contentType !== 'string' ||
      contentType.trim().toLowerCase() !== 'application/json'
    ) {
      throw new RequestValidationError(415, 'qa_json_required');
    }
    const body = await readBoundedBody(request, MAX_DIAGNOSIS_BODY_BYTES);
    const { crop } = validateDiagnosisBody(body);
    const saved = await persistDraftFixture(config, token, userId, crop);
    respondJson(response, 200, saved, {
      'x-rumo-pragas-qa-draft': 'true',
      'x-idempotency-replayed': 'false',
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      respondJson(response, error.status, { error: error.code });
      return;
    }
    respondJson(response, 500, { error: 'qa_internal_error' });
  }
}

function hopByHopHeaderNames(headers) {
  const names = new Set(HOP_BY_HOP_HEADERS);
  for (const value of [headers.connection, headers['proxy-connection']]) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (typeof entry !== 'string') continue;
      for (const token of entry.split(',')) {
        const name = token.trim().toLowerCase();
        if (HEADER_TOKEN_PATTERN.test(name)) names.add(name);
      }
    }
  }
  return names;
}

function proxyHeaders(request, upstreamUrl) {
  const headers = {};
  const hopByHopNames = hopByHopHeaderNames(request.headers);
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || name === 'host' || hopByHopNames.has(name.toLowerCase())) {
      continue;
    }
    headers[name] = value;
  }
  headers.host = upstreamUrl.host;
  return headers;
}

function responseHeaders(headers) {
  const clean = {};
  const hopByHopNames = hopByHopHeaderNames(headers);
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || hopByHopNames.has(name.toLowerCase())) continue;
    clean[name] = value;
  }
  return clean;
}

function proxyToLocalUpstream(request, response, requestTarget, config) {
  return new Promise((resolve) => {
    const client = config.upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest;
    const upstreamRequest = client(
      {
        protocol: config.upstreamUrl.protocol,
        hostname: config.upstreamUrl.hostname,
        port: config.upstreamUrl.port,
        method: request.method,
        path: requestTarget,
        headers: proxyHeaders(request, config.upstreamUrl),
      },
      (upstreamResponse) => {
        const status = upstreamResponse.statusCode ?? 502;
        if (REDIRECT_STATUSES.has(status)) {
          upstreamResponse.resume();
          respondJson(response, 502, { error: 'qa_upstream_redirect_refused' });
          upstreamResponse.once('end', resolve);
          return;
        }
        if (!response.headersSent) {
          response.writeHead(status, responseHeaders(upstreamResponse.headers));
        }
        upstreamResponse.pipe(response);
        upstreamResponse.once('end', resolve);
        upstreamResponse.once('error', () => {
          response.destroy();
          resolve();
        });
      },
    );

    upstreamRequest.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
      upstreamRequest.destroy(new Error('upstream_timeout'));
    });
    upstreamRequest.once('error', () => {
      if (!response.headersSent) {
        respondJson(response, 502, { error: 'qa_upstream_unavailable' });
      } else {
        response.destroy();
      }
      resolve();
    });
    request.once('aborted', () => upstreamRequest.destroy());
    request.pipe(upstreamRequest);
  });
}

async function routeRequest(request, response, config) {
  const requestTarget = safeRequestTarget(request.url);
  if (!requestTarget) {
    respondJson(response, 400, { error: 'qa_invalid_request_target' });
    return;
  }
  if (requestTarget.rawPath === QA_DIAGNOSIS_PATH) {
    if (requestTarget.hasQuery) {
      respondJson(response, 400, { error: 'qa_query_not_allowed' });
      return;
    }
    await handleDiagnosis(request, response, config);
    return;
  }
  if (PROXY_PATH_PATTERN.test(requestTarget.rawPath)) {
    if (!PROXY_METHODS.has(request.method ?? '')) {
      respondJson(response, 405, { error: 'qa_proxy_method_not_allowed' });
      return;
    }
    await proxyToLocalUpstream(request, response, requestTarget.rawTarget, config);
    return;
  }
  respondJson(response, 404, { error: 'qa_route_not_allowed' });
}

export function createStoreQaServer(options) {
  const upstreamUrl = validateLocalUpstream(String(options.upstreamUrl));
  if (
    typeof options.anonKey !== 'string' ||
    options.anonKey.length < 20 ||
    /\s/.test(options.anonKey)
  ) {
    throw new Error('anonKey is required');
  }
  const config = { upstreamUrl, anonKey: options.anonKey };
  const listener = (request, response) => {
    void routeRequest(request, response, config).catch(() => {
      respondJson(response, 500, { error: 'qa_internal_error' });
    });
  };
  const server = options.tls
    ? createHttpsServer({ cert: options.tls.cert, key: options.tls.key }, listener)
    : createHttpServer(listener);
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

export async function listenStoreQaServer(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, QA_BIND_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server.address();
}

async function main() {
  let config;
  try {
    config = loadStoreQaConfig();
  } catch (error) {
    console.error(
      `[store-qa] configuração recusada: ${error instanceof Error ? error.message : 'erro'}`,
    );
    process.exitCode = 1;
    return;
  }

  if (process.argv.includes('--check-profile')) {
    console.log(
      `[store-qa] ${STORE_QA_PROFILE} PASS: development client interno, OTA/Sentry/analytics desativados e cliente preso ao loopback.`,
    );
    return;
  }

  let server;
  try {
    server = createStoreQaServer(config);
    await listenStoreQaServer(server, config.port);
  } catch {
    console.error('[store-qa] listener TLS recusado ou indisponível.');
    process.exitCode = 1;
    return;
  }
  console.log(
    `[store-qa] QA/DRAFT local em https://${QA_BIND_HOST}:${config.port}; nenhum resultado serve para submissão às lojas.`,
  );

  const close = () => server.close(() => process.exit(0));
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
