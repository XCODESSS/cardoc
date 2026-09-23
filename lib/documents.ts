import { getAuthState } from './auth';
import { createDocumentCache } from './document-cache';
import { readOfflineIndex, writeOfflineIndex } from './offline-index';
import { getSupabaseClient } from './supabase';
import type { CarDocument, DocumentMimeType, DocumentScope, DocumentType } from '../types/document';

export type DocumentRow = {
  id: string; user_id: string; vehicle_id: string | null; scope: DocumentScope; type: DocumentType;
  display_name: string; file_path: string; mime_type: DocumentMimeType; size_bytes: number;
  expiry_date: string | null; created_at: string; updated_at: string;
};

export function requireDocumentIdentity() {
  const auth = getAuthState();
  if (auth.status !== 'signedIn' || !auth.userId) throw new Error('Sign in to manage documents.');
  const client = getSupabaseClient();
  if (!client) throw new Error('Cardoc is not configured for cloud storage.');
  return { userId: auth.userId, client };
}

export function mapDocument(row: DocumentRow, offlineAvailable: boolean): CarDocument {
  return {
    id: row.id, userId: row.user_id, vehicleId: row.vehicle_id, scope: row.scope,
    type: row.type, displayName: row.display_name, filePath: row.file_path,
    mimeType: row.mime_type, sizeBytes: row.size_bytes, expiryDate: row.expiry_date,
    offlineAvailable, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function getLocalDocumentUri(document: CarDocument): Promise<string | null> {
  const auth = getAuthState();
  if ((auth.status !== 'signedIn' && auth.status !== 'offline') || auth.userId !== document.userId) {
    throw new Error('Document owner mismatch.');
  }
  return createDocumentCache(document.userId).get(document.id);
}

export async function listDocuments(userId: string): Promise<CarDocument[]> {
  const identity = requireDocumentIdentity();
  if (identity.userId !== userId) throw new Error('Document owner mismatch.');
  const { data, error } = await identity.client.from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const cache = createDocumentCache(userId);
  const documents = await Promise.all(((data ?? []) as DocumentRow[]).map(async (row) => mapDocument(row, await cache.exists(row.id))));
  const current = await readOfflineIndex(userId);
  await writeOfflineIndex(userId, { ...current, documents });
  return documents;
}

export async function getDocument(id: string): Promise<CarDocument | null> {
  const identity = requireDocumentIdentity();
  const { data, error } = await identity.client.from('documents').select('*').eq('user_id', identity.userId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as DocumentRow;
  return mapDocument(row, await createDocumentCache(identity.userId).exists(row.id));
}
