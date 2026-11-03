"use client";

import { useCallback, useState } from "react";
import { DEFAULT_SETTINGS, type ModelSettings } from "@/lib/llm/catalog";

/** Personal settings, kept in this browser (no account, no server). */
export interface Settings {
  /** Used in the greeting on the start screen. */
  name: string;
  /** Show Lloyd the bee (start screen, thinking indicator, wallpaper perch). */
  showMascot: boolean;
  /** Enter sends (Shift+Enter for a new line); otherwise Ctrl/Cmd+Enter sends. */
  enterToSend: boolean;
  /** Models for new campaigns; each campaign can still change its own. */
  defaultModels: ModelSettings;
}

const DEFAULTS: Settings = { name: "", showMascot: true, enterToSend: true, defaultModels: DEFAULT_SETTINGS };
const KEY = "lloyd-settings";

function read(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(read);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return [settings, update];
}
