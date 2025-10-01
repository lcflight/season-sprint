export function parseDate(input: unknown): Date | undefined {
  if (input instanceof Date) return input;
  if (typeof input === "string") {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}