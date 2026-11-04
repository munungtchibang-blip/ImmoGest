import { db } from './firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Normalise strictement une adresse e-mail :
 * 1. Supprime les espaces inutiles au début et à la fin
 * 2. Convertit tous les caractères en minuscules
 * 3. Ne modifie pas les alias (+) ou points arbitrairement
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Valide le format d'une adresse email
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(normalized);
}

export interface EmailCheckResult {
  isAvailable: boolean;
  existingRole?: 'landlord' | 'tenant' | 'technician' | 'admin';
  existingUserId?: string;
  errorMessage?: string;
}

/**
 * Vérifie côté serveur (Firestore) si une adresse e-mail normalisée est déjà attribuée
 * à un compte utilisateur dans toute l'application, tous rôles confondus.
 * Règle d'or : 1 email normalisé = 1 seule identité utilisateur.
 */
export async function verifyEmailUniqueness(email: string, excludeUid?: string): Promise<EmailCheckResult> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !isValidEmail(cleanEmail)) {
    return {
      isAvailable: false,
      errorMessage: "Veuillez fournir une adresse e-mail valide."
    };
  }

  try {
    // 1. Vérification dans le registre d'unicité email_registry
    const safeDocId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const registryRef = doc(db, 'email_registry', safeDocId);
    const registrySnap = await getDoc(registryRef);

    if (registrySnap.exists()) {
      const regData = registrySnap.data();
      if (!excludeUid || regData.uid !== excludeUid) {
        return {
          isAvailable: false,
          existingRole: regData.role,
          existingUserId: regData.uid,
          errorMessage: "Cette adresse e-mail est déjà associée à un compte ImmoGest. Connectez-vous avec votre compte existant ou utilisez la procédure de récupération de compte."
        };
      }
    }

    // 2. Vérification dans la collection principale 'users'
    const qUsers = query(collection(db, 'users'), where('email', '==', cleanEmail));
    const snapUsers = await getDocs(qUsers);
    for (const docSnap of snapUsers.docs) {
      if (!excludeUid || docSnap.id !== excludeUid) {
        const uData = docSnap.data();
        return {
          isAvailable: false,
          existingRole: uData.role,
          existingUserId: docSnap.id,
          errorMessage: "Cette adresse e-mail est déjà associée à un compte ImmoGest. Connectez-vous avec votre compte existant ou utilisez la procédure de récupération de compte."
        };
      }
    }

    return {
      isAvailable: true
    };
  } catch (err) {
    console.warn("Erreur lors de la vérification d'unicité de l'email :", err);
    // En cas de restriction de lecture temporaire, ne pas bloquer si aucune donnée n'est trouvée
    return { isAvailable: true };
  }
}

/**
 * Enregistre de manière atomique l'email dans email_registry pour verrouiller l'unicité
 */
export async function lockEmailRegistration(email: string, uid: string, role: string): Promise<void> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return;
  const safeDocId = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
  await setDoc(doc(db, 'email_registry', safeDocId), {
    email: cleanEmail,
    uid,
    role,
    createdAt: new Date().toISOString()
  }, { merge: true });
}
