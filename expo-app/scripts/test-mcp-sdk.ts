import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleMcpRequest, MCP_PROTOCOL_VERSION, type McpDependencies } from '../api/mcp/server';

interface ObservedRequest {
  method: string | null;
  protocolHeader: string | undefined;
  idempotencyHeader: string | undefined;
}

const observed: ObservedRequest[] = [];
const rateCalls: Array<Record<string, unknown>> = [];
const queuedRateResponses: Array<{ data: unknown; error: unknown } | { throws: Error }> = [];
const linkCalls: Array<Record<string, unknown> | undefined> = [];
const queuedLinkResponses: Array<{ data: unknown; error: unknown } | { throws: Error }> = [];
const diagnosisQuery = {
  selectedColumns: '',
  filters: [] as Array<[string, unknown]>,
  limit: 0,
};

function diagnosisQueryBuilder() {
  const builder = {
    select(columns: string) {
      diagnosisQuery.selectedColumns = columns;
      return builder;
    },
    eq(column: string, value: unknown) {
      diagnosisQuery.filters.push([column, value]);
      return builder;
    },
    order() {
      return builder;
    },
    async limit(value: number) {
      diagnosisQuery.limit = value;
      const source: Record<string, unknown> = {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        user_id: '11111111-1111-4111-8111-111111111111',
        crop: 'soja',
        pest_id: 'lagarta',
        pest_name: 'Lagarta',
        confidence: 0.7,
        created_at: '2026-07-14T12:00:00Z',
        image_url: 'https://private.invalid/raw-photo',
      };
      const projected = Object.fromEntries(
        diagnosisQuery.selectedColumns.split(',').map((column) => [column, source[column]]),
      );
      return { data: [projected], error: null };
    },
  };
  return builder;
}

const dependencies: McpDependencies = {
  authenticate: async () => ({
    ok: true,
    userId: '11111111-1111-4111-8111-111111111111',
    jwt: 'integration-jwt',
  }),
  getUserClient: (() => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === 'pragas_link_account') {
        linkCalls.push(args);
        const queuedLink = queuedLinkResponses.shift();
        if (queuedLink && 'throws' in queuedLink) throw queuedLink.throws;
        if (queuedLink) return queuedLink;
        return { data: { linked: true, app: 'rumo-pragas', code: 'linked' }, error: null };
      }
      assert.equal(name, 'consume_pragas_mcp_rate_limit');
      rateCalls.push(args!);
      const queued = queuedRateResponses.shift();
      if (queued && 'throws' in queued) throw queued.throws;
      if (queued) return queued;
      return {
        data: {
          allowed: true,
          conflict: false,
          remaining: 29,
          retry_after_seconds: 0,
        },
        error: null,
      };
    },
    from: (table: string) => {
      assert.equal(table, 'pragas_diagnoses');
      return diagnosisQueryBuilder();
    },
  })) as unknown as McpDependencies['getUserClient'],
};

function vercelResponse(outgoing: ServerResponse): VercelResponse {
  const adapter = {
    setHeader(name: string, value: string | number | readonly string[]) {
      outgoing.setHeader(name, value);
      return adapter;
    },
    removeHeader(name: string) {
      outgoing.removeHeader(name);
      return adapter;
    },
    status(code: number) {
      outgoing.statusCode = code;
      return adapter;
    },
    json(value: unknown) {
      outgoing.setHeader('Content-Type', 'application/json; charset=utf-8');
      outgoing.end(JSON.stringify(value));
      return adapter;
    },
    end(value?: unknown) {
      outgoing.end(value == null ? undefined : String(value));
      return adapter;
    },
  };
  return adapter as unknown as VercelResponse;
}

