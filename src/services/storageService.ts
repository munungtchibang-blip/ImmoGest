import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

export interface UploadedProofFile {
  url: string;
  name: string;
  size: number;
  type: string;
  storagePath?: string;
  isBase64Fallback?: boolean;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/jpg',
  'image/webp',
  'application/pdf',
];

export function validateProofFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'Aucun fichier sélectionné.' };
  }

  const isAllowedType = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) ||
    file.name.toLowerCase().endsWith('.pdf') ||
    file.name.toLowerCase().endsWith('.png') ||
    file.name.toLowerCase().endsWith('.jpg') ||
    file.name.toLowerCase().endsWith('.jpeg');

  if (!isAllowedType) {
    return {
      valid: false,
      error: 'Format non supporté. Veuillez choisir une image (JPG, PNG) ou un document PDF.',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Le fichier dépasse la taille maximale autorisée de 5 Mo (${(file.size / (1024 * 1024)).toFixed(1)} Mo).`,
    };
  }

  return { valid: true };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a payment proof file to Firebase Storage with automatic fallback to DataURL if storage fails or is restricted.
 */
export async function uploadPaymentProofFile(file: File, tenantId: string): Promise<UploadedProofFile> {
  const validation = validateProofFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const timestamp = Date.now();
  const storagePath = `payment_proofs/${tenantId || 'anonymous'}/${timestamp}_${sanitizedName}`;

  try {
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || 'application/octet-stream',
      customMetadata: {
        originalName: file.name,
        tenantId: tenantId || '',
        uploadedAt: new Date().toISOString(),
      },
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);
    return {
      url: downloadUrl,
      name: file.name,
      size: file.size,
      type: file.type,
      storagePath,
      isBase64Fallback: false,
    };
  } catch (storageError) {
    console.warn('Firebase Storage direct upload failed, falling back to secure encoded representation:', storageError);
    // Reliable fallback for preview environments or unconfigured storage buckets:
    const base64Data = await readFileAsDataUrl(file);
    return {
      url: base64Data,
      name: file.name,
      size: file.size,
      type: file.type,
      isBase64Fallback: true,
    };
  }
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
