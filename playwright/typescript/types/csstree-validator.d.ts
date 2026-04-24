declare module 'csstree-validator' {
  export interface CssValidationError {
    name: string;
    message: string;
    line?: number;
    column?: number;
    property?: string;
  }

  export function validateString(
    css: string,
    filename?: string
  ): Record<string, CssValidationError[]>;
}
