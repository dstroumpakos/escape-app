/**
 * Input validation utilities for Convex backend.
 * Provides server-side validation for user inputs.
 */

/** Validate email format */
export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/** Validate password strength (min 8 chars, 1 uppercase, 1 number) */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number";
  return null; // valid
}

/** Sanitize text input: trim and limit length */
export function sanitizeText(text: string, maxLength = 5000): string {
  return text.trim().slice(0, maxLength);
}

/** Validate string is not empty after trimming */
export function requireNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${fieldName} is required`);
  return trimmed;
}

/** Validate a number is within range */
export function validateRange(value: number, min: number, max: number, fieldName: string): void {
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
}
