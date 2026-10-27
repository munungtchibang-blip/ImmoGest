/**
 * ImmoGest Termination & Notice Engine (Gestion des Préavis & Résiliations)
 * Conforme aux exigences contractuelles et à la législation sur les baux à loyer en RDC (Loi n° 15/025)
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addMonths, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

export type ProcedureType = 
  | 'preavis_location' 
  | 'resiliation_technicien' 
  | 'accord_amiable' 
  | 'manquement_contractuel';

export type ProcedureStatus = 
  | 'Brouillon'
  | 'Envoyé'
  | 'En attente de réponse'
  | 'Préavis en cours'
  | 'Contesté'
  | 'En négociation'
  | 'Accord amiable'
  | 'Fin de contrat programmée'
  | 'En cours de clôture'
  | 'Terminé'
  | 'Annulé';

export type InitiatorRole = 'landlord' | 'tenant' | 'technician';

export interface ClosureChecklist {
  // Rental specific
  rentPaidUpToDate: boolean;
  chargesSettled: boolean;
  inventoryExitDone: boolean; // État des lieux de sortie contradictoire
  keysReturned: boolean; // Restitution des clés et télécommandes
  damagesIdentified: boolean;
  damageCost: number;
  guaranteeAmount: number;
  guaranteeReturned: number;
  hasReserves: boolean; // Clôture avec réserves
  reserveNotes?: string;

  // Technician specific
  ongoingTasksTransferred: boolean;
  invoicesPaid: boolean;
  equipmentReturned: boolean; // Outils, badges et matériel du bailleur
  accessRevoked: boolean; // Code d'accès désactivé
}

export interface TerminationEvent {
  timestamp: string;
  author: string;
  role: InitiatorRole;
  action: string;
  details?: string;
}

export interface TerminationComment {
  id: string;
  authorName: string;
  authorRole: InitiatorRole;
  message: string;
  createdAt: string;
}

export interface TerminationProcedure {
  id: string;
  landlordId: string;
  contractId?: string;
  tenantId?: string;
  technicianId?: string;
  targetName: string;
  targetAddressOrSpecialty?: string;
  targetPhone?: string;
  targetEmail?: string;
  initiator: InitiatorRole;
  procedureType: ProcedureType;
  reason: string;
  legalBasis: string;
  notificationDate: string; // ISO
  effectiveDate?: string;
  desiredEndDate?: string;
  confirmedEndDate?: string;
  noticeDurationMonths: number;
  status: ProcedureStatus;
  closureChecklist: ClosureChecklist;
  events: TerminationEvent[];
  comments: TerminationComment[];
  attachmentUrls?: string[];
  communeActNumber?: string;
  communeName?: string;
  communeDeliveryDate?: string;
  communeDocUrl?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

/**
 * Calculate the contractual/legal end of notice period
 * In DRC housing lease (Loi 15/025), default notice is 3 months, taking effect on the 1st of the following month.
 */
export function calculateNoticeEndDate(
  notificationDateISO: string, 
  durationMonths: number,
  alignToMonthEnd: boolean = true
): string {
  try {
    const baseDate = parseISO(notificationDateISO);
    let target = addMonths(baseDate, durationMonths);
    if (alignToMonthEnd) {
      // Last day of that target month
      target = new Date(target.getFullYear(), target.getMonth() + 1, 0);
    }
    return target.toISOString().split('T')[0];
  } catch {
    return notificationDateISO;
  }
}

/**
 * Generate official Notice Letter PDF (Lettre de congé / notification de préavis)
 */
