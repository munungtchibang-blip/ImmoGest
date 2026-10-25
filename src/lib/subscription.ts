import { doc, updateDoc, collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from './firebase';

export type CurrencyType = 'USD' | 'CDF';

export interface SubscriptionTier {
  id: 'starter' | 'standard' | 'pro' | 'vip';
  name: string;
  tagline: string;
  amountUSD: number;
  amountCDF: number;
  badge?: string;
  isPopular?: boolean;
  maxTenants: number;
  maxProperties: number;
  features: string[];
}

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: 'starter',
    name: 'Débutant',
    tagline: 'Pour débuter avec 1 seul locataire',
    amountUSD: 5,
    amountCDF: 14000,
    maxTenants: 1,
    maxProperties: 1,
    features: [
      '1 locataire maximum',
      '1 bien immobilier maximum',
      'Enregistrement des loyers',
      'Portail locataire avec quittance PDF'
    ]
  },
  {
    id: 'standard',
    name: 'Standard',
    tagline: 'Idéal pour petits bailleurs',
    amountUSD: 15,
    amountCDF: 42000,
    maxTenants: 2,
    maxProperties: 2,
    features: [
      'Jusqu\'à 2 locataires',
      'Jusqu\'à 2 biens immobiliers',
      'Suivi des retards et impayés',
      'Gestion basique des incidents'
    ]
  },
  {
    id: 'pro',
    name: 'Professionnel (Recommandé)',
    tagline: 'Pour bailleurs exigeants & multi-locataires',
    amountUSD: 29,
    amountCDF: 81000,
    badge: 'Recommandé',
    isPopular: true,
    maxTenants: 9999,
    maxProperties: 9999,
    features: [
      'Locataires & Biens illimités',
      'Gestion complète des dépenses & charges',
      'Contrats de bail conformes avec signature PDF',
      'Envoi automatique WhatsApp & Email',
      'Preuves de paiement & validation en 1 clic',
      'Rapports financiers et export comptable'
    ]
  },
  {
    id: 'vip',
    name: 'VIP Entreprise',
    tagline: 'Pour agences & grands patrimoines',
    amountUSD: 49,
    amountCDF: 137000,
    badge: 'Premium',
    maxTenants: 9999,
    maxProperties: 9999,
    features: [
      'Tout le forfait Pro illimité',
      'Support prioritaire 24h/7j par téléphone',
      'Accès multi-utilisateurs et gestionnaires',
      'Personnalisation complète aux couleurs de votre agence'
    ]
  }
];

export interface UserSubscriptionState {
  tierId: 'starter' | 'standard' | 'pro' | 'vip';
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  currency: CurrencyType;
  monthlyAmount: number;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  isTrial: boolean;
  isExpired: boolean;
  isCancelled: boolean;
  cancelledAt?: string;
  lastPaymentDate?: string;
  lastPaymentMethod?: string;
  lastPaymentRef?: string;
}

export const defaultSubscription: UserSubscriptionState = {
  tierId: 'starter',
  status: 'trial',
  currency: 'USD',
  monthlyAmount: 5,
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  daysRemaining: 14,
  isTrial: true,
  isExpired: false,
  isCancelled: false
};

/**
 * Compute subscription state from Firestore user document
 */
export function computeSubscriptionState(userData: any): UserSubscriptionState {
  if (!userData) return defaultSubscription;

  const now = new Date();
  const sub = userData.subscription || {};
  const tierId: 'starter' | 'standard' | 'pro' | 'vip' = sub.tierId || 'starter';
  const tier = SUBSCRIPTION_TIERS.find(t => t.id === tierId) || SUBSCRIPTION_TIERS[0];
  const currency: CurrencyType = sub.currency || 'USD';
  const monthlyAmount = currency === 'USD' ? tier.amountUSD : tier.amountCDF;

  const startDateStr = sub.startDate || userData.createdAt || now.toISOString();
  // Default trial: 14 days from creation
  const trialEnd = new Date(new Date(startDateStr).getTime() + 14 * 24 * 60 * 60 * 1000);
  const paidEnd = sub.endDate ? new Date(sub.endDate) : trialEnd;

  const isCancelled = sub.status === 'cancelled';
  const isPaidActive = sub.status === 'active' && paidEnd.getTime() > now.getTime();
  const isTrial = !isPaidActive && !isCancelled && now.getTime() <= trialEnd.getTime();
  const isExpired = !isPaidActive && now.getTime() > (isTrial ? trialEnd.getTime() : paidEnd.getTime());

  const targetEndDate = isPaidActive ? paidEnd : trialEnd;
  const diffMs = targetEndDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return {
    tierId,
    status: isCancelled ? 'cancelled' : isPaidActive ? 'active' : isTrial ? 'trial' : 'expired',
    currency,
    monthlyAmount,
    startDate: startDateStr,
    endDate: targetEndDate.toISOString(),
    daysRemaining,
    isTrial,
    isExpired,
    isCancelled,
    cancelledAt: sub.cancelledAt,
    lastPaymentDate: sub.lastPaymentDate,
    lastPaymentMethod: sub.lastPaymentMethod,
    lastPaymentRef: sub.lastPaymentRef
  };
}

