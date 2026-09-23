import { clearDocumentCache, createDocumentCache } from '../lib/document-cache';

const mockFiles = new Map<string, number>();
let mockCopyFailure = false;
let mockDirectoryDeleteFailure: string | null = null;

jest.mock('expo-file-system', () => {
  const join = (...parts: string[]) => parts.join('/').replace(/\/{2,}/g, '/');

  class Directory {
    uri: string;

    constructor(...parts: Array<string | Directory>) {
      this.uri = join(...parts.map((part) => typeof part === 'string' ? part : part.uri));
    }

    create() { /* Directories are implicit in this filesystem mock. */ }

    get exists() { return [...mockFiles.keys()].some((uri) => uri.startsWith(`${this.uri}/`)); }

    delete() {
      if (this.uri === mockDirectoryDeleteFailure) throw new Error('Directory removal failed');
      for (const uri of mockFiles.keys()) if (uri.startsWith(`${this.uri}/`)) mockFiles.delete(uri);
    }
  }

  class File {
    uri: string;

    constructor(...parts: Array<string | Directory>) {
      this.uri = join(...parts.map((part) => typeof part === 'string' ? part : part.uri));
    }

    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri) ?? null; }

    async copy(destination: File) {
      if (!this.exists) throw new Error('Source missing');
      mockFiles.set(destination.uri, this.size ?? 0);
      if (mockCopyFailure) throw new Error('Copy interrupted');
    }

    async move(destination: File, options?: { overwrite?: boolean }) {
      if (!this.exists) throw new Error('Temporary file missing');
      if (destination.exists && !options?.overwrite) throw new Error('Destination exists');
      mockFiles.set(destination.uri, this.size ?? 0);
      mockFiles.delete(this.uri);
      this.uri = destination.uri;
    }

    delete() {
      if (!this.exists) throw new Error('File missing');
      mockFiles.delete(this.uri);
    }
  }

  return { Directory, File, Paths: { document: new Directory('file:/documents'), cache: new Directory('file:/cache') } };
});

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const documentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const stagedPdf = 'file:/staging/rc.pdf';
const stagedPng = 'file:/staging/replacement.png';

beforeEach(() => {
  mockFiles.clear();
  mockCopyFailure = false;
  mockDirectoryDeleteFailure = null;
  mockFiles.set(stagedPdf, 1024);
  mockFiles.set(stagedPng, 2048);
});

test('saves a copy that survives a new cache instance', async () => {
  const savedUri = await createDocumentCache(userA).save(documentId, stagedPdf);
  expect(savedUri).toBe(`file:/documents/cardoc/${userA}/${documentId}.pdf`);
  expect(savedUri).not.toBe(stagedPdf);
  expect(await createDocumentCache(userA).get(documentId)).toBe(savedUri);
  expect(await createDocumentCache(userA).exists(documentId)).toBe(true);
});

test('returns null when a cached file has disappeared and remove is idempotent', async () => {
  const cache = createDocumentCache(userA);
  expect(await cache.get(documentId)).toBeNull();
  await cache.remove(documentId);
  const uri = await cache.save(documentId, stagedPdf);
  mockFiles.delete(uri);
  expect(await cache.get(documentId)).toBeNull();
  expect(await cache.exists(documentId)).toBe(false);
  await cache.remove(documentId);
});

test('keeps the same document ID separate for different users', async () => {
  const a = createDocumentCache(userA);
  const b = createDocumentCache(userB);
  const aUri = await a.save(documentId, stagedPdf);
  expect(await b.get(documentId)).toBeNull();
  const bUri = await b.save(documentId, stagedPdf);
  expect(bUri).not.toBe(aUri);
  await a.remove(documentId);
  expect(await b.get(documentId)).toBe(bUri);
});

