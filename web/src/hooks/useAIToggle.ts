"use client";

import { useState, useCallback, createContext, useContext } from "react";

interface AIToggleContext {
  aiEnabled: boolean;
  toggleAI: () => void;
  setAIEnabled: (enabled: boolean) => void;
}

const AIToggleCtx = createContext<AIToggleContext>({
  aiEnabled: true,
  toggleAI: () => {},
  setAIEnabled: () => {},
});

export function useAIToggle() {
  return useContext(AIToggleCtx);
}

export function useAIToggleProvider() {
  const [aiEnabled, setAIEnabled] = useState(true);
  const toggleAI = useCallback(() => setAIEnabled((v) => !v), []);
  return { aiEnabled, toggleAI, setAIEnabled };
}

export const AIToggleProvider = AIToggleCtx.Provider;