/**
 * Strict rule checker:
 * - If user has 2 or more tenants registered and 1 property, Pro is mandatory!
 * - Expenses management requires Pro.
 */
export function checkProRequirement(
  subscription: UserSubscriptionState,
  tenantsCount: number,
  propertiesCount: number
): { isBlocked: boolean; message?: string } {
  // If user is already on Pro or VIP, they are never blocked
  if (subscription.tierId === 'pro' || subscription.tierId === 'vip') {
    return { isBlocked: false };
  }

  // Threshold: 2 or more tenants registered, or 1 property + 2 tenants
  if (tenantsCount >= 2) {
    return {
      isBlocked: true,
      message: `Vous avez ${tenantsCount} locataires enregistrés. L'abonnement Professionnel (29 $/mois) est requis pour gérer 2 locataires ou plus.`
    };
  }

  if (propertiesCount >= 2 && subscription.tierId === 'starter') {
    return {
      isBlocked: true,
      message: `Vous avez ${propertiesCount} biens enregistrés. Passez à l'abonnement Standard ou Professionnel pour débloquer la gestion multi-biens.`
    };
  }

  return { isBlocked: false };
}

/**
 * Feature gate check for specific actions
 */
export function checkFeatureAccess(
  subscription: UserSubscriptionState,
  feature: 'expenses' | 'contracts' | 'reports' | 'tenants_add',
  tenantsCount?: number
): { allowed: boolean; message?: string; recommendedTier: 'pro' | 'standard' } {
  // If subscription is expired
  if (subscription.isExpired) {
    return {
      allowed: false,
      message: "Votre abonnement mensuel est arrivé à échéance. Veuillez le renouveler pour continuer.",
      recommendedTier: 'pro'
    };
  }

  if (feature === 'expenses') {
    // Recording expenses requires Pro
    if (subscription.tierId !== 'pro' && subscription.tierId !== 'vip') {
      return {
        allowed: false,
        message: "L'enregistrement des dépenses et charges immobilières est réservé à l'abonnement Professionnel.",
        recommendedTier: 'pro'
      };
    }
  }

  if (feature === 'contracts') {
    if (subscription.tierId !== 'pro' && subscription.tierId !== 'vip') {
      return {
        allowed: false,
        message: "La rédaction et génération de contrats de bail est réservée à l'abonnement Professionnel.",
        recommendedTier: 'pro'
      };
    }
  }

  if (feature === 'tenants_add' && tenantsCount !== undefined) {
    if (tenantsCount >= 2 && subscription.tierId !== 'pro' && subscription.tierId !== 'vip') {
      return {
        allowed: false,
        message: "Vous avez atteint la limite de 2 locataires. L'abonnement Professionnel est requis pour ajouter d'autres locataires.",
        recommendedTier: 'pro'
      };
    }
  }

  return { allowed: true, recommendedTier: 'pro' };
}

/**
 * Strict Visa card validator
 * Requirement: Only VISA is allowed! Must start with 4 and be 16 digits.
 */
export function validateVisaCard(cardNumber: string): { isValid: boolean; error?: string } {
  const clean = cardNumber.replace(/\s+/g, '');
  if (!clean) {
    return { isValid: false, error: "Veuillez saisir votre numéro de carte VISA." };
  }
  if (!/^4[0-9]{15}$/.test(clean)) {
    return {
      isValid: false,
      error: "Seules les cartes bancaires VISA sont autorisées (commençant par le chiffre 4 et comprenant 16 chiffres). Les autres cartes et comptes bancaires non-Visa sont refusés."
    };
  }
  return { isValid: true };
}

/**
 * Mobile Money phone validation for DRC (Vodacom, Airtel, Orange, Africell)
 */
export function validateMobileMoneyPhone(phone: string): { isValid: boolean; error?: string } {
  const clean = phone.replace(/[\s\-().]/g, '');
  if (!clean) {
    return { isValid: false, error: "Veuillez saisir votre numéro Mobile Money." };
  }
  // DRC format: starts with 08, 09, +2438, +2439, 2438, 2439
  const match = clean.match(/^(?:\+243|243|0)?([89][0-9]{8})$/);
  if (!match) {
    return {
      isValid: false,
      error: "Numéro de téléphone invalide. Veuillez entrer un numéro valide (ex: 0812345678 ou 0991234567)."
    };
  }
  return { isValid: true };
}

/**
 * Record monthly subscription payment and simulate real balance debit
 */
