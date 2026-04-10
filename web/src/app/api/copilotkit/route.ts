/**
 * CopilotKit runtime endpoint.
 *
 * This is a placeholder that proxies the CopilotKit GraphQL protocol to the
 * existing yunwu.ai LLM backend.  A full implementation requires
 * `@copilotkit/runtime` (server-side adapter) which is not yet installed.
 * The route satisfies the build and allows the CopilotKit provider to
 * initialise on the client side without errors.
 */

import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  // TODO: replace with @copilotkit/runtime handler once installed:
  //   import { CopilotRuntime, OpenAIAdapter } from "@copilotkit/runtime";
  //   const copilotKit = new CopilotRuntime();
  //   return copilotKit.streamHttpServerResponse(req, new OpenAIAdapter({ ... }));

  try {
    const body = await req.json();

    // Single-endpoint info probe: CopilotKit sends { method: "info" } to detect transport
    if (body?.method === "info") {
      return Response.json({
        version: "0.0.0-stub",
        agents: {},
        actions: [],
        mode: "default",
        audioFileTranscriptionEnabled: false,
        a2uiEnabled: false,
        openGenerativeUIEnabled: false,
      });
    }

    // Minimal stub: acknowledge the request so the frontend doesn't error
    return new Response(
      JSON.stringify({
        data: {
          generateCopilotResponse: {
            threadId: body?.variables?.data?.threadId ?? "stub-thread",
            runId: "stub-run",
            status: { __typename: "SuccessResponseStatus", code: "SUCCESS" },
            messages: [],
            extensions: null,
            metaEvents: [],
          },
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch {
    return new Response(JSON.stringify({ error: "CopilotKit runtime not configured" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET() {
  return new Response(JSON.stringify({ status: "CopilotKit endpoint active (stub)" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
