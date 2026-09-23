export type DocumentStatusKind = 'unknown' | 'valid' | 'expiring' | 'expired';

export interface DocumentStatus {
  kind: DocumentStatusKind;
  daysRemaining: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a database DATE as a local calendar date, never as UTC midnight. */
export function parseExpiryDate(expiryDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiryDate);
  if (!match) throw new Error('Invalid expiry date. Use YYYY-MM-DD.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 9999) throw new Error('Invalid expiry date.');
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Invalid expiry date.');
  }
  return date;
}

function calendarDayNumber(date: Date): number {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid current date.');
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY;
}

export function getDocumentStatus(expiryDate: string | null, today = new Date()): DocumentStatus {
  if (expiryDate === null) return { kind: 'unknown', daysRemaining: null };
  const daysRemaining = calendarDayNumber(parseExpiryDate(expiryDate)) - calendarDayNumber(today);
  const kind = daysRemaining < 0 ? 'expired' : daysRemaining <= 30 ? 'expiring' : 'valid';
  return { kind, daysRemaining };
}

export function getDocumentStatusLabel(status: DocumentStatus): string {
  switch (status.kind) {
    case 'unknown': return 'No expiry date';
    case 'valid': return 'Valid';
    case 'expiring':
      if (status.daysRemaining === 0) return 'Expires today';
      return `Expires in ${status.daysRemaining} ${status.daysRemaining === 1 ? 'day' : 'days'}`;
    case 'expired': {
      const days = -status.daysRemaining!;
      return `Expired ${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
  }
}
