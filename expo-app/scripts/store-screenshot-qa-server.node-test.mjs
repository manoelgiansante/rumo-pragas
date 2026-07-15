import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  QA_BIND_HOST,
  QA_DIAGNOSIS_PATH,
  createStoreQaServer,
  listenStoreQaServer,
  loadStoreQaConfig,
  validateStoreQaBuildContract,
  validateLocalUpstream,
} from './store-screenshot-qa-server.mjs';

const require = createRequire(import.meta.url);
const { buildExpoConfig } = require('../app.config.js');

const ANON_KEY = 'local-anon-key-for-store-qa-tests-only';
const TOKEN = 'qa.header.payload.signature-for-local-tests';
const USER_ID = '11111111-2222-4333-8444-555555555555';
const IDEMPOTENCY_KEY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TLS_CERT_FIXTURE = fileURLToPath(new URL('../package.json', import.meta.url));
const TLS_KEY_FIXTURE = fileURLToPath(new URL('../app.json', import.meta.url));

test('draft screenshot flow captures eight real UI states without invoking AI chat', () => {
  const flow = readFileSync(new URL('../.maestro/aso-screenshots.yaml', import.meta.url), 'utf8');
  const screenshots = [...flow.matchAll(/^- takeScreenshot: (qa-draft-[a-z0-9-]+)$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(screenshots, [
    'qa-draft-01-home',
    'qa-draft-02-capture-entry',
    'qa-draft-03-crop-selection',
    'qa-draft-04-synthetic-result-not-for-store',
    'qa-draft-05-local-history',
    'qa-draft-06-library',
    'qa-draft-07-ai-assistant-initial',
    'qa-draft-08-settings',
  ]);

  const assistantStart = flow.indexOf("id: 'tab-ai-chat'");
  const assistantEnd = flow.indexOf(
    '- takeScreenshot: qa-draft-07-ai-assistant-initial',
    assistantStart,
  );
  assert.ok(assistantStart >= 0 && assistantEnd > assistantStart);
  const assistantCapture = flow.slice(assistantStart, assistantEnd);
  assert.match(assistantCapture, /visible:\n\s+id: 'aichat-suggestion-0'/);
  assert.match(assistantCapture, /id: 'aichat-input'/);
  assert.match(assistantCapture, /id: 'aichat-send'/);
  assert.doesNotMatch(assistantCapture, /- inputText:|- tapOn:\n\s+id: 'aichat-/);

  const settingsStart = flow.indexOf("id: 'tab-settings'", assistantEnd);
  const settingsEnd = flow.indexOf('- takeScreenshot: qa-draft-08-settings', settingsStart);
  assert.ok(settingsStart > assistantEnd && settingsEnd > settingsStart);
  const settingsCapture = flow.slice(settingsStart, settingsEnd);
  assert.match(settingsCapture, /visible:\n\s+id: 'settings-edit-profile'/);
  assert.match(settingsCapture, /id: 'settings-row-edit-profile'/);
  assert.match(settingsCapture, /id: 'settings-row-language'/);
  assert.doesNotMatch(settingsCapture, /settings-(?:sign-out|delete-account)/);
  assert.doesNotMatch(flow, /store-assets\/(?:ios|android)\//);
});

test('store screenshot QA harness is wired into package scripts and both CI workflows', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    packageJson.scripts['test:store-screenshot-qa-server'],
    'node --test scripts/store-screenshot-qa-server.node-test.mjs',
  );

  for (const workflow of ['ci.yml', 'pr-check.yml']) {
    const source = readFileSync(
      new URL(`../../.github/workflows/${workflow}`, import.meta.url),
      'utf8',
    );
    assert.match(source, /run: npm run test:store-screenshot-qa-server/);
  }
});

const openServers = new Set();

afterEach(async () => {
  await Promise.all(
    [...openServers].map(
      (server) =>
        new Promise((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections?.();
        }),
    ),
  );
  openServers.clear();
});

async function startHttpServer(listener) {
  const server = createServer(listener);
  openServers.add(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, QA_BIND_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return { server, url: `http://${QA_BIND_HOST}:${address.port}` };
}

async function startQaServer(upstreamUrl, anonKey = ANON_KEY) {
  const server = createStoreQaServer({ upstreamUrl, anonKey });
  openServers.add(server);
  const address = await listenStoreQaServer(server, 0);
  assert.equal(typeof address, 'object');
  return { server, url: `http://${QA_BIND_HOST}:${address.port}` };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function rawHttpRequest(url, method, options = {}) {
  return await new Promise((resolve, reject) => {
    const request = httpRequest(url, { method, headers: options.headers }, (response) => {
      void readBody(response)
        .then((body) => resolve({ status: response.statusCode, headers: response.headers, body }))
        .catch(reject);
    });
    request.once('error', reject);
    request.end(options.body);
  });
}

async function rawHttpRequestTarget(origin, target, method, options = {}) {
  const url = new URL(origin);
  return await new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: target,
        method,
        headers: options.headers,
      },
      (response) => {
        void readBody(response)
          .then((body) => resolve({ status: response.statusCode, headers: response.headers, body }))
          .catch(reject);
      },
    );
    request.once('error', reject);
    request.end(options.body);
  });
}

