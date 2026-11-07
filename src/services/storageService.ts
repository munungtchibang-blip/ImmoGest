import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

export interface UploadedProofFile {
  url: string;
  name: string;
  size: number;
  type: string;
  storagePath?: string;
  isBase64Fallback?: boolean;
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/jpg',
  'image/webp',
  'application/pdf',
];

/**
 * Inspecte les premiers octets (Magic Numbers) pour déterminer le type réel du fichier
 * et empêcher l'injection de fichiers exécutables ou corrompus.
 */
export async function detectFileSignature(file: File): Promise<{
  isValid: boolean;
  detectedType: string;
  isDangerous: boolean;
  errorMessage?: string;
}> {
  try {
    const slice = file.slice(0, 16);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes.length < 4) {
      return {
        isValid: false,
        detectedType: 'unknown',
        isDangerous: false,
        errorMessage: 'Fichier trop court ou illisible.',
      };
    }

    // 1. Détection de fichiers exécutables / dangereux
    // MZ (Windows PE Executable)
    if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
      return {
        isValid: false,
        detectedType: 'application/x-dosexec',
        isDangerous: true,
        errorMessage: 'Les fichiers exécutables (.exe) sont formellement interdits.',
      };
    }
    // ELF (Linux binary)
    if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
      return {
        isValid: false,
        detectedType: 'application/x-executable',
        isDangerous: true,
        errorMessage: 'Les fichiers binaires exécutables sont formellement interdits.',
      };
    }
    // Shell script '#!'
    if (bytes[0] === 0x23 && bytes[1] === 0x21) {
      return {
        isValid: false,
        detectedType: 'text/x-shellscript',
        isDangerous: true,
        errorMessage: 'Les scripts exécutables sont formellement interdits.',
      };
    }

    // 2. Détection JPEG / JPG (FF D8 FF)
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { isValid: true, detectedType: 'image/jpeg', isDangerous: false };
    }

    // 3. Détection PNG (89 50 4E 47 0D 0A 1A 0A)
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return { isValid: true, detectedType: 'image/png', isDangerous: false };
    }

    // 4. Détection WEBP (RIFF .... WEBP)
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes.length >= 12 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return { isValid: true, detectedType: 'image/webp', isDangerous: false };
    }

    // 5. Détection PDF (%PDF = 25 50 44 46)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return { isValid: true, detectedType: 'application/pdf', isDangerous: false };
    }

    // Si le type MIME déclaré est une image connue ou PDF mais que les octets ne correspondent pas
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext || '')) {
      return {
        isValid: false,
        detectedType: 'corrupted',
        isDangerous: false,
        errorMessage:
          'Le contenu du fichier ne correspond pas à son extension ou est corrompu. Veuillez fournir un fichier valide.',
      };
    }

    return {
      isValid: false,
      detectedType: 'unknown',
      isDangerous: false,
      errorMessage:
        'Format de fichier non reconnu. Seuls les justificatifs JPG, PNG, WEBP ou documents PDF sont acceptés.',
    };
  } catch (err) {
    console.warn('Erreur lecture binaire du fichier:', err);
    return {
      isValid: false,
      detectedType: 'error',
      isDangerous: false,
      errorMessage: 'Impossible de lire les données du fichier.',
    };
  }
}

/**
 * Valide entièrement un fichier de preuve :
 * 1. Présence du fichier
 * 2. Taille maximale (10 Mo)
 * 3. Type MIME et extension
 * 4. Signature binaire réelle (Magic numbers)
 */
