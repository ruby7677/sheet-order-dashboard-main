export class PhoneIdentityError extends Error {
  readonly code = 'INVALID_PHONE_IDENTITY';
  constructor() {
    super('電話格式不正確');
  }
}

function invalid(): never {
  throw new PhoneIdentityError();
}

function taiwanMobile(nationalNumber: string): string {
  if (!/^9\d{8}$/.test(nationalNumber)) return invalid();
  return `+886${nationalNumber}`;
}

/** Normalize accepted phone spellings to a complete E.164 identity. */
export function normalizePhoneIdentity(input: string): string {
  if (typeof input !== 'string' || input.length > 64) return invalid();

  let value = input.trim();
  // Google Sheets can prefix a text value with one apostrophe.
  if (value.startsWith("'")) value = value.slice(1).trim();
  if (!value || !/^[+0-9\s()-]+$/.test(value)) return invalid();

  const compact = value.replace(/[\s()-]/g, '');
  if (compact.startsWith('+')) {
    const digits = compact.slice(1);
    if (!/^\d+$/.test(digits)) return invalid();
    if (digits.startsWith('886')) return taiwanMobile(digits.slice(3));
    if (!/^[1-9]\d{7,14}$/.test(digits)) return invalid();
    return `+${digits}`;
  }

  if (compact.startsWith('00886')) return taiwanMobile(compact.slice(5));
  if (compact.startsWith('886')) return taiwanMobile(compact.slice(3));
  if (/^09\d{8}$/.test(compact)) return `+886${compact.slice(1)}`;

  // Other countries must include an explicit E.164 '+' country code.
  return invalid();
}

/** Keep malformed historical rows visible without allowing them to match a query. */
export function tryNormalizePhoneIdentity(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  try {
    return normalizePhoneIdentity(input);
  } catch (error) {
    if (error instanceof PhoneIdentityError) return null;
    throw error;
  }
}
