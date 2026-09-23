import { createDocumentCache } from './document-cache';
import { requireDocumentIdentity } from './documents';
import { cancelReminders } from './notifications';
import { readOfflineIndex, writeOfflineIndex } from './offline-index';
import type { DocumentMimeType } from '../types/document';

const BUCKET = 'cardoc-documents';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DeleteRow = { id: string; user_id: string; file_path: string; mime_type: DocumentMimeType };

function checkedPath(row: DeleteRow, userId: string, documentId: string): string {
  const extensions = row.mime_type === 'application/pdf' ? ['pdf']
    : row.mime_type === 'image/jpeg' ? ['jpg', 'jpeg']
      : row.mime_type === 'image/png' ? ['png'] : [];
  const extension = row.file_path.match(/\.([a-z]+)$/i)?.[1]?.toLowerCase();
  if (row.user_id !== userId || row.id !== documentId || !extension
    || !extensions.includes(extension) || row.file_path !== `${userId}/${documentId}.${extension}`) {
    throw new Error('Document storage path is invalid.');
  }
  return row.file_path;
}

/** Delete cloud bytes first and metadata last so a partial failure can be retried by ID. */
export async function deleteDocument(documentId: string): Promise<void> {
  if (!UUID.test(documentId)) throw new Error('Invalid document ID.');
  const { userId, client } = requireDocumentIdentity();
  const { data: row, error: fetchError } = await client.from('documents')
    .select('id,user_id,file_path,mime_type')
    .eq('user_id', userId)
    .eq('id', documentId)
    .maybeSingle();
  if (fetchError) throw new Error('Document could not be loaded. Retry when connected.');
  if (!row) throw new Error('Document not found.');
  const path = checkedPath(row as DeleteRow, userId, documentId);

  try {
    const { error } = await client.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  } catch {
    throw new Error('Cloud file could not be removed. No local data was deleted; retry.');
  }

  try {
    await createDocumentCache(userId).remove(documentId);
  } catch {
    throw new Error('Cloud file was removed, but the local copy could not be cleared. Retry deletion.');
  }
  try {
    await cancelReminders(userId, documentId);
  } catch {
    throw new Error('Files were removed, but reminders could not be cleared. Retry deletion.');
  }
  try {
    const current = await readOfflineIndex(userId);
    await writeOfflineIndex(userId, {
      ...current,
      documents: current.documents.filter((document) => document.id !== documentId),
    });
  } catch {
    throw new Error('Files were removed, but offline metadata could not be cleared. Retry deletion.');
  }

  try {
    const { data, error } = await client.from('documents').delete()
      .eq('user_id', userId)
      .eq('id', documentId)
      .select('id')
      .maybeSingle();
    if (error || !data) throw error ?? new Error('No document was deleted.');
  } catch {
    throw new Error('Cloud and local copies were removed, but metadata could not be deleted. Retry deletion when connected.');
  }
}
