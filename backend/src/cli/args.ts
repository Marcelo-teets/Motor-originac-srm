/** Minimal `--name value` / `--name=value` parser shared by the operational CLIs. */
export const parseCliArgs = (argv: string[] = process.argv.slice(2)) => {
  const valueFor = (name: string) => {
    const inline = argv.find((argument) => argument.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  /** Finite number > 0, or throws. */
  const positiveNumber = (name: string, fallback: number) => {
    const value = Number(valueFor(name) ?? fallback);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number.`);
    return value;
  };

  /** Integer clamped to [1, maximum], or throws when not numeric. */
  const integerOption = (name: string, fallback: number, maximum: number) => {
    const parsed = Number(valueFor(name) ?? fallback);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${valueFor(name)}`);
    return Math.max(1, Math.min(Math.trunc(parsed), maximum));
  };

  return { args: argv, valueFor, positiveNumber, integerOption };
};
