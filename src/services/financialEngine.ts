/**
 * ImmoGest Financial Engine
 * Rigorous financial management:
 * - Solde calculation per tenant (rent expected vs validated payments)
 * - Separation of guarantee deposits (cautions) from operational rental revenue
 * - Traceable adjustments & counter-entries (contre-passation) - never delete validated records
 * - Multi-currency support (USD / CDF) with explicit recorded exchange rates
 * - Duplicate payment detection
 * - Mobile Money provider support (M-Pesa, Orange Money, Airtel Money)
 */

import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { differenceInMonths } from 'date-fns';

export interface CurrencyConfig {
  code: 'USD' | 'CDF';
  symbol: string;
  defaultRateUSDToCDF: number; // e.g., 2850 CDF per 1 USD
}

export const DEFAULT_CURRENCY_CONFIG: CurrencyConfig = {
  code: 'USD',
  symbol: '$',
  defaultRateUSDToCDF: 2850
};

export type PaymentStatus = 'Confirmé' | 'En attente' | 'Contesté' | 'Échoué' | 'Annulé';

export type PaymentTypeCategory = 'Loyer' | 'Garantie' | 'Avance' | 'Charges' | 'Autre';

export interface PaymentRecord {
  id: string;
  landlordId: string;
  tenantId: string;
  amount: number;
  currency: 'USD' | 'CDF';
  exchangeRate: number; // Rate used at payment date
  amountUSD: number; // Normalized to USD for unified analytics
  amountCDF?: number;
  date: string; // ISO
  method: 'Cash' | 'Mobile Money' | 'Banque' | 'Déduction Garantie';
  mobileMoneyProvider?: 'M-Pesa' | 'Orange Money' | 'Airtel Money' | 'Autre';
  transactionRef?: string;
  type: string;
  paymentTypeCategory?: PaymentTypeCategory;
  notes?: string;
  proofUrl?: string;
  receiptNumber?: string;
  status: PaymentStatus;
  monthKey?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  isAdjustment?: boolean;
  parentPaymentId?: string;
  cancellationReason?: string;
  reconciled?: boolean;
  reconciledAt?: string;
  reconciliationNotes?: string;
  createdAt: string;
}

/**
 * Calculates tenant financial statement:
 * - Expected Rent from entryDate or contract
 * - Validated Rent payments (Confirmé only)
 * - Pending payments (En attente)
 * - Separate Guarantee account (Caution)
 * - Net Balance (positive = unpaid arrears, negative = advance credit)
 */
export function calculateTenantFinancials(
  tenant: any,
  payments: PaymentRecord[],
  currentExchangeRate: number = DEFAULT_CURRENCY_CONFIG.defaultRateUSDToCDF
) {
  const entryDate = new Date(tenant.entryDate || tenant.createdAt || new Date());
  const now = new Date();

  // Number of months active
  let monthsElapsed = differenceInMonths(now, entryDate) + 1;
  if (monthsElapsed < 1) monthsElapsed = 1;

  const monthlyRentUSD = Number(tenant.monthlyRent || 0);
  const totalRentExpectedUSD = monthsElapsed * monthlyRentUSD;

  // Filter payments for this tenant
  const tenantPayments = payments.filter(p => p.tenantId === tenant.id);

  // Validated payments: status === 'Confirmé' or unspecified (legacy payments defaulted to confirmed)
  const isValidated = (p: PaymentRecord) => !p.status || p.status === 'Confirmé';

  // Exclude adjustments that are purely informational if any, but add signed amounts
  let totalRentPaidUSD = 0;
  let totalRentPendingUSD = 0;
  let totalCautionCollectedUSD = 0;
  let totalAdvancesUSD = 0;

  tenantPayments.forEach(p => {
    // Normalization to USD
    const amtUSD = p.amountUSD ?? (p.currency === 'CDF' && p.exchangeRate ? p.amount / p.exchangeRate : p.amount);

    const isRentType = p.type === 'Loyer' || p.paymentTypeCategory === 'Loyer';
    const isCautionType = p.type === 'Garantie' || p.paymentTypeCategory === 'Garantie';
    const isAdvanceType = p.type === 'Avance' || p.paymentTypeCategory === 'Avance';

    if (isValidated(p)) {
      if (isRentType) {
        totalRentPaidUSD += amtUSD;
      } else if (isCautionType) {
        totalCautionCollectedUSD += amtUSD;
      } else if (isAdvanceType) {
        totalAdvancesUSD += amtUSD;
      }
    } else if (p.status === 'En attente') {
      if (isRentType) totalRentPendingUSD += amtUSD;
    }
  });

  // Net rental balance (excluding guarantee deposits which are held in escrow/caution)
  // Total Rent Paid + Advances applied to rent
  const totalCreditUSD = totalRentPaidUSD + totalAdvancesUSD;
  const netRentBalanceUSD = totalRentExpectedUSD - totalCreditUSD;
  const unpaidMonths = monthlyRentUSD > 0 ? (netRentBalanceUSD / monthlyRentUSD) : 0;

  // Guarantee balance
  const guaranteeRequiredUSD = Number(tenant.guaranteeAmount || (monthlyRentUSD * 3));
  const guaranteeRemainingUSD = Math.max(0, guaranteeRequiredUSD - totalCautionCollectedUSD);

  return {
    monthsElapsed,
    monthlyRentUSD,
    totalRentExpectedUSD,
    totalRentPaidUSD,
    totalRentPendingUSD,
    totalAdvancesUSD,
    netRentBalanceUSD: Math.round(netRentBalanceUSD * 100) / 100,
    netRentBalanceCDF: Math.round(netRentBalanceUSD * currentExchangeRate),
    unpaidMonths: Math.max(0, Math.round(unpaidMonths * 10) / 10),
    isUpToDate: netRentBalanceUSD <= 0,
    hasCredit: netRentBalanceUSD < 0,
    creditAmountUSD: netRentBalanceUSD < 0 ? Math.abs(netRentBalanceUSD) : 0,
    guaranteeRequiredUSD,
    totalCautionCollectedUSD,
    guaranteeRemainingUSD,
    guaranteeStatus: totalCautionCollectedUSD >= guaranteeRequiredUSD ? 'Payée' : (totalCautionCollectedUSD > 0 ? 'Partielle' : 'Non payée')
  };
}

