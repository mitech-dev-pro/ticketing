// Attachment storage, wired to Vercel Blob in Phase 3. This is the only file besides
// lib/email.ts and vercel.json allowed to know about Vercel (D-11) — swapping hosts
// later means replacing this file, nothing else.
//
// Without BLOB_READ_WRITE_TOKEN (local dev, tests) files are written under .uploads/
// on disk instead, mirroring lib/email.ts's console fallback for Resend.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { put } from '@vercel/blob';
import { env } from '@/lib/env';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_ATTACHMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), '.uploads');

export interface UploadAttachmentInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface StoredAttachment {
  storageKey: string;
}

export async function uploadAttachment(input: UploadAttachmentInput): Promise<StoredAttachment> {
  const key = `${randomUUID()}-${input.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

  if (!env.BLOB_READ_WRITE_TOKEN) {
    await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_UPLOAD_DIR, key), input.buffer);
    return { storageKey: `local:${key}` };
  }

  const blob = await put(key, input.buffer, {
    access: 'public',
    contentType: input.mimeType,
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  return { storageKey: `blob:${blob.url}` };
}

export interface RetrievedAttachment {
  buffer: Buffer;
}

/** Streams the bytes back server-side so the download route can enforce permissions
 * before ever exposing the underlying Blob URL or local path to the client. */
export async function retrieveAttachment(storageKey: string): Promise<RetrievedAttachment> {
  if (storageKey.startsWith('local:')) {
    const key = storageKey.slice('local:'.length);
    const buffer = await readFile(path.join(LOCAL_UPLOAD_DIR, key));
    return { buffer };
  }

  if (storageKey.startsWith('blob:')) {
    const url = storageKey.slice('blob:'.length);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch attachment from storage: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer };
  }

  throw new Error(`Unrecognised storage key: ${storageKey}`);
}