function json(response, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-length': Buffer.byteLength(payload),
    'content-type': 'application/json',
    ...headers,
  });
  response.end(payload);
}

function diagnosisHeaders(overrides = {}) {
  return {
    authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json',
    'idempotency-key': IDEMPOTENCY_KEY,
    'x-pragas-ai-consent-version': '2026-07-14.1',
    'x-pragas-ai-consent-purpose': 'diagnosis',
    ...overrides,
  };
}

function diagnosisBody(overrides = {}) {
  return {
    image_base64: PNG_BASE64,
    crop_type: 'Soybean',
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

function validStoreQaEnv(overrides = {}) {
  return {
    STORE_QA_MODE: 'draft-screenshots',
    EAS_BUILD_PROFILE: 'storeQa',
    NODE_ENV: 'development',
    EXPO_PUBLIC_ENABLE_ANALYTICS: 'false',
    EXPO_PUBLIC_SENTRY_DSN: '',
    SENTRY_DISABLE_AUTO_UPLOAD: 'true',
    STORE_QA_UPSTREAM_URL: 'http://127.0.0.1:54321',
    STORE_QA_ANON_KEY: ANON_KEY,
    STORE_QA_LISTEN_PORT: '54329',
    STORE_QA_TLS_CERT_PATH: TLS_CERT_FIXTURE,
    STORE_QA_TLS_KEY_PATH: TLS_KEY_FIXTURE,
    EXPO_PUBLIC_SUPABASE_URL: 'https://127.0.0.1:54329',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    ...overrides,
  };
}

async function startDiagnosisUpstream(options = {}) {
  const calls = [];
  const persistedRows = [];
  const upstream = await startHttpServer(async (request, response) => {
    if (request.url === '/auth/v1/user') {
      calls.push({ route: 'auth', headers: request.headers });
      if (
        request.headers.authorization !== `Bearer ${TOKEN}` ||
        request.headers.apikey !== (options.anonKey ?? ANON_KEY) ||
        options.rejectAuth
      ) {
        json(response, 401, { error: 'invalid_token' });
        return;
      }
      json(response, 200, { id: USER_ID });
      return;
    }

    if (request.url?.startsWith('/rest/v1/pragas_diagnoses?')) {
      const body = JSON.parse((await readBody(request)).toString('utf8'));
      calls.push({ route: 'persist', headers: request.headers, body, url: request.url });
      persistedRows.push(body);
      if (options.persistenceFailure) {
        json(response, 500, options.persistenceFailure);
        return;
      }
      const { id, crop, pest_id, pest_name, confidence, notes, created_at } = body;
      json(response, 201, [
        {
          id,
          crop,
          pest_id,
          pest_name,
          confidence,
          notes,
          created_at: options.persistedCreatedAt ?? created_at,
        },
      ]);
      return;
    }

    calls.push({ route: 'unexpected', url: request.url });
    json(response, 418, { error: 'unexpected' });
  });
  return { ...upstream, calls, persistedRows };
}

test('configuration fails closed and only permits explicit local upstream origins', () => {
  assert.throws(() => loadStoreQaConfig({}), /STORE_QA_MODE is required/);
  assert.throws(
    () =>
      loadStoreQaConfig({
        STORE_QA_MODE: 'enabled',
      }),
    /STORE_QA_MODE must equal draft-screenshots/,
  );
  assert.throws(() => validateLocalUpstream('https://project.supabase.co:443'), /127\.0\.0\.1/);
  assert.throws(() => validateLocalUpstream('http://192.168.1.5:54321'), /127\.0\.0\.1/);
  assert.throws(() => validateLocalUpstream('http://localhost:54321'), /127\.0\.0\.1/);
  assert.throws(() => validateLocalUpstream('http://127.0.0.2:54321'), /127\.0\.0\.1/);
  assert.throws(() => validateLocalUpstream('http://user:password@127.0.0.1:54321'), /credentials/);
  assert.throws(() => validateLocalUpstream('http://127.0.0.1:54321/rest/v1'), /local origin/);
  assert.throws(() => validateLocalUpstream('http://127.0.0.1'), /explicit port/);
  assert.equal(validateLocalUpstream('http://127.0.0.1:54321').origin, 'http://127.0.0.1:54321');

  const contract = validateStoreQaBuildContract(validStoreQaEnv());
  assert.equal(contract.profile.developmentClient, true);
  assert.equal(contract.profile.distribution, 'internal');
  assert.equal(Object.hasOwn(contract.profile.env, 'EXPO_PUBLIC_SENTRY_DSN'), false);
  assert.equal(contract.resolved.updates.enabled, false);
  assert.equal(contract.resolved.updates.checkAutomatically, 'NEVER');
  assert.equal(contract.resolved.extra.storeQa.draftOnly, true);

  const loaded = loadStoreQaConfig(validStoreQaEnv());
  assert.equal(loaded.clientUrl.origin, 'https://127.0.0.1:54329');
  assert.equal(loaded.upstreamUrl.origin, 'http://127.0.0.1:54321');

  assert.throws(
    () =>
      loadStoreQaConfig(
        validStoreQaEnv({
          STORE_QA_TLS_CERT_PATH: undefined,
        }),
      ),
    /STORE_QA_TLS_CERT_PATH is required/,
  );
  assert.throws(
    () => loadStoreQaConfig(validStoreQaEnv({ STORE_QA_BIND_HOST: '0.0.0.0' })),
    /not configurable/,
  );

  const rejectedEnvironments = [
    [{ EAS_BUILD_PROFILE: 'preview' }, /must equal storeQa/],
    [{ EAS_BUILD_PROFILE: 'production' }, /must equal storeQa/],
    [{ NODE_ENV: 'production' }, /NODE_ENV must equal development/],
    [{ EXPO_PUBLIC_ENABLE_ANALYTICS: 'true' }, /must equal false/],
    [{ EXPO_PUBLIC_SENTRY_DSN: 'https:\/\/example.invalid\/1' }, /must be empty/],
    [{ SENTRY_AUTH_TOKEN: 'not-a-real-token' }, /must be empty/],
    [{ SENTRY_DISABLE_AUTO_UPLOAD: 'false' }, /must equal true/],
    [{ EXPO_PUBLIC_SUPABASE_URL: 'https://project.invalid:54329' }, /loopback HTTPS/],
    [{ EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329' }, /loopback HTTPS/],
    [{ EXPO_PUBLIC_SUPABASE_URL: 'https://127.0.0.1:54328' }, /loopback HTTPS/],
    [{ EXPO_PUBLIC_SUPABASE_ANON_KEY: `${ANON_KEY}-mismatch` }, /matching local/],
  ];
  for (const [override, expected] of rejectedEnvironments) {
    assert.throws(() => loadStoreQaConfig(validStoreQaEnv(override)), expected);
  }

  const secretInPath = 'do-not-print-this-path-token';
  assert.throws(
    () =>
      loadStoreQaConfig({
        ...validStoreQaEnv(),
        STORE_QA_TLS_CERT_PATH: `/missing/${secretInPath}/cert.pem`,
      }),
    (error) => {
      assert.match(error.message, /STORE_QA_TLS_CERT_PATH could not be read/);
      assert.doesNotMatch(error.message, new RegExp(secretInPath));
      return true;
    },
  );
});

test('storeQa config is isolated while production config remains unchanged', () => {
  const appJson = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
  const storeQa = buildExpoConfig(appJson, validStoreQaEnv());
  assert.equal(storeQa.updates.enabled, false);
  assert.equal(storeQa.updates.checkAutomatically, 'NEVER');
  assert.equal(storeQa.extra.storeQa.profile, 'storeQa');

  const production = buildExpoConfig(appJson, {
    EAS_BUILD_PROFILE: 'production',
    NODE_ENV: 'production',
  });
  assert.deepEqual(production.updates, appJson.updates);
  assert.equal(Object.hasOwn(production.extra, 'storeQa'), false);

  assert.throws(
    () =>
      buildExpoConfig(
        appJson,
        validStoreQaEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://production.example' }),
      ),
    /loopback HTTPS/,
  );
  assert.throws(
    () => buildExpoConfig(appJson, validStoreQaEnv({ SENTRY_AUTH_TOKEN: 'must-not-build' })),
    /Sentry DSN and auth token to be empty/,
  );
  assert.throws(
    () => buildExpoConfig(appJson, validStoreQaEnv({ STORE_QA_MODE: '' })),
    /STORE_QA_MODE=draft-screenshots/,
  );
});

test('CLI preflight exits fail-closed before a non-storeQa build can start', () => {
  const script = fileURLToPath(new URL('./store-screenshot-qa-server.mjs', import.meta.url));
  const accepted = spawnSync(process.execPath, [script, '--check-profile'], {
    encoding: 'utf8',
    env: validStoreQaEnv(),
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /storeQa PASS/);

  const rejected = spawnSync(process.execPath, [script, '--check-profile'], {
    encoding: 'utf8',
    env: validStoreQaEnv({ EAS_BUILD_PROFILE: 'production', NODE_ENV: 'production' }),
  });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /EAS_BUILD_PROFILE must equal storeQa/);
  assert.doesNotMatch(rejected.stderr, new RegExp(ANON_KEY));
});

test('listener binds only to 127.0.0.1', async () => {
  const upstream = await startHttpServer((_request, response) => json(response, 200, {}));
  const qa = await startQaServer(upstream.url);
  const address = qa.server.address();
  assert.equal(typeof address, 'object');
  assert.equal(address.address, QA_BIND_HOST);
  assert.equal(address.family, 'IPv4');
});

test('auth, REST and storage are transparently proxied with status, headers, query, and body', async () => {
  const observed = [];
  const upstream = await startHttpServer(async (request, response) => {
    const body = await readBody(request);
    observed.push({ method: request.method, url: request.url, headers: request.headers, body });
    response.writeHead(207, {
      'content-type': 'application/octet-stream',
      connection: 'x-upstream-hop',
      'set-cookie': ['one=1; HttpOnly', 'two=2; Secure'],
      'x-upstream-hop': 'must-not-leak',
      'x-upstream-proof': 'preserved',
    });
    response.end(body.length > 0 ? body : Buffer.from('upstream-body'));
  });
  const qa = await startQaServer(upstream.url);

  const authResponse = await fetch(`${qa.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { authorization: 'Bearer proxy-auth-token', 'content-type': 'text/plain' },
    body: 'auth-body',
  });
  assert.equal(authResponse.status, 207);
  assert.equal(authResponse.headers.get('x-upstream-proof'), 'preserved');
  assert.equal(await authResponse.text(), 'auth-body');

  const restResponse = await fetch(`${qa.url}/rest/v1/rpc/grant_pragas_ai_consent`, {
    method: 'POST',
    headers: { apikey: 'proxy-api-key', 'content-type': 'application/json' },
    body: JSON.stringify({ p_purpose: 'diagnosis' }),
  });
  assert.equal(restResponse.status, 207);
  assert.deepEqual(JSON.parse(await restResponse.text()), { p_purpose: 'diagnosis' });

  const storageBytes = Buffer.from([0, 1, 2, 250, 255]);
  const storageResponse = await fetch(`${qa.url}/storage/v1/object/qa/file.bin`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: storageBytes,
  });
  assert.equal(storageResponse.status, 207);
  assert.deepEqual(Buffer.from(await storageResponse.arrayBuffer()), storageBytes);

  assert.deepEqual(
    observed.map(({ method, url }) => ({ method, url })),
    [
      { method: 'POST', url: '/auth/v1/token?grant_type=password' },
      { method: 'POST', url: '/rest/v1/rpc/grant_pragas_ai_consent' },
      { method: 'PUT', url: '/storage/v1/object/qa/file.bin' },
    ],
  );
  assert.equal(observed[0].headers.authorization, 'Bearer proxy-auth-token');
  assert.equal(observed[1].headers.apikey, 'proxy-api-key');

  const hopResponse = await rawHttpRequest(`${qa.url}/auth/v1/user?hop=1`, 'GET', {
    headers: {
      authorization: 'Bearer proxy-auth-token',
      connection: 'x-client-hop',
      'x-client-hop': 'must-not-reach-upstream',
    },
  });
  assert.equal(hopResponse.status, 207);
  assert.equal(hopResponse.headers['x-upstream-hop'], undefined);
  assert.equal(observed[3].headers['x-client-hop'], undefined);
});

test('only the exact diagnosis function route is intercepted; all other functions fail closed', async () => {
  const upstream = await startHttpServer((_request, response) => json(response, 200, {}));
  const qa = await startQaServer(upstream.url);

  for (const path of [
    '/functions/v1/diagnose-pragas-extra',
    '/functions/v1/diagnose-pragas/',
    '/functions/v1/ai-chat-pragas',
  ]) {
    const response = await fetch(`${qa.url}${path}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'qa_route_not_allowed' });
  }

  const wrongMethod = await fetch(`${qa.url}${QA_DIAGNOSIS_PATH}`);
  assert.equal(wrongMethod.status, 405);
  assert.deepEqual(await wrongMethod.json(), { error: 'qa_method_not_allowed' });
});

test('raw request targets reject normalization tricks, encoded dot-segments, and non-exact preflight', async () => {
  const upstreamTargets = [];
  const upstream = await startHttpServer((request, response) => {
    upstreamTargets.push(request.url);
    json(response, 200, {});
  });
  const qa = await startQaServer(upstream.url);

  const rejected = [
    ['/functions/v1/x/../diagnose-pragas', 'GET'],
    ['/functions/v1/x/%2e%2e/diagnose-pragas', 'GET'],
    ['/functions/v1/x/%252e%252e/diagnose-pragas', 'GET'],
    ['/rest/v1/x/%25252e%25252e/functions/v1/ai-chat-pragas', 'GET'],
    ['/rest/v1/x/%2525252e%2525252e/functions/v1/ai-chat-pragas', 'GET'],
    [
      '/rest/v1/x/%25252525252525252525252e%25252525252525252525252e/functions/v1/ai-chat-pragas',
      'GET',
    ],
    ['/rest/v1/x/%2e%2e/table', 'GET'],
    [`${QA_DIAGNOSIS_PATH}?unexpected=1`, 'POST'],
    [`${QA_DIAGNOSIS_PATH}?unexpected=1`, 'OPTIONS'],
  ];

  for (const [target, method] of rejected) {
    const response = await rawHttpRequestTarget(qa.url, target, method, {
      headers: method === 'POST' ? diagnosisHeaders() : undefined,
      body: method === 'POST' ? JSON.stringify(diagnosisBody()) : undefined,
    });
    assert.equal(response.status, 400, `${method} ${target}`);
  }
  assert.equal(upstreamTargets.length, 0);

  const exactPreflight = await rawHttpRequestTarget(qa.url, QA_DIAGNOSIS_PATH, 'OPTIONS');
  assert.equal(exactPreflight.status, 204);

  const legitimateTargets = [
    '/storage/v1/object/qa/folder%20with%20spaces/folha%20de%20soja.png',
    '/storage/v1/object/qa/percent%25sign.png',
    '/rest/v1/pragas_diagnoses?select=id%2Ccrop&crop=eq.soja',
  ];
  for (const target of legitimateTargets) {
    const response = await rawHttpRequestTarget(qa.url, target, 'GET');
    assert.equal(response.status, 200, target);
  }
  assert.deepEqual(upstreamTargets, legitimateTargets);
});

test('local proxy refuses upstream redirects so the client cannot forward credentials elsewhere', async () => {
  const upstream = await startHttpServer((_request, response) => {
    response.writeHead(302, { location: 'https://outside.example/collect' });
    response.end();
  });
  const qa = await startQaServer(upstream.url);

  const response = await fetch(`${qa.url}/auth/v1/user`, {
    headers: { authorization: `Bearer ${TOKEN}` },
    redirect: 'manual',
  });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('location'), null);
  assert.deepEqual(await response.json(), { error: 'qa_upstream_redirect_refused' });
});

test('local proxy refuses TRACE and other methods outside the Supabase API contract', async () => {
  let upstreamCalls = 0;
  const upstream = await startHttpServer((_request, response) => {
    upstreamCalls += 1;
    json(response, 200, {});
  });
  const qa = await startQaServer(upstream.url);

  const response = await rawHttpRequest(`${qa.url}/auth/v1/user`, 'TRACE');
  assert.equal(response.status, 405);
  assert.deepEqual(JSON.parse(response.body.toString('utf8')), {
    error: 'qa_proxy_method_not_allowed',
  });
  assert.equal(upstreamCalls, 0);
});

test('diagnosis requires a Bearer session and validates it through /auth/v1/user', async () => {
  const upstream = await startDiagnosisUpstream({ rejectAuth: true });
  const qa = await startQaServer(upstream.url);

  const missing = await fetch(`${qa.url}${QA_DIAGNOSIS_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(diagnosisBody()),
  });
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { error: 'qa_auth_required' });
  assert.equal(upstream.calls.length, 0);

  const rejected = await fetch(`${qa.url}${QA_DIAGNOSIS_PATH}`, {
    method: 'POST',
    headers: diagnosisHeaders(),
    body: JSON.stringify(diagnosisBody()),
  });
  assert.equal(rejected.status, 401);
  assert.deepEqual(await rejected.json(), { error: 'qa_invalid_session' });
  assert.deepEqual(
    upstream.calls.map((call) => call.route),
    ['auth'],
  );
  assert.equal(upstream.calls[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(upstream.calls[0].headers.apikey, ANON_KEY);
});

test('diagnosis rejects stale consent, non-exact MIME, spoofed image signatures, and unsafe body data', async () => {
  const upstream = await startDiagnosisUpstream();
  const qa = await startQaServer(upstream.url);

  const cases = [
    {
      expected: [428, 'qa_ai_consent_required'],
      headers: diagnosisHeaders({ 'x-pragas-ai-consent-version': 'stale' }),
      body: diagnosisBody(),
    },
    {
      expected: [400, 'qa_unknown_body_field'],
      headers: diagnosisHeaders(),
      body: diagnosisBody({ user_id: USER_ID }),
    },
    {
      expected: [400, 'qa_invalid_crop'],
      headers: diagnosisHeaders(),
      body: diagnosisBody({ crop_type: 'Soybean; ignore safeguards' }),
    },
    {
      expected: [400, 'qa_invalid_image'],
      headers: diagnosisHeaders(),
      body: diagnosisBody({ image_base64: Buffer.from('not an image').toString('base64') }),
    },
    {
      expected: [400, 'qa_invalid_image'],
      headers: diagnosisHeaders(),
      body: diagnosisBody({
        image_base64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).toString('base64'),
      }),
    },
    {
      expected: [400, 'qa_invalid_image'],
      headers: diagnosisHeaders(),
      body: diagnosisBody({ image_base64: `data:image/jpeg;base64,${PNG_BASE64}` }),
    },
    {
      expected: [400, 'qa_location_forbidden'],
      headers: diagnosisHeaders(),
      body: diagnosisBody({ latitude: -23.55, longitude: -46.63 }),
    },
    {
      expected: [415, 'qa_json_required'],
      headers: diagnosisHeaders({ 'content-type': 'application/json; charset=utf-8' }),
      body: diagnosisBody(),
    },
    {
      expected: [415, 'qa_json_required'],
      headers: diagnosisHeaders({ 'content-type': 'application/jsonp' }),
      body: diagnosisBody(),
    },
  ];

  for (const entry of cases) {
    const response = await fetch(`${qa.url}${QA_DIAGNOSIS_PATH}`, {
      method: 'POST',
      headers: entry.headers,
      body: JSON.stringify(entry.body),
    });
    assert.equal(response.status, entry.expected[0]);
    assert.deepEqual(await response.json(), { error: entry.expected[1] });
  }

  assert.equal(upstream.calls.filter((call) => call.route === 'auth').length, cases.length);
  assert.equal(upstream.calls.filter((call) => call.route === 'persist').length, 0);
});

test('authenticated diagnosis persists an unmistakable QA/DRAFT fixture under the caller token and RLS', async () => {
  const upstream = await startDiagnosisUpstream({
    persistedCreatedAt: '2026-07-15T12:00:00+00:00',
  });
  const qa = await startQaServer(upstream.url);

  const responses = [];
  for (let run = 0; run < 2; run += 1) {
    const response = await fetch(`${qa.url}${QA_DIAGNOSIS_PATH}`, {
      method: 'POST',
      headers: diagnosisHeaders(),
      body: JSON.stringify(diagnosisBody()),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-rumo-pragas-qa-draft'), 'true');
    responses.push(await response.json());
  }

  assert.equal(responses[0].id, responses[1].id);
  assert.match(responses[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(responses[0].crop, 'soja');
  assert.equal(responses[0].confidence, 0.62);
  assert.equal(responses[0].image_url, undefined);
  assert.equal(responses[0].created_at, '2026-07-15T12:00:00+00:00');
  assert.equal(responses[0].pest_id, 'qa_draft_not_a_diagnosis_x9k2');
  assert.equal(responses[0].pest_name, 'QA-DRAFT-NÃO-É-DIAGNÓSTICO-X9K2');

  const notes = JSON.parse(responses[0].notes);
  assert.match(notes.message, /^QA\/DRAFT — CONTEÚDO SINTÉTICO/);
  assert.match(notes.legal_warning, /não confirma diagnóstico/i);
  assert.match(notes.legal_warning, /não mede gravidade/i);
  assert.match(notes.legal_warning, /profissional habilitado/i);
  assert.equal(notes.low_confidence_warning, true);
  assert.equal(notes.predictions.length, 3);
  assert.ok(notes.predictions[0].confidence < 0.7);
  assert.equal(notes.predictions[0].id, 'qa_draft_not_a_diagnosis_x9k2');
  assert.equal(notes.enrichment.name_pt, 'QA-DRAFT-NÃO-É-DIAGNÓSTICO-X9K2');
  assert.doesNotMatch(notes.enrichment.name_pt, /\s/);
  assert.equal(notes.enrichment.severity, 'none');
  assert.equal('symptoms' in notes.enrichment, false);
  assert.equal('scientific_name' in notes.enrichment, false);
  assert.deepEqual(
    notes.predictions.slice(1).map((prediction) => prediction.common_name),
    ['QA/DRAFT — ALTERNATIVA SINTÉTICA A', 'QA/DRAFT — ALTERNATIVA SINTÉTICA B'],
  );
  assert.equal('cultural_treatment' in notes.enrichment, false);
  assert.equal('biological_treatment' in notes.enrichment, false);
  assert.doesNotMatch(
    responses[0].notes,
    /\b(?:lagarta|percevejo|ácaro|ferrugem|dose|dosagem|aplique|aplicação|inseticida|fungicida|herbicida|produto comercial)\b/i,
  );

  const persistCalls = upstream.calls.filter((call) => call.route === 'persist');
  assert.equal(persistCalls.length, 2);
  for (const call of persistCalls) {
    assert.equal(call.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(call.headers.apikey, ANON_KEY);
    assert.equal(call.body.user_id, USER_ID);
    assert.equal(call.body.location_lat, null);
    assert.equal(call.body.location_lng, null);
    assert.equal(call.body.image_url, null);
    assert.equal(call.body.pest_id, 'qa_draft_not_a_diagnosis_x9k2');
    assert.equal(call.body.pest_name, 'QA-DRAFT-NÃO-É-DIAGNÓSTICO-X9K2');
    assert.match(call.headers.prefer, /resolution=merge-duplicates/);
    assert.match(call.url, /on_conflict=id/);
  }
  assert.deepEqual(
    upstream.calls.map((call) => call.route),
    ['auth', 'persist', 'auth', 'persist'],
  );
});

test('persistence rejects invalid created_at instants instead of accepting arbitrary text', async () => {
  const upstream = await startDiagnosisUpstream({ persistedCreatedAt: 'not-a-timestamp' });
  const qa = await startQaServer(upstream.url);

  const response = await fetch(`${qa.url}${QA_DIAGNOSIS_PATH}`, {
    method: 'POST',
    headers: diagnosisHeaders(),
    body: JSON.stringify(diagnosisBody()),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'qa_fixture_persistence_failed' });
});

test('upstream errors never leak the Bearer token, anon key, or upstream response body', async () => {
  const secretToken = TOKEN;
  const secretKey = ANON_KEY;
  const upstream = await startDiagnosisUpstream({
    persistenceFailure: {
      error: `sensitive upstream detail ${secretToken} ${secretKey}`,
    },
  });
  const qa = await startQaServer(upstream.url);

  const capturedLogs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => capturedLogs.push(args.join(' '));
  console.error = (...args) => capturedLogs.push(args.join(' '));
  let text;
  try {
    const response = await fetch(`${qa.url}${QA_DIAGNOSIS_PATH}`, {
      method: 'POST',
      headers: diagnosisHeaders(),
      body: JSON.stringify(diagnosisBody()),
    });
    assert.equal(response.status, 503);
    text = await response.text();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.deepEqual(JSON.parse(text), { error: 'qa_fixture_persistence_failed' });
  for (const output of [text, ...capturedLogs]) {
    assert.doesNotMatch(output, new RegExp(secretToken.replaceAll('.', '\\.')));
    assert.doesNotMatch(output, new RegExp(secretKey));
    assert.doesNotMatch(output, /sensitive upstream detail/);
  }
});
