export { cn } from 'cn';

/** The error's own message when it has one (API errors are written for people), else `fallback`. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
