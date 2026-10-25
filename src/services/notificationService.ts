import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  limit 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'whatsapp';

export type NotificationEvent = 
  | 'rent_reminder'
  | 'payment_confirmed'
  | 'payment_late'
  | 'contract_expiring'
  | 'account_invitation'
  | 'new_maintenance'
  | 'tech_assigned'
  | 'tech_status_change'
  | 'tenant_announcement'
  | 'monthly_report';

export interface NotificationPayload {
  landlordId: string;
  recipientId: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channels: NotificationChannel[];
  event: NotificationEvent;
  title: string;
  message: string;
  data?: Record<string, any>;
  idempotencySuffix?: string; // Optional custom deduplication key
}

export interface NotificationLog {
  id: string;
  landlordId: string;
  recipientId: string;
  recipientName: string;
  recipientContact: string;
  channel: NotificationChannel;
  event: NotificationEvent;
  idempotencyKey: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  title: string;
  message: string;
  errorDetails?: string;
  retryCount: number;
  lastRetryAt?: string;
  createdAt: string;
  deliveredAt?: string;
}

export interface UserNotificationPreferences {
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  subscribedEvents: string[];
}

export const DEFAULT_TEMPLATES: Record<NotificationEvent, { title: string; body: string; channels: NotificationChannel[] }> = {
  rent_reminder: {
    title: 'Rappel d\'échéance de loyer',
    body: 'Bonjour {destinataire}, votre loyer de {montant} $ pour le logement {logement} arrive à échéance le {date_echeance}. Vous pouvez régler en ligne directement depuis votre espace locataire : {lien}.',
    channels: ['in_app', 'whatsapp', 'sms']
  },
  payment_confirmed: {
    title: 'Paiement confirmé - Quittance disponible',
    body: 'Bonjour {destinataire}, votre paiement de {montant} $ pour {type_frais} a été validé. Votre quittance officielle est téléchargeable dans votre espace.',
    channels: ['in_app', 'whatsapp', 'email']
  },
  payment_late: {
    title: 'Avis de retard de paiement de loyer',
    body: 'Bonjour {destinataire}, sauf erreur de notre part, votre loyer de {montant} $ accuse un retard de {jours_retard} jour(s). Merci de régulariser la situation dans les meilleurs délais.',
    channels: ['in_app', 'whatsapp', 'sms', 'email']
  },
  contract_expiring: {
    title: 'Contrat de bail arrivant à expiration',
    body: 'Bonjour {destinataire}, votre contrat de bail pour {logement} arrive à échéance le {date_fin}. Veuillez contacter votre gestionnaire pour les modalités de renouvellement.',
    channels: ['in_app', 'email']
  },
  account_invitation: {
    title: 'Invitation à rejoindre votre portail ImmoGest',
    body: 'Bonjour {destinataire}, votre espace personnel sécurisé ImmoGest est prêt. Accédez à vos quittances, contrats et paiements en cliquant ici : {lien}.',
    channels: ['whatsapp', 'sms', 'email']
  },
  new_maintenance: {
    title: 'Nouveau signalement de réparation',
    body: 'Un nouvel incident ({categorie}) a été signalé pour le logement {logement} par {locataire} : "{description}".',
    channels: ['in_app', 'email']
  },
  tech_assigned: {
    title: 'Technicien assigné à votre réparation',
    body: 'Bonjour {destinataire}, l\'intervention #{ticket} a été attribuée au technicien {technicien} ({telephone_tech}). Date prévue : {date_prevue}.',
    channels: ['in_app', 'whatsapp']
  },
  tech_status_change: {
    title: 'Mise à jour d\'intervention technique',
    body: 'L\'intervention #{ticket} pour {logement} est passée au statut : {statut}. Diagnostic : {notes}.',
    channels: ['in_app', 'whatsapp']
  },
  tenant_announcement: {
    title: 'Note d\'information importante de la gestion',
    body: 'Chers locataires de {immeuble}, {message_annonce}. La direction reste à votre écoute pour toute précision.',
    channels: ['in_app', 'whatsapp', 'email']
  },
  monthly_report: {
    title: 'Rapport mensuel de gestion disponible',
    body: 'Le rapport financier et locatif consolidé pour le mois de {mois} est disponible en téléchargement dans votre tableau de bord.',
    channels: ['in_app', 'email']
  }
};