async function vercelRequest(incoming: IncomingMessage): Promise<VercelRequest> {
  let raw = '';
  for await (const chunk of incoming) {
    raw += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  }
  let method: string | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { method?: unknown };
      method = typeof parsed.method === 'string' ? parsed.method : null;
    } catch {
      // The endpoint itself verifies malformed JSON.
    }
  }
  observed.push({
    method,
    protocolHeader: incoming.headers['mcp-protocol-version'] as string | undefined,
    idempotencyHeader: incoming.headers['idempotency-key'] as string | undefined,
  });
  return {
    method: incoming.method,
    headers: incoming.headers,
    body: raw,
  } as unknown as VercelRequest;
}

async function main(): Promise<void> {
  const server = createServer(async (incoming, outgoing) => {
    try {
      await handleMcpRequest(await vercelRequest(incoming), vercelResponse(outgoing), dependencies);
    } catch {
      if (!outgoing.headersSent) outgoing.statusCode = 500;
      outgoing.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const endpoint = new URL(`http://127.0.0.1:${address.port}/api/mcp/server`);
    const postRpc = (message: Record<string, unknown>) =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          Authorization: 'Bearer integration-jwt',
          'Content-Type': 'application/json',
          ...(message.method === 'initialize'
            ? {}
            : { 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION }),
        },
        body: JSON.stringify(message),
      });
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { Authorization: 'Bearer integration-jwt' } },
    });
    const client = new Client({ name: 'rumo-pragas-contract-test', version: '1.0.0' });
    // The SDK currently publishes Transport.sessionId without the explicit
    // undefined required by this app's exactOptionalPropertyTypes setting.
    // The concrete SDK transport is exercised at runtime by this test.
    await client.connect(transport as unknown as Parameters<Client['connect']>[0]);
    assert.equal(client.getServerVersion()?.name, 'rumo-pragas');
    assert.equal(client.getServerCapabilities()?.tools?.listChanged, false);

    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
      'get_diagnosis',
      'get_pest_history',
      'list_diagnoses',
      'search_pest_library',
    ]);

    const called = await client.callTool({ name: 'list_diagnoses', arguments: { limit: 1 } });
    assert.equal(called.isError, undefined);
    if (!Array.isArray(called.content)) throw new Error('MCP tool content is not an array');
    const textContent = called.content.find(
      (content: unknown): content is { type: 'text'; text: string } =>
        typeof content === 'object' &&
        content !== null &&
        (content as Record<string, unknown>).type === 'text' &&
        typeof (content as Record<string, unknown>).text === 'string',
    );
    assert.ok(textContent);
    const toolPayload = JSON.parse(textContent.text) as Record<string, unknown>;
    const diagnoses = toolPayload.diagnoses as Array<Record<string, unknown>>;
    assert.equal(toolPayload.count, 1);
    assert.equal(diagnoses[0]?.user_id, undefined);
    assert.equal(diagnoses[0]?.image_url, undefined);
    assert.equal(diagnosisQuery.selectedColumns, 'id,crop,pest_id,pest_name,confidence,created_at');
    assert.deepEqual(diagnosisQuery.filters, [['user_id', '11111111-1111-4111-8111-111111111111']]);
    assert.equal(diagnosisQuery.limit, 1);

    assert.equal(rateCalls.length, 4);
    for (const rateCall of rateCalls) {
      assert.match(
        String(rateCall.p_idempotency_key),
        /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      assert.match(String(rateCall.p_request_hash), /^[0-9a-f]{64}$/);
      assert.deepEqual(Object.keys(rateCall).sort(), ['p_idempotency_key', 'p_request_hash']);
    }

    assert.ok(observed.some((request) => request.method === 'initialize'));
    assert.ok(observed.some((request) => request.method === 'notifications/initialized'));
    const listRequest = observed.find((request) => request.method === 'tools/list');
    assert.equal(listRequest?.protocolHeader, MCP_PROTOCOL_VERSION);
    assert.equal(listRequest?.idempotencyHeader, undefined);
    const callRequest = observed.find((request) => request.method === 'tools/call');
    assert.equal(callRequest?.protocolHeader, MCP_PROTOCOL_VERSION);
    assert.equal(callRequest?.idempotencyHeader, undefined);

    const privateMarker = 'private-value-that-must-not-be-persisted';
    const stableStart = rateCalls.length;
    const firstPing = await postRpc({
      jsonrpc: '2.0',
      id: 101,
      method: 'ping',
      params: { privateMarker, nested: { second: 2, first: 1 } },
    });
    const secondPing = await postRpc({
      jsonrpc: '2.0',
      id: 102,
      method: 'ping',
      params: { nested: { first: 1, second: 2 }, privateMarker },
    });
    assert.equal(firstPing.status, 200);
    assert.equal(secondPing.status, 200);
    const [firstStableCall, secondStableCall] = rateCalls.slice(stableStart);
    assert.ok(firstStableCall);
    assert.ok(secondStableCall);
    assert.equal(firstStableCall.p_idempotency_key, secondStableCall.p_idempotency_key);
    assert.equal(firstStableCall.p_request_hash, secondStableCall.p_request_hash);
    assert.equal(JSON.stringify(firstStableCall).includes(privateMarker), false);
    assert.equal(JSON.stringify(secondStableCall).includes(privateMarker), false);

    const deny = () => ({
      data: {
        allowed: false,
        conflict: false,
        remaining: 0,
        retry_after_seconds: 17,
      },
      error: null,
    });
    queuedRateResponses.push(deny());
    const deniedInitialize = await postRpc({
      jsonrpc: '2.0',
      id: 103,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'rate-limit-contract', version: '1.0.0' },
      },
    });
    assert.equal(deniedInitialize.status, 429);
    assert.equal(deniedInitialize.headers.get('retry-after'), '17');

    queuedRateResponses.push(deny());
    const deniedPing = await postRpc({ jsonrpc: '2.0', id: 104, method: 'ping' });
    assert.equal(deniedPing.status, 429);

    queuedRateResponses.push(deny());
    const deniedNotification = await postRpc({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: { progressToken: 'bounded-token', progress: 1 },
    });
    assert.equal(deniedNotification.status, 429);
    const deniedNotificationBody = (await deniedNotification.json()) as {
      id?: unknown;
      error?: { code?: unknown };
    };
    assert.equal(deniedNotificationBody.id, null);
    assert.equal(deniedNotificationBody.error?.code, -32000);

    queuedRateResponses.push({ data: null, error: { code: 'database_unavailable' } });
    const unavailableNotification = await postRpc({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 105, reason: privateMarker },
    });
    assert.equal(unavailableNotification.status, 503);
    assert.equal(JSON.stringify(rateCalls.at(-1)).includes(privateMarker), false);

    queuedRateResponses.push({ throws: new Error('database transport unavailable') });
    const unavailablePing = await postRpc({ jsonrpc: '2.0', id: 106, method: 'ping' });
    assert.equal(unavailablePing.status, 503);
    assert.equal(queuedRateResponses.length, 0);

    const invalidOrigin = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer integration-jwt',
        'Content-Type': 'application/json',
        Origin: 'https://attacker.invalid',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 99,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'invalid-origin', version: '1.0.0' },
        },
      }),
    });
    assert.equal(invalidOrigin.status, 403);

    const getResponse = await fetch(endpoint, {
      headers: { Accept: 'text/event-stream', Authorization: 'Bearer integration-jwt' },
    });
    assert.equal(getResponse.status, 405);

    // --- Auto-link recovery for the pragas_app_link_inactive gate ---------
    // The consume RPC RAISEs 'pragas_app_link_inactive' for an authenticated
    // user whose Rumo Pragas account is not yet linked. The server must
    // self-heal via pragas_link_account + retry, never surface a bogus 503.
    type RpcErrorBody = { id?: unknown; error?: { code?: unknown; message?: unknown } };
    const appLinkError = () => ({ data: null, error: { message: 'pragas_app_link_inactive' } });

    // (1) gate -> autolink linked:true -> retry allowed -> 200
    const autoLinkStart = linkCalls.length;
    queuedRateResponses.push(appLinkError());
    queuedLinkResponses.push({
      data: { linked: true, app: 'rumo-pragas', code: 'linked' },
      error: null,
    });
    queuedRateResponses.push({
      data: { allowed: true, conflict: false, remaining: 20, retry_after_seconds: 0 },
      error: null,
    });
    const autoLinked = await postRpc({
      jsonrpc: '2.0',
      id: 201,
      method: 'ping',
      params: { scenario: 'autolink-ok' },
    });
    assert.equal(autoLinked.status, 200);
    assert.equal(linkCalls.length, autoLinkStart + 1);
    assert.equal(linkCalls.at(-1), undefined); // pragas_link_account called with no args

    // (2) gate -> autolink linked:false -> 403 / -32003 (clear PT-BR, no raw SQL)
    queuedRateResponses.push(appLinkError());
    queuedLinkResponses.push({
      data: { linked: false, app: 'rumo-pragas', code: 'subscription_inactive' },
      error: null,
    });
    const denied = await postRpc({
      jsonrpc: '2.0',
      id: 202,
      method: 'ping',
      params: { scenario: 'autolink-denied' },
    });
    assert.equal(denied.status, 403);
    const deniedBody = (await denied.json()) as RpcErrorBody;
    assert.equal(deniedBody.error?.code, -32003);
    assert.match(String(deniedBody.error?.message), /não vinculada/);
    assert.equal(String(deniedBody.error?.message).includes('pragas_app_link_inactive'), false);

    // (3) gate -> autolink raises pragas_profile_link_failed -> 404 / -32004
    queuedRateResponses.push(appLinkError());
    queuedLinkResponses.push({ data: null, error: { message: 'pragas_profile_link_failed' } });
    const noProfile = await postRpc({
      jsonrpc: '2.0',
      id: 203,
      method: 'ping',
      params: { scenario: 'no-profile' },
    });
    assert.equal(noProfile.status, 404);
    const noProfileBody = (await noProfile.json()) as RpcErrorBody;
    assert.equal(noProfileBody.error?.code, -32004);
    assert.match(String(noProfileBody.error?.message), /Crie uma conta/);

    // (4) RPC raises 'unauthenticated' -> 401 (not 503), autolink NOT attempted
    const unauthLinkStart = linkCalls.length;
    queuedRateResponses.push({ data: null, error: { message: 'unauthenticated' } });
    const unauth = await postRpc({
      jsonrpc: '2.0',
      id: 204,
      method: 'ping',
      params: { scenario: 'unauth' },
    });
    assert.equal(unauth.status, 401);
    const unauthBody = (await unauth.json()) as RpcErrorBody;
    assert.equal(unauthBody.error?.code, -32000);
    assert.equal(linkCalls.length, unauthLinkStart);

    // (5) genuine infra error surfaced as a PostgREST error -> 503 as today
    queuedRateResponses.push({ data: null, error: { message: 'deadlock detected' } });
    const infra = await postRpc({
      jsonrpc: '2.0',
      id: 205,
      method: 'ping',
      params: { scenario: 'infra' },
    });
    assert.equal(infra.status, 503);

    // (6) gate -> autolink linked:true -> retry STILL gated -> 403 (single retry)
    queuedRateResponses.push(appLinkError());
    queuedLinkResponses.push({ data: { linked: true }, error: null });
    queuedRateResponses.push(appLinkError());
    const stillGated = await postRpc({
      jsonrpc: '2.0',
      id: 206,
      method: 'ping',
      params: { scenario: 'still-gated' },
    });
    assert.equal(stillGated.status, 403);
    const stillGatedBody = (await stillGated.json()) as RpcErrorBody;
    assert.equal(stillGatedBody.error?.code, -32003);

    assert.equal(queuedRateResponses.length, 0);
    assert.equal(queuedLinkResponses.length, 0);

    await client.close();
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main()
  .then(() => {
    process.stdout.write('MCP SDK 2025-11-25 interoperability: PASS\n');
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
