export interface MCPContent { type: 'text'; text: string; }
export interface MCPResponse { content: MCPContent[]; isError?: boolean; }
export function ok(data: unknown): MCPResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
export function err(msg: string): MCPResponse {
  return { content: [{ type: 'text', text: msg }], isError: true };
}
export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: unknown) => Promise<MCPResponse>;
}
export function logEvent(event: string, meta: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ mcp: 'rumo-pragas', event, ts: new Date().toISOString(), ...meta }));
}
