import { clsx, type ClassValue } from 'clsx'

/** Tiny className combiner. Keeps conditional Tailwind classes readable. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}
