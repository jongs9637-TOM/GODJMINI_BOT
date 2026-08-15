let paused = false;

export function isAutomationPaused(): boolean {
  return paused;
}

export function setAutomationPaused(value: boolean): void {
  paused = value;
}
