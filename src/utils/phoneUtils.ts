/**
 * Utility functions for DRC Kinshasa phone formatting, WhatsApp link generation,
 * Gmail direct compose, and Kinshasa municipal references.
 */

export const KINSHASA_COMMUNES = [
  'Gombe',
  'Ngaliema',
  'Limete',
  'Kasa-Vubu',
  'Lingwala',
  'Bandalungwa',
  'Kintambo',
  'Barumbu',
  'Kinshasa',
  'Mont-Ngafula',
  'Lemba',
  'Matete',
  'Kalamu',
  'Ngaba',
  'Ndjili',
  'Masina',
  'Kimbanseke',
  'Nsele',
  'Maluku',
  'Makala',
  'Bumbu',
  'Selembao',
  'Kisenso',
  'Autre commune RDC'
];

/**
 * Format phone numbers for WhatsApp API.
 * In DRC (Kinshasa), numbers are often entered as:
 * 0812345678, 089..., 099..., +24381..., 24381...
 * WhatsApp API requires international format without leading zero or + sign: 243812345678.
 */
export function formatDRCWhatsAppPhone(rawPhone: string): string {
  if (!rawPhone) return '';
  let digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';

  // Starts with 00243 -> 243
  if (digits.startsWith('00243')) {
    digits = digits.substring(2);
  }
  // Starts with 243 (DRC international code)
  else if (digits.startsWith('243')) {
    // Already has 243
    return digits;
  }
  // Starts with 0 and length >= 9 (e.g. 0812345678 -> 243812345678)
  else if (digits.startsWith('0') && digits.length >= 9) {
    digits = '243' + digits.substring(1);
  }
  // 9 digits without leading 0 (e.g. 812345678 -> 243812345678)
  else if (digits.length === 9) {
    digits = '243' + digits;
  }

  return digits;
}

/**
 * Format phone for human readable display: +243 81 234 5678
 */
export function formatDRCPhone(phone: string): string {
  if (!phone) return '';
  const clean = formatDRCWhatsAppPhone(phone);
  if (clean.startsWith('243') && clean.length === 12) {
    return `+243 ${clean.slice(3, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`;
  }
  return phone;
}

/**
 * Generate a universally compatible WhatsApp send URL.
 * Works on mobile (opens WhatsApp app directly) and desktop.
 */
export function getWhatsAppShareUrl(phone: string, message: string): string {
  const cleanPhone = formatDRCWhatsAppPhone(phone);
  const encoded = encodeURIComponent(message);
  if (cleanPhone) {
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?text=${encoded}`;
}

/**
 * Generate direct Gmail Web compose URL with pre-filled recipient, subject, and body.
 */
export function getGmailComposeUrl(email: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email || '')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Generate mailto standard URL for default OS email client.
 */
export function getMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
