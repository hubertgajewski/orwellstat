import { validateString, type CssValidationError } from 'csstree-validator';

// Pure helpers around csstree-validator. Split out of validation.util.ts so
// they are importable from the node-native unit suite without dragging in
// the Playwright fixture path aliases.

// Flatten csstree-validator's keyed-by-filename result into a plain error list
// so callers do not need to know which key the validator used for the source.
export function getCssErrors(css: string, cssUrl: string): CssValidationError[] {
  const result = validateString(css, cssUrl);
  return Object.values(result).flat();
}

export function formatCssErrors(errors: CssValidationError[], cssUrl: string): string {
  const lines = errors.map((e) => `  Line ${e.line ?? '?'}: ${e.message}`).join('\n');
  return `CSS errors in ${cssUrl}:\n${lines}`;
}