export async function executeSubscriptionPayment(params: {
  tierId: 'starter' | 'standard' | 'pro' | 'vip';
  currency: CurrencyType;
  method: 'M-Pesa' | 'Orange Money' | 'Airtel Money' | 'Afrimoney' | 'Carte VISA';
  phoneNumber?: string;
  visaCardNumber?: string;
  visaExpiry?: string;
  visaCvv?: string;
}): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  if (!auth.currentUser) {
    return { success: false, error: "Utilisateur non connecté." };
  }

  const tier = SUBSCRIPTION_TIERS.find(t => t.id === params.tierId);
  if (!tier) {
    return { success: false, error: "Forfait d'abonnement invalide." };
  }

  // Pre-set exact amounts ONLY:
  const amount = params.currency === 'USD' ? tier.amountUSD : tier.amountCDF;

  // Strict Validation:
  if (params.method === 'Carte VISA') {
    const cardVal = validateVisaCard(params.visaCardNumber || '');
    if (!cardVal.isValid) {
      return { success: false, error: cardVal.error };
    }
    if (!params.visaExpiry || !/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(params.visaExpiry)) {
      return { success: false, error: "Date d'expiration invalide (MM/AA)." };
    }
    if (!params.visaCvv || !/^[0-9]{3}$/.test(params.visaCvv)) {
      return { success: false, error: "Code de sécurité CVV invalide (3 chiffres au dos de la carte VISA)." };
    }
  } else {
    const phoneVal = validateMobileMoneyPhone(params.phoneNumber || '');
    if (!phoneVal.isValid) {
      return { success: false, error: phoneVal.error };
    }
  }

  const uid = auth.currentUser.uid;
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const txRef = 'SUB-' + Math.random().toString(36).substring(2, 9).toUpperCase();

  const invoiceData = {
    userId: uid,
    userEmail: auth.currentUser.email || '',
    tierId: tier.id,
    tierName: tier.name,
    amount,
    currency: params.currency,
    method: params.method,
    txRef,
    accountMasked: params.method === 'Carte VISA' 
      ? `VISA **** ${(params.visaCardNumber || '').replace(/\s+/g, '').slice(-4)}`
      : `${params.method} ${params.phoneNumber}`,
    status: 'Payé',
    paymentDate: now.toISOString(),
    validUntil: nextMonth.toISOString(),
    createdAt: now.toISOString()
  };

  try {
    const invRef = await addDoc(collection(db, 'subscription_invoices'), invoiceData);

    // Update user document
    await updateDoc(doc(db, 'users', uid), {
      subscription: {
        tierId: tier.id,
        status: 'active',
        currency: params.currency,
        monthlyAmount: amount,
        startDate: now.toISOString(),
        endDate: nextMonth.toISOString(),
        lastPaymentDate: now.toISOString(),
        lastPaymentMethod: params.method,
        lastPaymentRef: txRef,
        updatedAt: now.toISOString()
      }
    });

    return { success: true, invoiceId: invRef.id };
  } catch (err: any) {
    console.error("Subscription payment error:", err);
    return { success: false, error: "Erreur lors du traitement du prélèvement. Veuillez réessayer." };
  }
}

/**
 * Cancel user subscription
 */
export async function cancelUserSubscription(): Promise<{ success: boolean; error?: string }> {
  if (!auth.currentUser) return { success: false, error: "Non connecté." };
  const uid = auth.currentUser.uid;
  try {
    await updateDoc(doc(db, 'users', uid), {
      'subscription.status': 'cancelled',
      'subscription.cancelledAt': new Date().toISOString()
    });
    return { success: true };
  } catch (err: any) {
    console.error("Error cancelling subscription:", err);
    return { success: false, error: "Impossible d'annuler l'abonnement." };
  }
}

/**
 * Change tier without immediate payment if in trial or switching
 */
export async function changeUserSubscriptionTier(
  tierId: 'starter' | 'standard' | 'pro' | 'vip',
  currency: CurrencyType
): Promise<{ success: boolean; error?: string }> {
  if (!auth.currentUser) return { success: false, error: "Non connecté." };
  const uid = auth.currentUser.uid;
  try {
    await updateDoc(doc(db, 'users', uid), {
      'subscription.tierId': tierId,
      'subscription.currency': currency,
      'subscription.updatedAt': new Date().toISOString()
    });
    return { success: true };
  } catch (err: any) {
    console.error("Error changing tier:", err);
    return { success: false, error: "Impossible de changer d'abonnement." };
  }
}

/**
 * Fetch past invoices
 */
export async function getSubscriptionInvoices(): Promise<any[]> {
  if (!auth.currentUser) return [];
  try {
    const q = query(
      collection(db, 'subscription_invoices'),
      where('userId', '==', auth.currentUser.uid)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}