export function generateNoticeLetterPDF(procedure: TerminationProcedure, landlordName: string = 'Le Bailleur'): void {
  const doc = new jsPDF();
  const isTenantInitiated = procedure.initiator === 'tenant';

  // Header Banner
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("NOTIFICATION FORMELLE DE PRÉAVIS", 105, 22, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Conforme au Code des Obligations et à la Loi n° 15/025 relative aux baux à loyer", 105, 30, { align: "center" });

  // Metadata block
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(10);
  doc.text(`Réf : PREAV-${procedure.id.substring(0, 8).toUpperCase()}`, 14, 50);
  doc.text(`Fait à Kinshasa, le : ${format(new Date(procedure.notificationDate || procedure.createdAt), 'dd MMMM yyyy', { locale: fr })}`, 120, 50);

  doc.setDrawColor(229, 231, 235);
  doc.line(14, 55, 196, 55);

  // Sender & Recipient boxes
  doc.setFont("helvetica", "bold");
  doc.text("ÉMETTEUR :", 14, 65);
  doc.setFont("helvetica", "normal");
  if (isTenantInitiated) {
    doc.text(`Locataire : ${procedure.targetName}`, 14, 72);
    doc.text(`Téléphone : ${procedure.targetPhone || 'N/A'}`, 14, 78);
    doc.text(`Logement loué : ${procedure.targetAddressOrSpecialty || 'Conforme au contrat'}`, 14, 84);
  } else {
    doc.text(`Bailleur / Gestionnaire : ${landlordName}`, 14, 72);
    doc.text("Représentant légal autorisé", 14, 78);
  }

  doc.setFont("helvetica", "bold");
  doc.text("DESTINATAIRE :", 120, 65);
  doc.setFont("helvetica", "normal");
  if (isTenantInitiated) {
    doc.text(`Bailleur : ${landlordName}`, 120, 72);
    doc.text("Gestionnaire de l'immeuble", 120, 78);
  } else {
    doc.text(`Bénéficiaire : ${procedure.targetName}`, 120, 72);
    doc.text(`Téléphone : ${procedure.targetPhone || 'N/A'}`, 120, 78);
    doc.text(`Adresse : ${procedure.targetAddressOrSpecialty || 'N/A'}`, 120, 84);
  }

  // Subject
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(14, 94, 182, 16, 2, 2, 'F');
  doc.setFont("helvetica", "bold");
  doc.setTextColor(17, 24, 39);
  doc.text(`OBJET : Notification de résiliation de contrat et ouverture du délai de préavis`, 18, 104);

  // Content body
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  
  const introText = isTenantInitiated
    ? `Par la présente, je vous notifie formellement ma décision de résilier le contrat de bail nous liant pour le logement sis à : ${procedure.targetAddressOrSpecialty || 'Kinshasa'}.`
    : `Par la présente, nous vous notifions formellement la décision de résiliation du contrat relatif au logement / à la prestation visé(e) en référence.`;

  const legalText = `Fondement contractuel et légal : ${procedure.legalBasis || 'Dispositions contractuelles et Loi n° 15/025'}.\nMotif signifié : ${procedure.reason}`;

  const periodText = `Durée du préavis : ${procedure.noticeDurationMonths} mois.\nDate de prise d'effet : ${procedure.notificationDate ? format(new Date(procedure.notificationDate), 'dd/MM/yyyy') : 'Immédiate'}.\nDate d'échéance et fin programmée du contrat : ${procedure.confirmedEndDate ? format(new Date(procedure.confirmedEndDate), 'dd MMMM yyyy', { locale: fr }) : 'À convenir'}.`;

  const obligationsText = `Durant l'exécution dudit préavis, les parties demeurent tenues à l'intégralité de leurs obligations contractuelles (paiement régulier des loyers et charges, jouissance paisible, et respect des lieux).\nUn état des lieux contradictoire de sortie sera convenu à l'échéance afin de procéder à la restitution formelle des clés et au décompte de la garantie locative.`;

  let yPos = 120;
  [introText, legalText, periodText, obligationsText].forEach(block => {
    const lines = doc.splitTextToSize(block, 180);
    doc.text(lines, 14, yPos);
    yPos += lines.length * 5.5 + 4;
  });

  // Justification Communale (Kinshasa)
  if (procedure.communeActNumber || procedure.communeName) {
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(14, yPos + 2, 182, 18, 2, 2, 'FD');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 58, 138);
    doc.text("VISA ET JUSTIFICATION DE LA MAISON COMMUNALE :", 18, yPos + 8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(31, 41, 55);
    const communeInfo = `Commune de : ${procedure.communeName || 'Kinshasa'} | N° Acte/Attestation : ${procedure.communeActNumber || 'En cours d\'enregistrement'}${procedure.communeDeliveryDate ? ` | Délivré le : ${procedure.communeDeliveryDate}` : ''}`;
    doc.text(communeInfo, 18, yPos + 15);
    yPos += 24;
  }

  // Signatures
  doc.setFont("helvetica", "bold");
  doc.setTextColor(31, 41, 55);
  doc.text("Signature de l'Émetteur :", 14, Math.max(yPos + 8, 240));
  doc.text("Accusé de réception du Destinataire :", 115, Math.max(yPos + 8, 240));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("(Mention manuscrite 'Reçu le ... et pris acte')", 115, Math.max(yPos + 14, 246));

  doc.save(`lettre_preavis_${procedure.targetName.replace(/\s+/g, '_')}_${procedure.id.substring(0, 6)}.pdf`);
}

/**
 * Generate official Exit Inventory & Key Handover PDF (PV d'état des lieux & Restitution des clés)
 */
export function generateClosureInventoryPDF(procedure: TerminationProcedure): void {
  const doc = new jsPDF();

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("PROCÈS-VERBAL DE CLÔTURE & RESTITUTION DES LIEUX", 105, 22, { align: "center" });

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(10);
  doc.text(`Réf : PV-CLOT-${procedure.id.substring(0, 8).toUpperCase()}`, 14, 48);
  doc.text(`Date de clôture : ${format(new Date(), 'dd MMMM yyyy', { locale: fr })}`, 130, 48);

  const chk = procedure.closureChecklist;

  const tableData = [
    ['Paiements des loyers & consommations', chk.rentPaidUpToDate ? 'À jour (Soldé)' : 'Arriérés en suspens', chk.rentPaidUpToDate ? 'Conforme' : 'À régulariser'],
    ['Règlement des charges communes / eau / élec', chk.chargesSettled ? 'Régularisé' : 'En attente', chk.chargesSettled ? 'Conforme' : 'À régulariser'],
    ['État des lieux contradictoire de sortie', chk.inventoryExitDone ? 'Effectué contradictoirement' : 'Non réalisé', chk.inventoryExitDone ? 'Validé' : 'Bloquant'],
    ['Restitution intégrale des clés & bips', chk.keysReturned ? 'Restituées au complet' : 'Manquantes', chk.keysReturned ? 'Conforme' : 'Pénalité'],
    ['Dégradations constatées', chk.damagesIdentified ? `Oui (Estimation : ${chk.damageCost || 0} $)` : 'Aucune dégradation notable', chk.damagesIdentified ? 'Déduction caution' : 'R.A.S.'],
    ['Garantie locative / Caution consignée', `${chk.guaranteeAmount || 0} $`, 'Montant initial'],
    ['Garantie nette restituée au preneur', `${chk.guaranteeReturned || 0} $`, 'Solde de tout compte']
  ];

  autoTable(doc, {
    startY: 55,
    head: [['Points de contrôle obligatoires', 'Constatations des parties', 'Décision']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42] },
    styles: { fontSize: 9.5, cellPadding: 4 }
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 160;

  if (chk.hasReserves) {
    doc.setFillColor(254, 242, 242);
    doc.roundedRect(14, finalY + 8, 182, 24, 2, 2, 'FD');
    doc.setTextColor(153, 27, 27);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("CLÔTURE ASSORTIE DE RÉSERVES EXPRÈS :", 18, finalY + 16);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(chk.reserveNotes || 'Réserves sur dégradations ou arriérés à traiter séparément.', 174), 18, finalY + 22);
  }

  // Final statement
  doc.setTextColor(55, 65, 81);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "italic");
  doc.text("Les soussignés reconnaissent l'exactitude des énonciations ci-dessus et conviennent de la clôture formelle des rapports locatifs.", 14, finalY + 40);

  // Signatures
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Pour le Bailleur / Gestionnaire :", 14, finalY + 60);
  doc.text("Pour le Preneur / Sortant :", 120, finalY + 60);

  doc.save(`PV_cloture_${procedure.targetName.replace(/\s+/g, '_')}.pdf`);
}
