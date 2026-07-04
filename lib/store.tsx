"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { DEFAULT_MODEL, type Settings } from "./types";

// In-memory settings only — never persisted to localStorage (per design).
// Sent in each API request body; server also falls back to env vars.

type Ctx = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  hasAI: boolean;
  hasSearch: boolean;
  hasDiscord: boolean;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>({ model: DEFAULT_MODEL });
  const update = (patch: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  const value: Ctx = {
    settings,
    update,
    hasAI: !!settings.openrouterKey,
    hasSearch: !!settings.serperKey,
    hasDiscord: !!(settings.discordBotToken && settings.discordChannelId),
  };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
