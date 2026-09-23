import { Directory, File, Paths } from 'expo-file-system';

export interface DocumentCache {
  save(documentId: string, sourceUri: string): Promise<string>;
  get(documentId: string): Promise<string | null>;
  remove(documentId: string): Promise<void>;
  exists(documentId: string): Promise<boolean>;
}

const EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let temporaryFileSequence = 0;

function requireId(value: string, kind: 'user' | 'document'): string {
  if (!UUID.test(value)) throw new Error(`Invalid ${kind} ID`);
  return value.toLowerCase();
}

function sourceExtension(uri: string): (typeof EXTENSIONS)[number] {
  if (!uri.startsWith('file:/') || uri.includes('?') || uri.includes('#') || uri.includes('\\')) {
    throw new Error('Invalid source URI');
  }

  const path = uri.slice('file:'.length);
  if (path.startsWith('//') && (!path.startsWith('///') || path.startsWith('////'))) {
    throw new Error('Invalid source URI');
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    throw new Error('Invalid source URI');
  }
  if (decodedPath.includes('\\') || decodedPath.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid source URI');
  }

  const extension = /\.([a-z]+)$/i.exec(decodedPath)?.[1].toLowerCase();
  if (!EXTENSIONS.includes(extension as (typeof EXTENSIONS)[number])) {
    throw new Error('Unsupported source URI');
  }
  return extension as (typeof EXTENSIONS)[number];
}

function isUsable(file: File): boolean {
  return file.exists && Number.isFinite(file.size) && file.size > 0;
}

export function createDocumentCache(userId: string): DocumentCache {
  const ownerId = requireId(userId, 'user');
  const directory = new Directory(Paths.document, 'cardoc', ownerId);

  function fileFor(documentId: string, extension: string): File {
    return new File(directory, `${documentId}.${extension}`);
  }

  function getCached(documentId: string): string | null {
    const id = requireId(documentId, 'document');
    for (const extension of EXTENSIONS) {
      const file = fileFor(id, extension);
      if (isUsable(file)) return file.uri;
    }
    return null;
  }

  return {
    async save(documentId, sourceUri) {
      const id = requireId(documentId, 'document');
      const extension = sourceExtension(sourceUri);
      const source = new File(sourceUri);
      if (!source.exists) throw new Error('Source file does not exist');
      if (!isUsable(source)) throw new Error('Source file is empty');

      directory.create({ idempotent: true, intermediates: true });
      const temporaryName = `.${id}.${Date.now()}-${++temporaryFileSequence}-${Math.random().toString(36).slice(2)}.tmp`;
      const temporary = new File(directory, temporaryName);
      const destination = fileFor(id, extension);

      try {
        await source.copy(temporary);
        if (!isUsable(temporary)) throw new Error('Cached copy is empty');
        await temporary.move(destination, { overwrite: true });
      } catch (error) {
        if (temporary.exists) temporary.delete();
        throw error;
      }

      for (const otherExtension of EXTENSIONS) {
        if (otherExtension === extension) continue;
        const old = fileFor(id, otherExtension);
        if (old.exists) old.delete();
      }
      return destination.uri;
    },

    async get(documentId) {
      return getCached(documentId);
    },

    async remove(documentId) {
      const id = requireId(documentId, 'document');
      for (const extension of EXTENSIONS) {
        const file = fileFor(id, extension);
        if (file.exists) file.delete();
      }
    },

    async exists(documentId) {
      return getCached(documentId) !== null;
    },
  };
}
