"use client";

import { CopilotKit } from "@copilotkit/react-core";
import type { ReactNode } from "react";

interface CopilotKitProviderProps {
  children: ReactNode;
}

export function CopilotKitProvider({ children }: CopilotKitProviderProps) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      {children}
    </CopilotKit>
  );
}
