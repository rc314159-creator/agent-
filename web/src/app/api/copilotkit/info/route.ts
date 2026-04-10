/**
 * CopilotKit runtime info endpoint (REST transport).
 *
 * CopilotKit's auto-detect logic hits GET /api/copilotkit/info first.
 * It expects a JSON object with at minimum { agents: {}, version: string }.
 * Returning an empty agents map tells the SDK there are no remote agents,
 * which is correct for our stub setup.
 */

export async function GET() {
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