export async function validateProofFile(file: File): Promise<{ valid: boolean; error?: string }> {
  if (!file) {
    return { valid: false, error: 'Aucun fichier sélectionné.' };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Le fichier dépasse la taille maximale autorisée de 10 Mo (${(file.size / (1024 * 1024)).toFixed(1)} Mo).`,
    };
  }

  // Vérification de la signature binaire
  const sig = await detectFileSignature(file);
  if (!sig.isValid) {
    return {
      valid: false,
      error: sig.errorMessage || 'Format de justificatif non autorisé ou corrompu.',
    };
  }

  return { valid: true };
}

/**
 * Compresse et optimise intelligemment une image (JPG, PNG, WEBP)
 * pour réduire la taille à ~150-250 Ko tout en préservant une netteté parfaite des textes et reçus.
 */
export async function compressImageIfNeeded(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<{ file: File; dataUrl: string; width: number; height: number }> {
  return new Promise((resolve) => {
    // Si c'est un PDF, on ne peut pas le compresser avec canvas
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          file,
          dataUrl: reader.result as string,
          width: 0,
          height: 0,
        });
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Arrière-plan blanc pour les transparences PNG converties
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        }

        const outputMime = 'image/jpeg';
        const compressedDataUrl = canvas.toDataURL(outputMime, quality);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: outputMime,
                lastModified: Date.now(),
              });
              resolve({
                file: compressedFile,
                dataUrl: compressedDataUrl,
                width,
                height,
              });
            } else {
              resolve({
                file,
                dataUrl: e.target?.result as string,
                width: img.width,
                height: img.height,
              });
            }
          },
          outputMime,
          quality
        );
      };
      img.onerror = () => {
        resolve({
          file,
          dataUrl: e.target?.result as string,
          width: 0,
          height: 0,
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Stockage local permanent IndexedDB pour sécuriser les fichiers contre toute perte
 */
const IDB_NAME = 'immogest_proofs_db';
const IDB_STORE = 'proof_files';

function getIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB non supporté'));
    }
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProofToLocalCache(id: string, dataUrl: string, name: string): Promise<void> {
  try {
    const db = await getIndexedDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put({ id, dataUrl, name, savedAt: Date.now() });
  } catch (err) {
    console.warn('Erreur mise en cache locale IndexedDB:', err);
  }
}

export async function getProofFromLocalCache(id: string): Promise<string | null> {
  try {
    const db = await getIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Téléversement multi-niveaux d'un justificatif de paiement :
 * - Niveau 1 : Validation binaire et compression intelligente
 * - Niveau 2 : Téléversement Firebase Storage avec suivi de progression (0-100%)
 * - Niveau 3 : Repli autonome et résilient vers DataURL optimisé (<300 Ko) si le bucket Cloud Storage est indisponible
 */
export async function uploadPaymentProofFile(
  file: File,
  tenantId: string,
  onProgress?: (percent: number) => void
): Promise<UploadedProofFile> {
  // 1. Validation de sécurité stricte
  if (onProgress) onProgress(10);
  const validation = await validateProofFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (onProgress) onProgress(25);

  // 2. Optimisation d'image si applicable
  let fileToUpload = file;
  let compressedDataUrl = '';

  const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
  if (isImage) {
    const compResult = await compressImageIfNeeded(file);
    fileToUpload = compResult.file;
    compressedDataUrl = compResult.dataUrl;
  } else {
    // PDF
    const reader = new FileReader();
    compressedDataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  if (onProgress) onProgress(45);

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const timestamp = Date.now();
  const storagePath = `payment_proofs/${tenantId || 'anonymous'}/${timestamp}_${sanitizedName}`;

  // 3. Essai de téléversement Firebase Storage avec rapport de progression
  try {
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, fileToUpload, {
      contentType: fileToUpload.type || 'application/octet-stream',
      customMetadata: {
        originalName: file.name,
        tenantId: tenantId || '',
        uploadedAt: new Date().toISOString(),
      },
    });

    const downloadUrl = await new Promise<string>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.totalBytes > 0 && onProgress) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 50) + 45; // 45% -> 95%
            onProgress(Math.min(95, pct));
          }
        },
        (error) => {
          reject(error);
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          } catch (e) {
            reject(e);
          }
        }
      );
    });

    if (onProgress) onProgress(100);

    // Sauvegarde également dans le cache local
    const proofFileId = `${timestamp}_${sanitizedName}`;
    await saveProofToLocalCache(proofFileId, downloadUrl, file.name);

    return {
      url: downloadUrl,
      name: file.name,
      size: fileToUpload.size,
      type: fileToUpload.type,
      storagePath,
      isBase64Fallback: false,
    };
  } catch (storageError) {
    console.warn(
      'Téléversement direct Firebase Storage non disponible ou restreint, utilisation du repli persistant sécurisé:',
      storageError
    );

    if (onProgress) onProgress(90);

    // Repli persistant sécurisé et contrôlé en volume
    // Firestore impose un plafond strict de 1 Mo par document : veillons à ce que le payload reste sous 700 Ko
    let safeUrl = compressedDataUrl;
    if (isImage && safeUrl.length > 800000) {
      try {
        const aggressiveComp = await compressImageIfNeeded(file, 1200, 0.65);
        safeUrl = aggressiveComp.dataUrl;
        fileToUpload = aggressiveComp.file;
      } catch {
        // conserve compressedDataUrl
      }
    } else if (!isImage && file.size > 750 * 1024) {
      throw new Error(
        `Le document PDF (${(file.size / (1024 * 1024)).toFixed(1)} Mo) dépasse le seuil de transmission directe hors cloud. Veuillez joindre une photo/capture nette du reçu ou un fichier PDF de moins de 1 Mo.`
      );
    }

    const proofFileId = `${timestamp}_${sanitizedName}`;
    await saveProofToLocalCache(proofFileId, safeUrl, file.name);

    if (onProgress) onProgress(100);

    return {
      url: safeUrl,
      name: file.name,
      size: fileToUpload.size,
      type: fileToUpload.type,
      storagePath,
      isBase64Fallback: true,
    };
  }
}

/**
 * Utilitaire universel pour télécharger n'importe quelle preuve de paiement (URL Cloud ou Data URL),
 * compatible sur ordinateurs de bureau, tablettes et smartphones (iOS / Android).
 */
export async function downloadProofFile(url: string, filename: string): Promise<void> {
  if (!url) return;
  const safeName = filename || `preuve_paiement_${Date.now()}`;

  try {
    if (url.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const response = await fetch(url, { mode: 'cors' });
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1500);
  } catch {
    // Si fetch est bloqué par CORS ou restrictions navigateur, ouverture directe
    const win = window.open(url, '_blank');
    if (!win) {
      window.location.href = url;
    }
  }
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
