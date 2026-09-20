export type KeyboardShortcut = {
  key: string;
  modifiers: ("Control" | "Shift" | "Alt")[];
  action: string;
  description: string;
};

export const SHORTCUTS: KeyboardShortcut[] = [
  { key: "K", modifiers: ["Control"], action: "openCommandPalette", description: "Open command palette" },
  { key: "B", modifiers: ["Control"], action: "runBacktest", description: "Run backtest" },
  { key: "R", modifiers: ["Control"], action: "openReplay", description: "Open replay" },
  { key: "S", modifiers: ["Control"], action: "save", description: "Save (current strategy/parameters)" },
  { key: "E", modifiers: ["Control", "Shift"], action: "openExperiments", description: "Open Experiments tab" },
  { key: "Space", modifiers: [], action: "replayPlayPause", description: "Replay pause/play" },
  { key: "ArrowLeft", modifiers: [], action: "eventStepBackward", description: "Event step backward" },
  { key: "ArrowRight", modifiers: [], action: "eventStepForward", description: "Event step forward" },
  { key: "F", modifiers: [], action: "fitChart", description: "Fit chart to data" },
  { key: "Escape", modifiers: [], action: "closePanel", description: "Close panel / clear crosshair lock" },
];