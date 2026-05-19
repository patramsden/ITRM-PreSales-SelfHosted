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

export function policyFromSettings(s: Record<string, string | undefined>): PasswordPolicy {
  return {
    minLength:        Math.max(1, parseInt(s['security.pw.minLength'] ?? '8', 10) || 8),
    requireUppercase: s['security.pw.requireUppercase'] === 'true',
    requireLowercase: s['security.pw.requireLowercase'] === 'true',
    requireNumber:    s['security.pw.requireNumber']    === 'true',
    requireSpecial:   s['security.pw.requireSpecial']   === 'true',
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

/** Describes the policy as a single short sentence. */
export function policyDescription(policy: PasswordPolicy): string {
  const parts: string[] = [`at least ${policy.minLength} characters`];
  if (policy.requireUppercase) parts.push('uppercase');
  if (policy.requireLowercase) parts.push('lowercase');
  if (policy.requireNumber)    parts.push('a number');
  if (policy.requireSpecial)   parts.push('a special character');
  return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}