test('rejects invalid IDs and non-staged source URIs', async () => {
  expect(() => createDocumentCache('../other')).toThrow(/user/i);
  const cache = createDocumentCache(userA);
  await expect(cache.save('../rc', stagedPdf)).rejects.toThrow(/document/i);
  await expect(cache.get('../rc')).rejects.toThrow(/document/i);
  await expect(cache.remove('../rc')).rejects.toThrow(/document/i);
  await expect(cache.save(documentId, 'https://example.com/rc.pdf')).rejects.toThrow(/source/i);
  await expect(cache.save(documentId, 'file:/staging/rc.txt')).rejects.toThrow(/source/i);
  await expect(cache.save(documentId, 'file:/staging/../rc.pdf')).rejects.toThrow(/source/i);
  await expect(cache.save(documentId, 'file:/staging/rc.PDF?token=1')).rejects.toThrow(/source/i);
});

test('rejects empty files', async () => {
  mockFiles.set(stagedPdf, 0);
  await expect(createDocumentCache(userA).save(documentId, stagedPdf)).rejects.toThrow(/empty/i);
  expect(await createDocumentCache(userA).get(documentId)).toBeNull();
});

test('cleans a partial copy and preserves the previous cached document', async () => {
  const cache = createDocumentCache(userA);
  const existingUri = await cache.save(documentId, stagedPdf);
  mockCopyFailure = true;
  await expect(cache.save(documentId, stagedPng)).rejects.toThrow(/Copy interrupted/);
  expect(await cache.get(documentId)).toBe(existingUri);
  expect([...mockFiles.keys()].filter((uri) => uri.includes('/cardoc/'))).toEqual([existingUri]);
});

test('replaces a cached document when its staged format changes', async () => {
  const cache = createDocumentCache(userA);
  const oldUri = await cache.save(documentId, stagedPdf);
  const newUri = await cache.save(documentId, stagedPng);
  expect(newUri).toBe(`file:/documents/cardoc/${userA}/${documentId}.png`);
  expect(mockFiles.has(oldUri)).toBe(false);
  expect(await createDocumentCache(userA).get(documentId)).toBe(newUri);
  await cache.remove(documentId);
  expect(mockFiles.has(newUri)).toBe(false);
});

test('does not return a truncated cached file', async () => {
  const cache = createDocumentCache(userA);
  const uri = await cache.save(documentId, stagedPdf);
  mockFiles.set(uri, 0);
  expect(await cache.get(documentId)).toBeNull();
  expect(await cache.exists(documentId)).toBe(false);
});

test('exists remains usable when passed as a callback', async () => {
  const cache = createDocumentCache(userA);
  await cache.save(documentId, stagedPdf);
  const { exists } = cache;
  expect(await exists(documentId)).toBe(true);
});

test('account cleanup removes all cached files for one owner, including orphaned files', async () => {
  const own = await createDocumentCache(userA).save(documentId, stagedPdf);
  const other = await createDocumentCache(userB).save(documentId, stagedPdf);
  mockFiles.set(`file:/documents/cardoc/${userA}/orphan.pdf`, 512);
  mockFiles.set(`file:/cache/cardoc-upload-staging/${userA}/orphan.pdf`, 512);
  mockFiles.set(`file:/cache/cardoc-upload-staging/${userB}/other.pdf`, 512);
  await clearDocumentCache(userA);
  expect(mockFiles.has(own)).toBe(false);
  expect(mockFiles.has(`file:/documents/cardoc/${userA}/orphan.pdf`)).toBe(false);
  expect(mockFiles.has(`file:/cache/cardoc-upload-staging/${userA}/orphan.pdf`)).toBe(false);
  expect(mockFiles.has(`file:/cache/cardoc-upload-staging/${userB}/other.pdf`)).toBe(true);
  expect(mockFiles.has(other)).toBe(true);
  await clearDocumentCache(userA);
});

test('account cleanup attempts staging removal even when document removal fails', async () => {
  mockFiles.set(`file:/documents/cardoc/${userA}/orphan.pdf`, 512);
  mockFiles.set(`file:/cache/cardoc-upload-staging/${userA}/orphan.pdf`, 512);
  mockDirectoryDeleteFailure = `file:/documents/cardoc/${userA}`;
  await expect(clearDocumentCache(userA)).rejects.toThrow('Directory removal failed');
  expect(mockFiles.has(`file:/cache/cardoc-upload-staging/${userA}/orphan.pdf`)).toBe(false);
});
