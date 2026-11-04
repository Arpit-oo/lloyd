"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { SCENES, type Scene } from "./wallpapers";

/**
 * Appearance = a base mode (light / dark / follow the system) plus an optional animated
 * wallpaper. A wallpaper brings its own scheme and translucent chrome; with none, the plain
 * warm theme follows the mode. Both are stored in localStorage and applied on <html>.
 */
export type ThemeChoice = "light" | "dark" | "system";
/** Magi: the white, magenta-accented product look (default). Classic: the warm paper look. */
export type StyleChoice = "magi" | "classic";

export interface Appearance {
  mode: ThemeChoice;
  wallpaper: string | null;
  style: StyleChoice;
}

const TOKEN_KEYS = new Set(SCENES.flatMap((s) => Object.keys(s.tokens)));

export function sceneById(id: string | null): Scene | null {
  return SCENES.find((s) => s.id === id) ?? null;
}

function apply({ mode, wallpaper, style }: Appearance) {
  const root = document.documentElement;
  root.classList.toggle("magi", style !== "classic");
  const scene = sceneById(wallpaper);
  TOKEN_KEYS.forEach((k) => root.style.removeProperty(k));
  root.classList.toggle("wall", !!scene);
  if (scene) {
    Object.entries(scene.tokens).forEach(([k, v]) => root.style.setProperty(k, v));
    root.classList.toggle("dark", scene.scheme === "dark");
    return;
  }
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

function read(): Appearance {
  if (typeof window === "undefined") return { mode: "system", wallpaper: null, style: "magi" };
  return {
    mode: (localStorage.getItem("theme") as ThemeChoice | null) ?? "system",
    wallpaper: localStorage.getItem("wallpaper"),
    style: localStorage.getItem("style") === "classic" ? "classic" : "magi",
  };
}

export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(read);

  // Re-apply on mount (sets the wallpaper's tokens) and follow the OS when in system mode.
  useEffect(() => {
    apply(appearance);
    if (appearance.mode !== "system" || appearance.wallpaper) return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(appearance);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [appearance]);

  /** Changes appearance with a circular reveal from `origin` (the click point) where supported. */
  const change = useCallback((next: Appearance, origin?: { x: number; y: number }) => {
    localStorage.setItem("theme", next.mode);
    localStorage.setItem("style", next.style);
    if (next.wallpaper) localStorage.setItem("wallpaper", next.wallpaper);
    else localStorage.removeItem("wallpaper");
    const commit = () => {
      flushSync(() => setAppearance(next));
      apply(next);
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || still) return commit();
    const root = document.documentElement;
    root.style.setProperty("--rx", `${origin?.x ?? window.innerWidth / 2}px`);
    root.style.setProperty("--ry", `${origin?.y ?? window.innerHeight / 2}px`);
    doc.startViewTransition(commit);
  }, []);

  return { appearance, change, scene: sceneById(appearance.wallpaper) };
}
