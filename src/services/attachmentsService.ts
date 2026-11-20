import { TaskAttachment } from '../types/project';
import { getSupabaseClient } from './cloudSync';

export const ATTACHMENT_BUCKET = 'task-attachments';
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'csv',
  'pptx',
  'ppt',
  'txt',
  'md',
  'rtf',
  'odt',
  'ods',
  'odp',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'zip',
] as const;

export const ATTACHMENT_ACCEPT_ATTR = ALLOWED_ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',');

const IDB_NAME = 'pivot_attachments_db';
const IDB_VERSION = 1;
const IDB_STORE = 'files';

interface StoredLocalFile {
  id: string;
  blob: Blob;
  name: string;
  mimeType: string;
  updatedAt: string;
}

export interface AttachmentUploadResult {
  attachment: TaskAttachment;
  usedFallback: boolean;
  fallbackReason?: string;
}

export type AttachmentCategory = 'pdf' | 'word' | 'excel' | 'ppt' | 'image' | 'archive' | 'text';

export function getFileExtension(fileName: string): string {
  const parts = fileName.trim().toLowerCase().split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1] || '';
}

export function getAttachmentExtCategory(extension: string): AttachmentCategory {
  const ext = extension.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc' || ext === 'docx' || ext === 'odt' || ext === 'rtf') return 'word';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv' || ext === 'ods') return 'excel';
  if (ext === 'ppt' || ext === 'pptx' || ext === 'odp') return 'ppt';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
  if (ext === 'zip') return 'archive';
  return 'text';
}

