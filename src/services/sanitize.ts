/**
 * Utility functions for sanitizing user input to prevent XSS attacks
 */

/**
 * Sanitize a string to prevent XSS by escaping HTML special characters
 * @param input The string to sanitize
 * @returns The sanitized string safe for inclusion in error messages
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return String(input);
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize an error message that includes user input
 * @param template The error message template
 * @param userInput The user input to include
 * @returns The sanitized error message
 */
export function sanitizeErrorMessage(
  template: string,
  userInput: string,
): string {
  return template.replace('{}', sanitizeString(userInput));
}
