export interface Check { name: string; ok: boolean; detail?: string }
export interface Scenario { id: string; title?: string; metrics?: Record<string, unknown>; checks: Check[] }
export function syntheticCreature(n: number, repo?: string): { repo: string; limbs: Record<string, unknown>[] };
export function syntheticLockfile(n: number, padBytes?: number): string;
export function commandMix(n: number): string[];
export function claimsClean(text: string): boolean;
export function median(xs: number[]): number;
export function percentile(xs: number[], p: number): number;
export function mb(bytes: number): number;
export function summarize(scenarios: Scenario[]): { passed: boolean; scenarios: number; checks: number; failures: { scenario: string; check: string; detail: string }[] };
export function checksTable(scenarios: Scenario[]): string;
