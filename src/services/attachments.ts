import type { FinanceDB } from '../db/db';
import { newSystemFields } from './entity';

/** SPEC 3.4: receipts and images are stored compressed, up to 1600px, as JPEG. */
export const MAX_IMAGE_SIDE = 1600;

export async function compressImage(file: Blob, maxSide = MAX_IMAGE_SIDE, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  // Older iOS: a regular canvas.
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', quality));
}

export async function saveAttachment(db: FinanceDB, file: Blob): Promise<string> {
  const blob = await compressImage(file);
  const { id, createdAt } = newSystemFields();
  await db.attachments.add({ id, blob, mime: blob.type || 'application/octet-stream', size: blob.size, createdAt });
  return id;
}

/** Soft delete, like every other entity: nothing is lost until a restore replaces the data. */
export async function deleteAttachment(db: FinanceDB, id: string): Promise<void> {
  const ts = new Date().toISOString();
  await db.attachments.update(id, { deletedAt: ts, updatedAt: ts });
}
