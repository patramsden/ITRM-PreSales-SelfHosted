export interface PasswordPolicy {
  minLength:        number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber:    boolean;
  requireSpecial:   boolean;
}

export const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8, requireUppercase: false, requireLowercase: false,
  requireNumber: false, requireSpecial: false,
};

export function buildPolicy(settings: Record<string, string>): PasswordPolicy {
  return {
    minLength:        Math.max(1, parseInt(settings['security.pw.minLength'] ?? '8', 10) || 8),
    requireUppercase: settings['security.pw.requireUppercase'] === 'true',
    requireLowercase: settings['security.pw.requireLowercase'] === 'true',
    requireNumber:    settings['security.pw.requireNumber']    === 'true',
    requireSpecial:   settings['security.pw.requireSpecial']   === 'true',
  };
}

export function validatePassword(password: string, policy: PasswordPolicy): string[] {
  const errors: string[] = [];
  if (password.length < policy.minLength)
    errors.push(`At least ${policy.minLength} characters`);
  if (policy.requireUppercase && !/[A-Z]/.test(password))
    errors.push('At least one uppercase letter (A–Z)');
  if (policy.requireLowercase && !/[a-z]/.test(password))
    errors.push('At least one lowercase letter (a–z)');
  if (policy.requireNumber    && !/\d/.test(password))
    errors.push('At least one number (0–9)');
  if (policy.requireSpecial   && !/[^A-Za-z0-9]/.test(password))
    errors.push('At least one special character (!@#$%…)');
  return errors;
}
