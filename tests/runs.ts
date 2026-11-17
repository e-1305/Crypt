/** Property-test intensity. CRYPT_NUM_RUNS raises (never lowers) the runs; unset keeps the local default. */
export function numRuns(local: number, env: string | undefined = process.env.CRYPT_NUM_RUNS): number {
  const n = Number(env);
  return Number.isInteger(n) && n > 0 ? Math.max(local, n) : local;
}
