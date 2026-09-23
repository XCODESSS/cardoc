import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { createDocumentCache } from './document-cache';
import { mapDocument, requireDocumentIdentity, type DocumentRow } from './documents';
import { rescheduleReminders, type ReminderResult } from './notifications';
import { readOfflineIndex, writeOfflineIndex } from './offline-index';
import type { CarDocument } from '../types/document';
import { documentInputSchema, matchesDocumentSignature, validateSelectedFile, type DocumentInput, type SelectedFile } from '../validation/document';

const BUCKET = 'cardoc-documents';

export interface UploadReminderOptions {
  /** Set true only after the upload screen has explained reminder notifications. */
  requestReminderPermission?: boolean;
  onReminderResult?: (result: ReminderResult | 'error') => void;
}

function mimeTypeFromName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  return '';
}

export async function selectFile(): Promise<SelectedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('No document was selected.');
  const selected = {
    uri: asset.uri, mimeType: asset.mimeType ?? mimeTypeFromName(asset.name), name: asset.name,
    sizeBytes: asset.size ?? new File(asset.uri).size,
  };
  return validateSelectedFile(selected);
}

export async function selectPhoto(): Promise<SelectedFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('No photo was selected.');
  const mimeType = asset.mimeType ?? mimeTypeFromName(asset.fileName ?? asset.uri.split('?')[0]);
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : '';
  const selected = {
    uri: asset.uri, mimeType, name: asset.fileName ?? `photo.${extension}`,
    sizeBytes: asset.fileSize ?? new File(asset.uri).size,
  };
  return validateSelectedFile(selected);
}

export async function uploadDocument(input: DocumentInput, file: SelectedFile, options: UploadReminderOptions = {}): Promise<CarDocument> {
  const metadata = documentInputSchema.parse(input);
  const selected = validateSelectedFile(file);
  const { userId, client } = requireDocumentIdentity();
  const source = new File(selected.uri);
  if (!source.exists || source.size !== selected.sizeBytes) throw new Error('Selected file changed or is unavailable. Choose it again.');
  const bytes = await source.arrayBuffer();
  if (bytes.byteLength !== selected.sizeBytes) throw new Error('Selected file changed while reading it.');
  if (!matchesDocumentSignature(new Uint8Array(bytes), selected.mimeType)) throw new Error('Document content does not match its file type.');

  const documentId = Crypto.randomUUID();
  const path = `${userId}/${documentId}.${selected.extension}`;
  const storage = client.storage.from(BUCKET);
  const { error: uploadError } = await storage.upload(path, bytes, { contentType: selected.mimeType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  let row: DocumentRow;
  try {
    const { data, error } = await client.from('documents').insert({
      id: documentId, user_id: userId, vehicle_id: metadata.vehicleId,
      scope: metadata.scope, type: metadata.type, display_name: metadata.displayName,
      file_path: path, mime_type: selected.mimeType, size_bytes: bytes.byteLength,
      expiry_date: metadata.expiryDate,
    }).select('*').single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Document metadata was not saved.');
    row = data as DocumentRow;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'Document metadata was not saved.';
    try {
      const { error } = await storage.remove([path]);
      if (error) throw error;
    } catch {
      throw new Error(`${reason}. Uploaded file cleanup also failed; retry with support.`);
    }
    throw new Error(reason);
  }

  const document = mapDocument(row, false);
  let reminderResult: ReminderResult | 'error' = 'none';
  if (document.expiryDate !== null) {
    try {
      reminderResult = await rescheduleReminders(userId, document, {
        requestPermission: options.requestReminderPermission ?? false,
      });
    } catch {
      // Notification errors must not make a committed cloud document look unsaved.
      reminderResult = 'error';
    }
  }
  try { options.onReminderResult?.(reminderResult); } catch { /* Observer errors are nonfatal. */ }
  try {
    return await retryOfflineCopy(document, selected);
  } catch {
    // The cloud record remains usable; the UI must state that offline access failed.
    try {
      const current = await readOfflineIndex(userId);
      await writeOfflineIndex(userId, {
        ...current, documents: [document, ...current.documents.filter((item) => item.id !== document.id)],
      });
    } catch { /* Cloud record remains authoritative; listDocuments can refresh the index. */ }
    return document;
  }
}

export async function retryOfflineCopy(document: CarDocument, file: SelectedFile): Promise<CarDocument> {
  const { userId } = requireDocumentIdentity();
  if (document.userId !== userId) throw new Error('Document owner mismatch.');
  const selected = validateSelectedFile(file);
  if (selected.mimeType !== document.mimeType || selected.sizeBytes !== document.sizeBytes) {
    throw new Error('Choose the same document to retry offline storage.');
  }
  const source = new File(selected.uri);
  if (!source.exists || source.size !== selected.sizeBytes) throw new Error('Selected file is no longer available.');
  const cache = createDocumentCache(userId);
  const staging = new Directory(Paths.cache, 'cardoc-upload-staging', userId);
  const staged = new File(staging, `${document.id}.${selected.extension}`);
  let cached: CarDocument;
  try {
    staging.create({ idempotent: true, intermediates: true });
    await source.copy(staged);
    await cache.save(document.id, staged.uri);
    const uri = await cache.get(document.id);
    if (!uri) throw new Error('Offline copy could not be verified.');
    cached = { ...document, offlineAvailable: true };
  } finally {
    if (staged.exists) staged.delete();
  }
  const current = await readOfflineIndex(userId);
  await writeOfflineIndex(userId, {
    ...current, documents: [cached, ...current.documents.filter((item) => item.id !== document.id)],
  });
  return cached;
}