/**
 * Generate secure idempotent key to prevent duplicate notifications
 */
export function generateIdempotencyKey(
  event: NotificationEvent,
  recipientId: string,
  channel: NotificationChannel,
  suffix?: string
): string {
  const dateKey = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
  const baseSuffix = suffix || dateKey;
  return `notif_${event}_${recipientId}_${channel}_${baseSuffix}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Replace placeholders in template text with safe provided values
 */
export function renderTemplate(template: string, vars: Record<string, any>): string {
  let output = template;
  for (const [key, val] of Object.entries(vars)) {
    const regex = new RegExp(`{${key}}`, 'g');
    output = output.replace(regex, String(val ?? ''));
  }
  return output;
}

/**
 * Retrieve user communication preferences
 */
export async function getUserPreferences(userId: string): Promise<UserNotificationPreferences> {
  try {
    const q = query(collection(db, 'notification_preferences'), where('userId', '==', userId), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      return {
        userId,
        inAppEnabled: data.inAppEnabled ?? true,
        emailEnabled: data.emailEnabled ?? true,
        smsEnabled: data.smsEnabled ?? true,
        whatsappEnabled: data.whatsappEnabled ?? true,
        subscribedEvents: data.subscribedEvents ?? Object.keys(DEFAULT_TEMPLATES)
      };
    }
  } catch (err) {
    console.warn("Could not fetch user preferences, using defaults", err);
  }

  return {
    userId,
    inAppEnabled: true,
    emailEnabled: true,
    smsEnabled: true,
    whatsappEnabled: true,
    subscribedEvents: Object.keys(DEFAULT_TEMPLATES)
  };
}

/**
 * Check if a notification has already been sent using its idempotency key
 */
export async function checkIdempotency(idempotencyKey: string): Promise<boolean> {
  try {
    const q = query(
      collection(db, 'notification_logs'),
      where('idempotencyKey', '==', idempotencyKey),
      limit(1)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (err) {
    console.error("Idempotency check error:", err);
    return false; // Proceed safely
  }
}

/**
 * Multi-channel dispatch engine with idempotency and retry logs
 */
export async function sendAutomatedNotification(payload: NotificationPayload): Promise<{
  success: boolean;
  dispatchedChannels: NotificationChannel[];
  skippedChannels: NotificationChannel[];
  errors: string[];
}> {
  const {
    landlordId,
    recipientId,
    recipientName,
    recipientEmail,
    recipientPhone,
    channels,
    event,
    title,
    message,
    idempotencySuffix
  } = payload;

  const prefs = await getUserPreferences(recipientId);
  const dispatchedChannels: NotificationChannel[] = [];
  const skippedChannels: NotificationChannel[] = [];
  const errors: string[] = [];

  // Check if event is subscribed
  if (prefs.subscribedEvents && !prefs.subscribedEvents.includes(event)) {
    return {
      success: true,
      dispatchedChannels: [],
      skippedChannels: channels,
      errors: ['Destinataire désabonné de cet événement.']
    };
  }

  for (const channel of channels) {
    // 1. Check channel preference
    if (channel === 'in_app' && !prefs.inAppEnabled) {
      skippedChannels.push(channel);
      continue;
    }
    if (channel === 'email' && (!prefs.emailEnabled || !recipientEmail)) {
      skippedChannels.push(channel);
      continue;
    }
    if (channel === 'sms' && (!prefs.smsEnabled || !recipientPhone)) {
      skippedChannels.push(channel);
      continue;
    }
    if (channel === 'whatsapp' && (!prefs.whatsappEnabled || !recipientPhone)) {
      skippedChannels.push(channel);
      continue;
    }

    // 2. Anti-duplicate verification via idempotency key
    const idempotencyKey = generateIdempotencyKey(event, recipientId, channel, idempotencySuffix);
    const alreadySent = await checkIdempotency(idempotencyKey);
    if (alreadySent) {
      skippedChannels.push(channel);
      continue;
    }

    const contactTarget = channel === 'email' ? (recipientEmail || '') : (recipientPhone || '');

    // 3. Dispatch according to channel
    try {
      if (channel === 'in_app') {
        // Store in the notifications collection for UI rendering
        await addDoc(collection(db, 'notifications'), {
          userId: recipientId,
          tenantId: recipientId,
          landlordId,
          title,
          message,
          type: event.includes('payment') ? 'payment' : event.includes('maintenance') ? 'maintenance' : event.includes('contract') ? 'contract' : 'system',
          isRead: false,
          isArchived: false,
          createdAt: new Date().toISOString()
        });
      }

      // 4. Log the dispatch in notification_logs
      const now = new Date().toISOString();
      await addDoc(collection(db, 'notification_logs'), {
        landlordId,
        recipientId,
        recipientName,
        recipientContact: contactTarget,
        channel,
        event,
        idempotencyKey,
        status: 'delivered', // in_app and direct simulated providers confirm immediate delivery
        title,
        message,
        retryCount: 0,
        createdAt: now,
        deliveredAt: now
      });

      dispatchedChannels.push(channel);
    } catch (err: any) {
      console.error(`Failed to dispatch ${channel} for ${recipientName}:`, err);
      errors.push(`${channel}: ${err.message || 'Erreur d\'envoi'}`);

      // Log failure with retry capability
      try {
        await addDoc(collection(db, 'notification_logs'), {
          landlordId,
          recipientId,
          recipientName,
          recipientContact: contactTarget,
          channel,
          event,
          idempotencyKey,
          status: 'failed',
          title,
          message,
          errorDetails: String(err.message || err),
          retryCount: 0,
          createdAt: new Date().toISOString()
        });
      } catch (logErr) {
        console.error("Failed to write failure log:", logErr);
      }
    }
  }

  return {
    success: errors.length === 0,
    dispatchedChannels,
    skippedChannels,
    errors
  };
}

/**
 * Retry a failed notification from log
 */
export async function retryNotificationLog(log: NotificationLog): Promise<boolean> {
  try {
    const logRef = doc(db, 'notification_logs', log.id);
    const now = new Date().toISOString();

    if (log.channel === 'in_app') {
      await addDoc(collection(db, 'notifications'), {
        userId: log.recipientId,
        tenantId: log.recipientId,
        landlordId: log.landlordId,
        title: log.title,
        message: log.message,
        type: 'system',
        isRead: false,
        isArchived: false,
        createdAt: now
      });
    }

    await updateDoc(logRef, {
      status: 'delivered',
      retryCount: (log.retryCount || 0) + 1,
      lastRetryAt: now,
      deliveredAt: now,
      errorDetails: ''
    });

    toast.success(`Notification ${log.channel.toUpperCase()} réexpédiée avec succès.`);
    return true;
  } catch (err: any) {
    console.error("Retry notification error:", err);
    toast.error("Échec de la relance : " + (err.message || 'Erreur réseau'));
    return false;
  }
}

/**
 * Open official WhatsApp Business Click-To-Chat with encoded text
 */
export function openWhatsAppChat(phone: string, message: string) {
  // Strip non digits except leading +
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Open default SMS Client with phone and encoded body
 */
export function openSMSClient(phone: string, message: string) {
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  window.open(`sms:${cleanPhone}?body=${encodeURIComponent(message)}`, '_self');
}

/**
 * Open default Email Client
 */
export function openEmailClient(email: string, subject: string, body: string) {
  window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self');
}
