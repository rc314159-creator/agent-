"use client";

import { useCopilotReadable, useCopilotAction } from "@copilotkit/react-core";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * Registers workspace state and actions with CopilotKit.
 * Must be rendered inside both WorkspaceProvider and CopilotKit.
 * Renders nothing — purely a side-effect component.
 */
export function CopilotKitWorkspace() {
  const workspace = useWorkspace();

  // Expose workspace context to CopilotKit
  useCopilotReadable({
    description: "Current MeetFlow workspace context: canvas content and voice transcripts",
    value: workspace.getContextSummary(),
  });

  // Register updateOutline action so CopilotKit can modify the outline
  useCopilotAction({
    name: "updateOutline",
    description: "Update or append content to the canvas outline editor",
    parameters: [
      {
        name: "html",
        type: "string",
        description: "HTML content to set as the outline (uses h2, ul, li tags)",
        required: true,
      },
      {
        name: "mode",
        type: "string",
        description: 'Either "replace" to overwrite or "append" to add to existing content',
        required: false,
      },
    ],
    handler: ({ html, mode }: { html: string; mode?: string }) => {
      if (mode === "append") {
        const current = workspace.outlineHTML;
        const separator = current ? "\n<hr/>\n" : "";
        workspace.setOutlineHTML(current + separator + html);
      } else {
        workspace.setOutlineHTML(html);
      }
    },
  });

  return null;
}
