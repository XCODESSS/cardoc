export const DOCUMENT_TYPES = [
  'registration',
  'driving_license',
  'insurance',
  'puc',
  'warranty',
  'service',
  'invoice',
  'finance',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentScope = 'vehicle' | 'driver';
export type DocumentMimeType = 'application/pdf' | 'image/jpeg' | 'image/png';

export interface CarDocument {
  id: string;
  userId: string;
  vehicleId: string | null;
  scope: DocumentScope;
  type: DocumentType;
  displayName: string;
  /** Private Storage key: <userId>/<documentId>.<ext>. */
  filePath: string;
  mimeType: DocumentMimeType;
  sizeBytes: number;
  expiryDate: string | null;
  /** Device-local derived state; this is never stored in PostgreSQL. */
  offlineAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}