/**
 * Duplicate payment detector:
 * Detects if a payment might be a duplicate based on tenant, amount, and close date proximity (+/- 4 days).
 */
export function findPotentialDuplicates(payments: PaymentRecord[]): Map<string, PaymentRecord[]> {
  const duplicatesMap = new Map<string, PaymentRecord[]>();

  for (let i = 0; i < payments.length; i++) {
    const p1 = payments[i];
    if (p1.isAdjustment || p1.status === 'Annulé' || p1.status === 'Échoué') continue;

    const matches: PaymentRecord[] = [];
    const date1 = new Date(p1.date).getTime();

    for (let j = 0; j < payments.length; j++) {
      if (i === j) continue;
      const p2 = payments[j];
      if (p2.isAdjustment || p2.status === 'Annulé' || p2.status === 'Échoué') continue;

      if (p1.tenantId === p2.tenantId && p1.type === p2.type) {
        const amt1 = p1.amountUSD || p1.amount;
        const amt2 = p2.amountUSD || p2.amount;
        const sameAmount = Math.abs(amt1 - amt2) < 0.01;

        const date2 = new Date(p2.date).getTime();
        const diffDays = Math.abs(date1 - date2) / (1000 * 60 * 60 * 24);

        if (sameAmount && diffDays <= 4) {
          matches.push(p2);
        }
      }
    }

    if (matches.length > 0) {
      duplicatesMap.set(p1.id, [p1, ...matches]);
    }
  }

  return duplicatesMap;
}

/**
 * Creates a counter-entry adjustment (contre-passation) to correct or cancel a payment.
 * Strict accounting rule: NEVER delete a validated transaction. Instead, append an offsetting adjustment.
 */
export async function createPaymentAdjustment(
  parentPayment: PaymentRecord,
  cancellationReason: string,
  currentUserId: string
) {
  const now = new Date().toISOString();

  // Create offsetting transaction with negative amount
  const adjustmentData = {
    landlordId: parentPayment.landlordId,
    tenantId: parentPayment.tenantId,
    amount: -Math.abs(parentPayment.amount),
    currency: parentPayment.currency || 'USD',
    exchangeRate: parentPayment.exchangeRate || DEFAULT_CURRENCY_CONFIG.defaultRateUSDToCDF,
    amountUSD: -Math.abs(parentPayment.amountUSD || parentPayment.amount),
    amountCDF: parentPayment.amountCDF ? -Math.abs(parentPayment.amountCDF) : undefined,
    date: now,
    method: parentPayment.method,
    type: parentPayment.type,
    notes: `[Contre-passation / Redressement] Annulation de la transaction ${parentPayment.receiptNumber || parentPayment.id.slice(0, 6)}: ${cancellationReason}`,
    status: 'Confirmé' as PaymentStatus,
    isAdjustment: true,
    parentPaymentId: parentPayment.id,
    cancellationReason,
    confirmedAt: now,
    confirmedBy: currentUserId,
    createdAt: now
  };

  // Add the adjustment record
  const adjustmentRef = await addDoc(collection(db, 'payments'), adjustmentData);

  // Update parent payment status to 'Annulé' with traceable reason
  const parentRef = doc(db, 'payments', parentPayment.id);
  await updateDoc(parentRef, {
    status: 'Annulé',
    cancellationReason: `Annulé par contre-passation ${adjustmentRef.id} le ${new Date().toLocaleDateString('fr-FR')}: ${cancellationReason}`,
    confirmedBy: currentUserId
  });

  return adjustmentRef.id;
}

/**
 * Generates an official, verifiable receipt number
 */
export function generateReceiptNumber(paymentId: string, prefix: string = 'REC'): string {
  const cleanId = (paymentId || Math.random().toString(36).substring(2, 8)).substring(0, 6).toUpperCase();
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${cleanId}`;
}
