export function getArgValue(args: string[], name: string, fallback?: string): string | undefined {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? fallback;

  return fallback;
}

export function getNumberArg(args: string[], name: string, fallback: number): number {
  const value = getArgValue(args, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}
