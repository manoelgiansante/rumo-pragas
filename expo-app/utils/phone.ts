/**
 * Pure, dependency-free Brazilian phone mask.
 *
 * Formats digits as the user types into the canonical BR mobile/landline shape:
 *   - 11 digits → "(11) 9 9999-9999" (mobile, 9-prefixed)
 *   - 10 digits → "(11) 9999-9999"   (landline)
 *   - partials  → progressively masked, never throwing.
 *
 * The phone field is OPTIONAL: this never validates or blocks submit, it only
 * cosmetically formats. Non-digits are stripped; input is capped at 11 digits
 * so paste of a +55-prefixed number degrades gracefully instead of overflowing.
 */
export function formatPhoneBR(input: string): string {
  const digits = (input || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';

  const ddd = digits.slice(0, 2);
  if (digits.length <= 2) return `(${ddd}`;

  const rest = digits.slice(2);

  // Mobile (9 digits after DDD): "(11) 9 9999-9999"
  if (rest.length > 8) {
    const first = rest.slice(0, 1);
    const middle = rest.slice(1, 5);
    const last = rest.slice(5, 9);
    return `(${ddd}) ${first} ${middle}-${last}`.trimEnd();
  }

  // Landline (up to 8 digits after DDD): "(11) 9999-9999"
  if (rest.length > 4) {
    return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }

  return `(${ddd}) ${rest}`;
}
