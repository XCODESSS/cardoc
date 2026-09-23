import { z } from 'zod';

import type { DocumentMimeType } from '../types/document';
import { DOCUMENT_TYPES } from '../types/document';

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.').refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 9999 && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}, 'Enter a real calendar date.');

export const documentInputSchema = z.object({
  scope: z.enum(['vehicle', 'driver']),
  type: z.enum(DOCUMENT_TYPES),
  displayName: z.string().trim().min(1, 'Enter a document name.'),
  vehicleId: z.uuid().nullable(),
  expiryDate: dateOnly.nullable(),
}).superRefine((input, ctx) => {
  if (input.scope === 'driver' && (input.type !== 'driving_license' || input.vehicleId !== null)) {
    ctx.addIssue({ code: 'custom', message: 'Driving licence must belong to the driver, with no vehicle.', path: ['scope'] });
  }
  if (input.scope === 'vehicle' && (input.type === 'driving_license' || !input.vehicleId)) {
    ctx.addIssue({ code: 'custom', message: 'Vehicle documents require a vehicle and cannot be a driving licence.', path: ['vehicleId'] });
  }
});

export type DocumentInput = z.input<typeof documentInputSchema>;
export type ParsedDocumentInput = z.output<typeof documentInputSchema>;

export type SelectedFile = { uri: string; mimeType: string; sizeBytes: number; name: string };
export type ValidSelectedFile = SelectedFile & { mimeType: DocumentMimeType; extension: 'pdf' | 'jpg' | 'png' };

const extensions: Record<DocumentMimeType, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
};

export function validateSelectedFile(file: SelectedFile): ValidSelectedFile {
  if (!file.uri.startsWith('file://')) throw new Error('Choose a local document file.');
  if (!(file.mimeType in extensions)) throw new Error('Only PDF, JPEG, and PNG documents are supported.');
  const mimeType = file.mimeType as DocumentMimeType;
  const nameExtension = file.name.split('.').pop()?.toLowerCase();
  if (!nameExtension || !extensions[mimeType].includes(nameExtension)) throw new Error('Document type and filename do not match.');
  if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0) throw new Error('The selected document is empty.');
  if (file.sizeBytes > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds the 20 MB limit.');
  const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
  return { ...file, mimeType, extension };
}

export function matchesDocumentSignature(bytes: Uint8Array, mimeType: DocumentMimeType): boolean {
  const signature = mimeType === 'application/pdf'
    ? [37, 80, 68, 70, 45]
    : mimeType === 'image/png'
      ? [137, 80, 78, 71, 13, 10, 26, 10]
      : [255, 216, 255];
  return signature.every((byte, index) => bytes[index] === byte);
}
