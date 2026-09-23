import { Directory, File, Paths } from 'expo-file-system';

import { getAuthState } from './auth';
import { createDocumentCache } from './document-cache';
import { getDocumentStatus, type DocumentStatus } from './document-status';
import { getSupabaseClient } from './supabase';
import type { CarDocument } from '../types/document';

export const PRESENT_TYPES = ['registration', 'driving_license', 'insurance', 'puc'] as const;
export type PresentType = (typeof PRESENT_TYPES)[number];
export type PresentSlot = {
  type: PresentType;
  document: CarDocument | null;
  status: DocumentStatus | 'missing';
};

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export function getPresentSlots(vehicleId: string, documents: CarDocument[], today: Date, userId: string): PresentSlot[] {
  return PRESENT_TYPES.map((type) => {
    const eligible = documents.filter((item) => item.userId === userId && item.type === type && (
      type === 'driving_license'
        ? item.scope === 'driver' && item.vehicleId === null
        : item.scope === 'vehicle' && item.vehicleId === vehicleId
    ));
    eligible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    const document = eligible[0] ?? null;
    return { type, document, status: document ? getDocumentStatus(document.expiryDate, today) : 'missing' };
  });
}

function checkedFilePath(document: CarDocument): string {
  const extension = document.filePath.match(/\.([a-z]+)$/i)?.[1]?.toLowerCase();
  const mimeExtensions = document.mimeType === 'application/pdf' ? ['pdf']
    : document.mimeType === 'image/jpeg' ? ['jpg', 'jpeg']
      : document.mimeType === 'image/png' ? ['png'] : [];
  if (!extension || !mimeExtensions.includes(extension)
    || document.filePath !== `${document.userId}/${document.id}.${extension}`) {
    throw new Error('Document storage path is invalid.');
  }
  return extension;
}

/** Return a physical local file. A cache hit never calls the network. */
export async function openPresentDocument(document: CarDocument): Promise<string> {
  const auth = getAuthState();
  if (!auth.userId || auth.userId !== document.userId || (auth.status !== 'signedIn' && auth.status !== 'offline')) {
    throw new Error('Document owner mismatch.');
  }
  const extension = checkedFilePath(document);
  const cache = createDocumentCache(auth.userId);
  const localUri = await cache.get(document.id);
  if (localUri) return localUri;
  if (auth.status !== 'signedIn') throw new Error('This document is not available offline. Connect and retry.');

  const client = getSupabaseClient();
  if (!client) throw new Error('Cloud storage is unavailable.');
  const { data, error } = await client.storage.from('cardoc-documents').createSignedUrl(document.filePath, 60);
  if (error || !data?.signedUrl) throw new Error('Could not retrieve this document. Retry when connected.');

  const staging = new Directory(Paths.cache, 'cardoc-upload-staging', auth.userId);
  staging.create({ idempotent: true, intermediates: true });
  const staged = new File(staging, `cardoc-${document.id}-${Date.now()}.${extension}`);
  try {
    const downloaded = await File.downloadFileAsync(data.signedUrl, staged);
    if (!downloaded.exists || !downloaded.size || downloaded.size <= 0 || downloaded.size > MAX_DOCUMENT_BYTES
      || downloaded.size !== document.sizeBytes) {
      throw new Error('Downloaded document did not match its saved size.');
    }
    return await cache.save(document.id, downloaded.uri);
  } finally {
    if (staged.exists) staged.delete();
  }
}
