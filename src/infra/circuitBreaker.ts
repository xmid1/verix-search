export interface CircuitState {
  failures: number;
  lastFailure: number;
  cooldownUntil: number;
  state: "closed" | "open" | "half-open";
}

const stores = new Map<string, CircuitState>();
const MAX_FAILURES = 3;
const BASE_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 300_000;

function getState(providerId: string): CircuitState {
  let s = stores.get(providerId);
  if (!s) {
    s = { failures: 0, lastFailure: 0, cooldownUntil: 0, state: "closed" };
    stores.set(providerId, s);
  }
  return s;
}

export function isCircuitOpen(providerId: string): boolean {
  const s = getState(providerId);
  if (s.state === "closed") return false;
  if (s.state === "half-open") return false;
  if (Date.now() > s.cooldownUntil) {
    s.state = "half-open";
    return false;
  }
  return true;
}

export function recordSuccess(providerId: string): void {
  const s = getState(providerId);
  s.failures = 0;
  s.state = "closed";
}

export function recordFailure(providerId: string): void {
  const s = getState(providerId);
  s.failures++;
  s.lastFailure = Date.now();
  if (s.failures >= MAX_FAILURES) {
    const cooldown = Math.min(BASE_COOLDOWN_MS * Math.pow(2, s.failures - MAX_FAILURES), MAX_COOLDOWN_MS);
    s.cooldownUntil = Date.now() + cooldown;
    s.state = "open";
  }
}

export function resetAll(): void {
  stores.clear();
}