export function isPreviewableAttachment(
  att: Pick<TaskAttachment, 'extension' | 'mimeType'>
): boolean {
  const ext = (att.extension || '').toLowerCase();
  const mime = (att.mimeType || '').toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return true;
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return true;
  if (mime.startsWith('image/')) return true;
  return false;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2).replace('.', ',')} MB`;
}

export function validateAttachmentFile(file: File): { valid: boolean; error?: string; extension: string } {
  const ext = getFileExtension(file.name);
  if (!ext || !ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext as (typeof ALLOWED_ATTACHMENT_EXTENSIONS)[number])) {
    return {
      valid: false,
      extension: ext,
      error: `Formato ".${ext || '?'}" não permitido. Envie documentos Office, PDF, CSV, TXT, imagens ou ZIP.`,
    };
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      extension: ext,
      error: `O arquivo "${file.name}" excede o limite de 10 MB (${formatFileSize(file.size)}).`,
    };
  }
  return { valid: true, extension: ext };
}

function sanitizeFileName(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  return normalized.slice(0, 120) || 'arquivo';
}

function generateFileId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// CAMADA INDEXEDDB (FALLBACK LOCAL RESILIENTE NO NAVEGADOR)
// ============================================================================

function openAttachmentsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste navegador.'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Erro ao abrir IndexedDB.'));
  });
}

export async function saveBlobToIndexedDB(
  id: string,
  blob: Blob,
  name: string,
  mimeType: string
): Promise<void> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const record: StoredLocalFile = {
      id,
      blob,
      name,
      mimeType,
      updatedAt: new Date().toISOString(),
    };
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Erro ao gravar anexo no IndexedDB.'));
  });
}

export async function getBlobFromIndexedDB(id: string): Promise<Blob | null> {
  const db = await openAttachmentsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const rec = req.result as StoredLocalFile | undefined;
      resolve(rec?.blob || null);
    };
    req.onerror = () => reject(req.error || new Error('Erro ao ler anexo do IndexedDB.'));
  });
}

export async function deleteBlobFromIndexedDB(id: string): Promise<void> {
  try {
    const db = await openAttachmentsDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore cleanup failures
  }
}

// ============================================================================
// OPERAÇÕES DE ANEXO EM TAREFAS E SUBPROJETOS
// ============================================================================

export async function uploadTaskAttachment(
  userId: string | undefined,
  taskId: string,
  file: File
): Promise<AttachmentUploadResult> {
  const check = validateAttachmentFile(file);
  if (!check.valid) {
    throw new Error(check.error || 'Arquivo inválido.');
  }

  const id = generateFileId();
  const safeName = sanitizeFileName(file.name);
  const mimeType = file.type || 'application/octet-stream';
  const uploadedAt = new Date().toISOString();

  const supabase = getSupabaseClient();
  if (supabase && userId) {
    const storagePath = `${userId}/${taskId}/${id}_${safeName}`;
    try {
      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(storagePath, file, { upsert: false, contentType: mimeType });

      if (!error) {
        return {
          attachment: {
            id,
            name: file.name,
            size: file.size,
            mimeType,
            extension: check.extension,
            storageProvider: 'supabase',
            storagePath,
            uploadedAt,
          },
          usedFallback: false,
        };
      }

      // Fallback transparente para IndexedDB caso o bucket/política ainda não esteja criado no Supabase
      await saveBlobToIndexedDB(id, file, file.name, mimeType);
      return {
        attachment: {
          id,
          name: file.name,
          size: file.size,
          mimeType,
          extension: check.extension,
          storageProvider: 'indexeddb',
          storagePath: id,
          uploadedAt,
        },
        usedFallback: true,
        fallbackReason: error.message,
      };
    } catch (err: any) {
      await saveBlobToIndexedDB(id, file, file.name, mimeType);
      return {
        attachment: {
          id,
          name: file.name,
          size: file.size,
          mimeType,
          extension: check.extension,
          storageProvider: 'indexeddb',
          storagePath: id,
          uploadedAt,
        },
        usedFallback: true,
        fallbackReason: err?.message || 'Falha de conexão com Supabase Storage.',
      };
    }
  }

  await saveBlobToIndexedDB(id, file, file.name, mimeType);
  return {
    attachment: {
      id,
      name: file.name,
      size: file.size,
      mimeType,
      extension: check.extension,
      storageProvider: 'indexeddb',
      storagePath: id,
      uploadedAt,
    },
    usedFallback: true,
    fallbackReason: 'Sessão offline ou Supabase não configurado.',
  };
}

export async function syncLocalAttachmentToCloud(
  userId: string | undefined,
  taskId: string,
  attachment: TaskAttachment
): Promise<TaskAttachment> {
  if (attachment.storageProvider === 'supabase') return attachment;
  if (!userId) {
    throw new Error('Faça login com uma conta sincronizada para enviar à nuvem.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Cliente Supabase não configurado.');
  }

  const localBlob = await getBlobFromIndexedDB(attachment.storagePath);
  if (!localBlob) {
    throw new Error(`O arquivo local "${attachment.name}" não foi encontrado neste navegador.`);
  }

  const safeName = sanitizeFileName(attachment.name);
  const cloudPath = `${userId}/${taskId}/${attachment.id}_${safeName}`;

  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(cloudPath, localBlob, {
      upsert: true,
      contentType: attachment.mimeType || 'application/octet-stream',
    });

  if (error) {
    throw new Error(error.message || 'Falha ao enviar anexo ao bucket "task-attachments".');
  }

  await deleteBlobFromIndexedDB(attachment.storagePath);

  return {
    ...attachment,
    storageProvider: 'supabase',
    storagePath: cloudPath,
  };
}

export async function getAttachmentBlob(
  attachment: Pick<TaskAttachment, 'storageProvider' | 'storagePath' | 'name'>
): Promise<Blob> {
  if (attachment.storageProvider === 'supabase') {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Cliente Supabase indisponível para baixar este anexo.');
    }
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .download(attachment.storagePath);
    if (error || !data) {
      throw new Error(error?.message || `Não foi possível baixar "${attachment.name}" da nuvem.`);
    }
    return data;
  }

  const localBlob = await getBlobFromIndexedDB(attachment.storagePath);
  if (!localBlob) {
    throw new Error(`O arquivo "${attachment.name}" foi salvo localmente em outro navegador/dispositivo.`);
  }
  return localBlob;
}

export async function openOrPreviewTaskAttachment(attachment: TaskAttachment): Promise<void> {
  if (attachment.storageProvider === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(attachment.storagePath, 300);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        return;
      }
    }
  }

  const blob = await getAttachmentBlob(attachment);
  const typedBlob =
    blob.type || !attachment.mimeType ? blob : new Blob([blob], { type: attachment.mimeType });
  const objectUrl = URL.createObjectURL(typedBlob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function downloadTaskAttachment(attachment: TaskAttachment): Promise<void> {
  const blob = await getAttachmentBlob(attachment);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = attachment.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 15_000);
}

export async function deleteTaskAttachment(
  attachment: Pick<TaskAttachment, 'storageProvider' | 'storagePath'>
): Promise<void> {
  if (attachment.storageProvider === 'supabase') {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([attachment.storagePath]);
      } catch {
        // ignore cleanup failures
      }
    }
    return;
  }

  await deleteBlobFromIndexedDB(attachment.storagePath);
}

export async function deleteTaskAttachmentsBatch(attachments?: TaskAttachment[]): Promise<void> {
  if (!attachments || attachments.length === 0) return;

  const supabasePaths = attachments
    .filter((a) => a.storageProvider === 'supabase')
    .map((a) => a.storagePath);
  const localIds = attachments
    .filter((a) => a.storageProvider === 'indexeddb')
    .map((a) => a.storagePath);

  if (supabasePaths.length > 0) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove(supabasePaths);
      } catch {
        // ignore
      }
    }
  }

  for (const id of localIds) {
    await deleteBlobFromIndexedDB(id);
  }
}

// ============================================================================
// SUPORTE DE IMAGENS PARA O PLUGIN DRAFTS (QUADRO BRANCO)
// ============================================================================

async function maybeCompressDraftImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }
  if (file.size <= 700 * 1024) {
    return file;
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1600;
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(file);
        return;
      }
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          resolve(blob && blob.size < file.size ? blob : file);
        },
        file.type === 'image/png' ? 'image/png' : 'image/jpeg',
        0.88
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export async function uploadDraftImage(
  userId: string | undefined,
  file: File
): Promise<{
  storageProvider: 'supabase' | 'indexeddb';
  storagePath: string;
  objectUrl: string;
}> {
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error(`A imagem excede o limite de 10 MB (${formatFileSize(file.size)}).`);
  }

  const processedBlob = await maybeCompressDraftImage(file);
  const id = `drimg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const safeName = sanitizeFileName(file.name || 'colagem.png');
  const mimeType = processedBlob.type || file.type || 'image/png';
  const objectUrl = URL.createObjectURL(processedBlob);

  const supabase = getSupabaseClient();
  if (supabase && userId) {
    const cloudPath = `${userId}/drafts/${id}_${safeName}`;
    try {
      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(cloudPath, processedBlob, { upsert: false, contentType: mimeType });

      if (!error) {
        return {
          storageProvider: 'supabase',
          storagePath: cloudPath,
          objectUrl,
        };
      }
    } catch {
      // fallback abaixo
    }
  }

  await saveBlobToIndexedDB(id, processedBlob, safeName, mimeType);
  return {
    storageProvider: 'indexeddb',
    storagePath: id,
    objectUrl,
  };
}

export async function resolveDraftImageUrl(
  provider: 'supabase' | 'indexeddb' | 'inline' | undefined,
  storagePath: string | undefined
): Promise<string | null> {
  if (!provider || !storagePath) return null;
  if (provider === 'inline') return storagePath;

  if (provider === 'supabase') {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
    const { data: blobData, error: dlError } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .download(storagePath);
    if (!dlError && blobData) {
      return URL.createObjectURL(blobData);
    }
    return null;
  }

  const blob = await getBlobFromIndexedDB(storagePath);
  return blob ? URL.createObjectURL(blob) : null;
}
