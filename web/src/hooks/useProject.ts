"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import React from "react";

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectData {
  meta: ProjectMeta & { canvasMode?: string };
  outline: string;
  mindmap: unknown | null;
  whiteboard: unknown | null;
  templates: { activeTemplate: string | null; data: Record<string, unknown> };
  transcripts: Array<{ id: number; speaker: string; text: string; time: string }>;
  chat: Array<{ role: string; content: string; timestamp?: string }>;
}

interface ProjectContextValue {
  projects: ProjectMeta[];
  currentProject: ProjectData | null;
  currentProjectId: string | null;
  loading: boolean;
  creating: boolean;
  loadProjects: () => Promise<void>;
  createProject: (name: string) => Promise<string | null>;
  switchProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  saveField: (field: string, data: unknown) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  currentProject: null,
  currentProjectId: null,
  loading: false,
  creating: false,
  loadProjects: async () => {},
  createProject: async () => null,
  switchProject: async () => {},
  deleteProject: async () => {},
  renameProject: async () => {},
  saveField: async () => {},
});

export function useProject() {
  return useContext(ProjectContext);
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectData | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(Array.isArray(data.data) ? data.data : (data.data?.projects ?? []));
    } catch {
      setProjects([]);
    }
  }, []);

  const switchProject = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json();
      if (data.success) {
        setCurrentProject(data.data);
        setCurrentProjectId(id);
      }
    } catch {
      // failed to load
    } finally {
      setLoading(false);
    }
  }, []);

  const createProject = useCallback(async (name: string): Promise<string | null> => {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        await loadProjects();
        await switchProject(data.data.id);
        return data.data.id;
      }
      return null;
    } catch {
      return null;
    } finally {
      setCreating(false);
    }
  }, [loadProjects, switchProject]);

  const deleteProject = useCallback(async (id: string) => {
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      await loadProjects();
      if (currentProjectId === id) {
        setCurrentProject(null);
        setCurrentProjectId(null);
      }
    } catch {
      // failed
    }
  }, [loadProjects, currentProjectId]);

  const renameProject = useCallback(async (id: string, name: string) => {
    try {
      await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta: { name } }),
      });
      await loadProjects();
      if (currentProjectIdRef.current === id) {
        setCurrentProject((prev) =>
          prev ? { ...prev, meta: { ...prev.meta, name } } : prev
        );
      }
    } catch {
      // silent fail
    }
  }, [loadProjects]);

  // Keep ref in sync for use in debounced callbacks
  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  const saveField = useCallback(async (field: string, data: unknown) => {
    if (!currentProjectId) return;
    // Debounced save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const id = currentProjectIdRef.current;
      if (!id) return;
      try {
        await fetch(`/api/projects/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: data }),
        });
      } catch {
        // silent fail for auto-save
      }
    }, 500);
  }, [currentProjectId]);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const value: ProjectContextValue = {
    projects,
    currentProject,
    currentProjectId,
    loading,
    creating,
    loadProjects,
    createProject,
    switchProject,
    deleteProject,
    renameProject,
    saveField,
  };

  return React.createElement(ProjectContext.Provider, { value }, children);
}
