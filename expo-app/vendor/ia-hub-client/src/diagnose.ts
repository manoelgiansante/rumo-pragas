/**
 * Diagnose — text + vision diagnostic endpoint.
 *
 * Server contract: POST /v1/diagnose
 *   - When `images` is provided, the SDK uploads as multipart/form-data
 *     with a JSON `payload` field + one `image[]` field per image.
 *   - Otherwise sends JSON.
 *   - Response: DiagnoseResponse (see types.ts).
 *
 * Domain examples:
 *   - rumo-pragas: identify plant disease/pest from photo
 *   - rumo-vet:    triage equine/bovine symptoms from photo + history
 *   - rumo-confinamento: identify cattle behavior issue from text + image
 */

import { buildMultipart } from "./client";
import { RumoIAError } from "./errors";
import type { RumoIAHubClient } from "./client";
import type {
  DiagnoseInput,
  DiagnoseResponse,
  RequestOptions,
} from "./types";

export async function diagnose(
  client: RumoIAHubClient,
  input: DiagnoseInput,
  opts?: RequestOptions,
): Promise<DiagnoseResponse> {
  if (!input || (!input.prompt && (!input.images || input.images.length === 0))) {
    throw new RumoIAError({
      message: "diagnose: provide at least `prompt` or one `image`.",
    });
  }

  if (input.images && input.images.length > 0) {
    const fd = buildMultipart(
      {
        prompt: input.prompt ?? "",
        context: input.context ?? {},
        conversationId: input.conversationId,
      },
      { "image[]": input.images },
    );
    return client.request<DiagnoseResponse>({
      method: "POST",
      path: "/v1/diagnose",
      formData: fd,
      options: opts,
      endpoint: "diagnose",
    });
  }

  return client.request<DiagnoseResponse>({
    method: "POST",
    path: "/v1/diagnose",
    json: {
      prompt: input.prompt,
      context: input.context ?? {},
      conversationId: input.conversationId,
    },
    options: opts,
    endpoint: "diagnose",
  });
}
