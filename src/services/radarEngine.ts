import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export type RadarAlertPriority = 'Critique' | 'Haute' | 'Moyenne' | 'Info';

export type RadarAlertStatus = 'active' | 'resolved' | 'dismissed';

export type RadarCategory = 'Finances' | 'Baux' | 'Technique' | 'Patrimoine' | 'Données';

export interface RadarAlert {
  id: string;
  landlordId: string;
  type: 
    | 'unpaid_rent'
    | 'expiring_contract'
    | 'vacant_property'
    | 'budget_exceeded'
    | 'maintenance_spike'
    | 'urgent_maintenance_unattended'
    | 'duplicate_payment'
    | 'pending_invitation'
    | 'periodic_maintenance_due'
    | 'data_anomaly';
  category: RadarCategory;
  priority: RadarAlertPriority;
  title: string;
  description: string;
  status: RadarAlertStatus;
  entityType: 'tenant' | 'property' | 'contract' | 'payment' | 'maintenance' | 'expense' | 'user';
  entityId: string;
  propertyId?: string;
  propertyName?: string;
  tenantId?: string;
  tenantName?: string;
  tenantPhone?: string;
  dedupKey: string;
  isAnomaly: boolean; // true = anomaly detected; false = operational reminder
  metadata?: Record<string, any>;
  actionType: 
    | 'contact_whatsapp'
    | 'contact_sms'
    | 'view_contract'
    | 'assign_tech'
    | 'review_transaction'
    | 'view_property'
    | 'view_tenant';
  suggestedActionLabel: string;
  resolutionComment?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RadarSettings {
  landlordId: string;
  rentGraceDays: number;
  contractExpiryAlertDays: number;
  vacancyAlertDays: number;
  monthlyBudgetLimit: number;
  maintenanceCostSpikePercentage: number;
  urgentMaintenanceMaxHours: number;
  invitationTimeoutDays: number;
}

export const DEFAULT_RADAR_SETTINGS: RadarSettings = {
  landlordId: '',
  rentGraceDays: 5,
  contractExpiryAlertDays: 45,
  vacancyAlertDays: 30,
  monthlyBudgetLimit: 1200,
  maintenanceCostSpikePercentage: 50,
  urgentMaintenanceMaxHours: 48,
  invitationTimeoutDays: 7
};

/**
 * Fetch or initialize Radar Settings for a landlord
 */
export async function getRadarSettings(landlordId: string): Promise<RadarSettings> {
  try {
    const q = query(collection(db, 'radar_settings'), where('landlordId', '==', landlordId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { ...DEFAULT_RADAR_SETTINGS, ...snap.docs[0].data(), landlordId } as RadarSettings;
    }
  } catch (err) {
    console.warn("Could not load radar settings, using defaults", err);
  }
  return { ...DEFAULT_RADAR_SETTINGS, landlordId };
}

/**
 * Save updated Radar Settings for a landlord
 */
export async function saveRadarSettings(settings: RadarSettings): Promise<void> {
  const q = query(collection(db, 'radar_settings'), where('landlordId', '==', settings.landlordId));
  const snap = await getDocs(q);
  const payload = {
    ...settings,
    updatedAt: new Date().toISOString()
  };
  if (!snap.empty) {
    await updateDoc(doc(db, 'radar_settings', snap.docs[0].id), payload);
  } else {
    await addDoc(collection(db, 'radar_settings'), payload);
  }
}

/**
 * Run full non-intrusive surveillance analysis across existing data
 * Idempotent: Never generates duplicate alerts, respects resolved or dismissed items
 */
export async function runRadarAnalysis(landlordId: string): Promise<{
  newAlertsCount: number;
  totalActiveAlerts: number;
  scannedEntitiesCount: number;
}> {
  const settings = await getRadarSettings(landlordId);
  const now = new Date();
  const nowISO = now.toISOString();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const yearMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  // 1. Load existing data in parallel
  const [
    tenantsSnap,
    propertiesSnap,
    contractsSnap,
    paymentsSnap,
    expensesSnap,
    maintenanceSnap,
    existingAlertsSnap
  ] = await Promise.all([
    getDocs(query(collection(db, 'tenants'), where('landlordId', '==', landlordId))),
    getDocs(query(collection(db, 'properties'), where('landlordId', '==', landlordId))),
    getDocs(query(collection(db, 'contracts'), where('landlordId', '==', landlordId))),
    getDocs(query(collection(db, 'payments'), where('landlordId', '==', landlordId))),
    getDocs(query(collection(db, 'expenses'), where('landlordId', '==', landlordId))),
    getDocs(query(collection(db, 'maintenance'), where('landlordId', '==', landlordId))),
    getDocs(query(collection(db, 'radar_alerts'), where('landlordId', '==', landlordId)))
  ]);

  const tenants = tenantsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const properties = propertiesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const contracts = contractsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const expenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const maintenance = maintenanceSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

  // Existing alerts keyed by dedupKey
  const existingAlertsMap = new Map<string, { id: string; status: RadarAlertStatus }>();
  existingAlertsSnap.docs.forEach(d => {
    const data = d.data();
    if (data.dedupKey) {
      existingAlertsMap.set(data.dedupKey, { id: d.id, status: data.status });
    }
  });

  const propertiesMap = new Map(properties.map(p => [p.id, p]));
  const detectedAlerts: Omit<RadarAlert, 'id'>[] = [];

  // ==============================================================
  // 1. ALERTE 1: LOYERS ÉCHUS NON RÉGLÉS
  // ==============================================================
  const currentDay = now.getDate();
  if (currentDay > settings.rentGraceDays) {
    for (const t of tenants) {
      // Calculate total rent paid this month
      const monthlyPaid = payments
        .filter(p => {
          if (p.tenantId !== t.id || p.status === 'Rejeté') return false;
          const pDate = new Date(p.date || p.createdAt);
          return (
            pDate.getFullYear() === currentYear &&
            pDate.getMonth() === currentMonth &&
            (p.type === 'Loyer' || p.type === 'Tous les frais du mois')
          );
        })
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const rentAmount = Number(t.monthlyRent || 0);
      const remaining = rentAmount - monthlyPaid;

      if (remaining > 0) {
        const prop = t.propertyId ? propertiesMap.get(t.propertyId) : null;
        const dedupKey = `unpaid_rent_${t.id}_${yearMonthKey}`;
        detectedAlerts.push({
          landlordId,
          type: 'unpaid_rent',
          category: 'Finances',
          priority: currentDay > 15 ? 'Critique' : 'Haute',
          title: `Loyer impayé : ${t.name}`,
          description: `Le loyer du mois (${yearMonthKey}) présente un solde restant de ${remaining} $ sur un loyer exigible de ${rentAmount} $. Dépassement de ${currentDay - settings.rentGraceDays} jours après le délai de tolérance (le ${settings.rentGraceDays} du mois).`,
          status: 'active',
          entityType: 'tenant',
          entityId: t.id,
          propertyId: t.propertyId,
          propertyName: prop ? prop.name : t.address,
          tenantId: t.id,
          tenantName: t.name,
          tenantPhone: t.phone,
          dedupKey,
          isAnomaly: false,
          metadata: { remaining, rentAmount, monthlyPaid, month: yearMonthKey },
          actionType: 'contact_whatsapp',
          suggestedActionLabel: 'Relancer par WhatsApp',
          createdAt: nowISO,
          updatedAt: nowISO
        });
      }
    }
  }

  // ==============================================================
  // 2. ALERTE 2: CONTRATS PROCHES D'EXPIRATION
  // ==============================================================
  for (const c of contracts) {
    if (c.status === 'Actif' && c.endDate) {
      const endDate = new Date(c.endDate);
      const diffMs = endDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= settings.contractExpiryAlertDays && diffDays >= -10) {
        const prop = c.propertyId ? propertiesMap.get(c.propertyId) : null;
        const t = tenants.find(te => te.id === c.tenantId);
        const endMonthKey = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
        const dedupKey = `expiring_contract_${c.id}_${endMonthKey}`;

        detectedAlerts.push({
          landlordId,
          type: 'expiring_contract',
          category: 'Baux',
          priority: diffDays <= 15 ? 'Critique' : 'Haute',
          title: `Bail arrivant à échéance : ${t ? t.name : 'Locataire'}`,
          description: diffDays > 0
            ? `Le contrat de bail pour "${prop ? prop.name : 'Logement'}" expire dans ${diffDays} jour(s) (le ${endDate.toLocaleDateString('fr-FR')}). Pensez à convenir du renouvellement ou de l'état des lieux.`
            : `Le contrat de bail est arrivé à terme le ${endDate.toLocaleDateString('fr-FR')} sans renouvellement enregistré.`,
          status: 'active',
          entityType: 'contract',
          entityId: c.id,
          propertyId: c.propertyId,
          propertyName: prop?.name,
          tenantId: c.tenantId,
          tenantName: t?.name,
          tenantPhone: t?.phone,
          dedupKey,
          isAnomaly: false,
          metadata: { diffDays, endDate: c.endDate },
          actionType: 'view_contract',
          suggestedActionLabel: 'Consulter le bail',
          createdAt: nowISO,
          updatedAt: nowISO
        });
      }
    }
  }

  // ==============================================================
  // 3. ALERTE 3: LOGEMENTS VACANTS OU DISPONIBLES DEPUIS LONGTEMPS
  // ==============================================================
  const occupiedPropertyIds = new Set(tenants.map(t => t.propertyId).filter(Boolean));
  for (const p of properties) {
    const isOccupied = occupiedPropertyIds.has(p.id) || p.status === 'Occupé';
    if (!isOccupied || p.status === 'Libre') {
      const createdDate = new Date(p.createdAt || nowISO);
      const vacantDays = Math.ceil((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      if (vacantDays >= settings.vacancyAlertDays) {
        const dedupKey = `vacant_property_${p.id}_${yearMonthKey}`;
        detectedAlerts.push({
          landlordId,
          type: 'vacant_property',
          category: 'Patrimoine',
          priority: vacantDays > 60 ? 'Haute' : 'Moyenne',
          title: `Logement vacant depuis ${vacantDays} jours : ${p.name}`,
          description: `Ce bien (${p.type || 'Logement'} à ${p.address}) n'a aucun locataire actif enregistré depuis plus de ${vacantDays} jours, représentant un manque à gagner locatif potentiel.`,
          status: 'active',
          entityType: 'property',
          entityId: p.id,
          propertyId: p.id,
          propertyName: p.name,
          dedupKey,
          isAnomaly: false,
          metadata: { vacantDays, type: p.type },
          actionType: 'view_property',
          suggestedActionLabel: 'Gérer le bien',
          createdAt: nowISO,
          updatedAt: nowISO
        });
      }
    }
  }

  // ==============================================================
  // 4. ALERTE 4: DÉPENSES DÉPASSANT LE BUDGET DÉFINI
  // ==============================================================
  const currentMonthExpenses = expenses.filter(e => {
    const d = new Date(e.date || e.createdAt);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });
  const totalCurrentExpenses = currentMonthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  if (totalCurrentExpenses > settings.monthlyBudgetLimit) {
    const dedupKey = `budget_exceeded_${landlordId}_${yearMonthKey}`;
    const excess = totalCurrentExpenses - settings.monthlyBudgetLimit;
    detectedAlerts.push({
      landlordId,
      type: 'budget_exceeded',
      category: 'Finances',
      priority: excess > (settings.monthlyBudgetLimit * 0.3) ? 'Critique' : 'Haute',
      title: `Budget de dépenses dépassé pour ${yearMonthKey}`,
      description: `Le total des charges enregistrées pour ce mois s'élève à ${totalCurrentExpenses} $, excédant le plafond fixé de ${settings.monthlyBudgetLimit} $ (+${excess} $).`,
      status: 'active',
      entityType: 'expense',
      entityId: `budget_${yearMonthKey}`,
      dedupKey,
      isAnomaly: false,
      metadata: { totalCurrentExpenses, limit: settings.monthlyBudgetLimit, excess },
      actionType: 'review_transaction',
      suggestedActionLabel: 'Vérifier les dépenses',
      createdAt: nowISO,
      updatedAt: nowISO
    });
  }

  // ==============================================================
  // 5. ALERTE 5: HAUSSE INHABITUELLE DES DÉPENSES DE MAINTENANCE
  // ==============================================================
  const maintenanceExpensesCurrent = currentMonthExpenses
    .filter(e => e.category === 'Entretien')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Past 3 months maintenance expenses average
  let past3MonthsTotal = 0;
  let monthsCounted = 0;
  for (let m = 1; m <= 3; m++) {
    const targetDate = new Date(currentYear, currentMonth - m, 1);
    const targetY = targetDate.getFullYear();
    const targetM = targetDate.getMonth();
    const sum = expenses
      .filter(e => {
        const d = new Date(e.date || e.createdAt);
        return d.getFullYear() === targetY && d.getMonth() === targetM && e.category === 'Entretien';
      })
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    past3MonthsTotal += sum;
    monthsCounted++;
  }
  const avgPastMaintenance = monthsCounted > 0 ? (past3MonthsTotal / monthsCounted) : 0;

  if (avgPastMaintenance > 0 && maintenanceExpensesCurrent > avgPastMaintenance * (1 + settings.maintenanceCostSpikePercentage / 100)) {
    const spikePct = Math.round(((maintenanceExpensesCurrent - avgPastMaintenance) / avgPastMaintenance) * 100);
    const dedupKey = `maintenance_spike_${landlordId}_${yearMonthKey}`;
    detectedAlerts.push({
      landlordId,
      type: 'maintenance_spike',
      category: 'Technique',
      priority: spikePct > 100 ? 'Critique' : 'Haute',
      title: `Hausse anormale de l'entretien (+${spikePct}%)`,
      description: `Les frais d'entretien ce mois-ci atteignent ${maintenanceExpensesCurrent} $, comparés à une moyenne de ${Math.round(avgPastMaintenance)} $ sur les 3 derniers mois.`,
      status: 'active',
      entityType: 'expense',
      entityId: `spike_${yearMonthKey}`,
      dedupKey,
      isAnomaly: true,
      metadata: { maintenanceExpensesCurrent, avgPastMaintenance, spikePct },
      actionType: 'review_transaction',
      suggestedActionLabel: 'Inspecter les réparations',
      createdAt: nowISO,
      updatedAt: nowISO
    });
  }

  // ==============================================================
  // 6. ALERTE 6: DEMANDES DE RÉPARATION URGENTES NON TRAITÉES
  // ==============================================================
  for (const issue of maintenance) {
    const isClosed = ['Résolu', 'Terminée', 'Clôturée'].includes(issue.status);
    if (!isClosed) {
      const isUrgent = issue.priority === 'Urgente' || issue.priority === 'Haute';
      const createdDate = new Date(issue.createdAt || nowISO);
      const hoursPending = Math.round((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60));
      const hasTech = Boolean(issue.assignedTechnicianName || issue.assignedTechnicianId);

      if (isUrgent || hoursPending >= settings.urgentMaintenanceMaxHours) {
        const prop = issue.propertyId ? propertiesMap.get(issue.propertyId) : null;
        const t = tenants.find(te => te.id === issue.tenantId);
        const ticketRef = issue.ticketNumber || `INT-${issue.id.substring(0, 6).toUpperCase()}`;
        const dedupKey = `urgent_issue_${issue.id}`;

        detectedAlerts.push({
          landlordId,
          type: 'urgent_maintenance_unattended',
          category: 'Technique',
          priority: isUrgent ? 'Critique' : 'Haute',
          title: `Panne urgente non résolue (${ticketRef})`,
          description: `Signalement "${issue.description}" en attente depuis ${hoursPending}h ${hasTech ? `(Technicien : ${issue.assignedTechnicianName})` : '(Aucun technicien assigné)'}.`,
          status: 'active',
          entityType: 'maintenance',
          entityId: issue.id,
          propertyId: issue.propertyId,
          propertyName: prop ? prop.name : issue.title,
          tenantId: issue.tenantId,
          tenantName: t?.name,
          tenantPhone: t?.phone,
          dedupKey,
          isAnomaly: false,
          metadata: { hoursPending, priority: issue.priority, hasTech },
          actionType: 'assign_tech',
          suggestedActionLabel: hasTech ? 'Vérifier l\'intervention' : 'Attribuer un technicien',
          createdAt: nowISO,
          updatedAt: nowISO
        });
      }
    }
  }

  // ==============================================================
  // 7. ALERTE 7: PAIEMENTS POTENTIELLEMENT DUPLIQUÉS
  // ==============================================================
  // Group payments by tenantId and compare timestamps + amounts
  for (let i = 0; i < payments.length; i++) {
    for (let j = i + 1; j < payments.length; j++) {
      const p1 = payments[i];
      const p2 = payments[j];
      if (p1.tenantId && p1.tenantId === p2.tenantId && Number(p1.amount) === Number(p2.amount) && p1.type === p2.type) {
        const d1 = new Date(p1.date || p1.createdAt).getTime();
        const d2 = new Date(p2.date || p2.createdAt).getTime();
        const diffHours = Math.abs(d1 - d2) / (1000 * 3600);
        // Suspicion if same amount, same type, within 72h
        if (diffHours <= 72 && p1.status !== 'Rejeté' && p2.status !== 'Rejeté') {
          const t = tenants.find(te => te.id === p1.tenantId);
          const dedupKey = `dup_payment_${[p1.id, p2.id].sort().join('_')}`;
          detectedAlerts.push({
            landlordId,
            type: 'duplicate_payment',
            category: 'Finances',
            priority: 'Haute',
            title: `Paiement potentiellement dupliqué : ${p1.amount} $`,
            description: `Deux règlements identiques de ${p1.amount} $ pour "${p1.type}" enregistrés à ${Math.round(diffHours)}h d'intervalle pour ${t ? t.name : 'le locataire'}. Nécessite un contrôle comptable.`,
            status: 'active',
            entityType: 'payment',
            entityId: p1.id,
            tenantId: p1.tenantId,
            tenantName: t?.name,
            tenantPhone: t?.phone,
            dedupKey,
            isAnomaly: true,
            metadata: { p1Id: p1.id, p2Id: p2.id, amount: p1.amount, diffHours },
            actionType: 'review_transaction',
            suggestedActionLabel: 'Vérifier la transaction',
            createdAt: nowISO,
            updatedAt: nowISO
          });
        }
      }
    }
  }

  // ==============================================================
  // 8. ALERTE 8: INVITATIONS DE COMPTES EN ATTENTE PROLONGÉE
  // ==============================================================
  for (const t of tenants) {
    if (!t.userId && t.phone) {
      const entry = new Date(t.createdAt || t.entryDate || nowISO);
      const pendingDays = Math.ceil((now.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
      if (pendingDays >= settings.invitationTimeoutDays) {
        const dedupKey = `pending_invitation_${t.id}_${yearMonthKey}`;
        detectedAlerts.push({
          landlordId,
          type: 'pending_invitation',
          category: 'Données',
          priority: 'Moyenne',
          title: `Portail locataire non activé : ${t.name}`,
          description: `Ce locataire est enregistré depuis ${pendingDays} jours mais n'a pas encore connecté son compte personnel sécurisé. Vous pouvez lui renvoyer son lien par WhatsApp.`,
          status: 'active',
          entityType: 'tenant',
          entityId: t.id,
          tenantId: t.id,
          tenantName: t.name,
          tenantPhone: t.phone,
          dedupKey,
          isAnomaly: false,
          metadata: { pendingDays },
          actionType: 'contact_whatsapp',
          suggestedActionLabel: 'Renvoyer le lien WhatsApp',
          createdAt: nowISO,
          updatedAt: nowISO
        });
      }
    }
  }

  // ==============================================================
  // 9. ALERTE 9: ÉQUIPEMENTS & MAINTENANCE PÉRIODIQUE PRÉVUE
  // ==============================================================
  for (const p of properties) {
    // Check if property has had any maintenance or inspection in last 180 days (6 months)
    const propMaintenance = maintenance.filter(m => m.propertyId === p.id);
    const lastMDate = propMaintenance.length > 0
      ? new Date(Math.max(...propMaintenance.map(m => new Date(m.createdAt).getTime())))
      : new Date(p.createdAt || nowISO);
    const daysSinceInspection = Math.ceil((now.getTime() - lastMDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceInspection >= 180) {
      const dedupKey = `periodic_maintenance_${p.id}_${currentYear}`;
      detectedAlerts.push({
        landlordId,
        type: 'periodic_maintenance_due',
        category: 'Patrimoine',
        priority: 'Moyenne',
        title: `Contrôle périodique recommandé : ${p.name}`,
        description: `Aucune intervention technique ou vérification préventive (extincteurs, plomberie, tableau électrique) n'a été enregistrée pour ce bien depuis plus de ${daysSinceInspection} jours.`,
        status: 'active',
        entityType: 'property',
        entityId: p.id,
        propertyId: p.id,
        propertyName: p.name,
        dedupKey,
        isAnomaly: false,
        metadata: { daysSinceInspection },
        actionType: 'assign_tech',
        suggestedActionLabel: 'Planifier une révision',
        createdAt: nowISO,
        updatedAt: nowISO
      });
    }
  }

  // ==============================================================
  // 10. ALERTE 10: ANOMALIES DANS LES DONNÉES (CONTRÔLE HUMAIN REQUIS)
  // ==============================================================
  for (const t of tenants) {
    const rentVal = Number(t.monthlyRent);
    const guaranteeVal = Number(t.guaranteeAmount);

    if (rentVal <= 0 || isNaN(rentVal)) {
      const dedupKey = `data_anomaly_rent_${t.id}`;
      detectedAlerts.push({
        landlordId,
        type: 'data_anomaly',
        category: 'Données',
        priority: 'Haute',
        title: `Anomalie de loyer : ${t.name}`,
        description: `Le montant de loyer mensuel est enregistré à 0 $ ou invalide. Veuillez vérifier le dossier du locataire.`,
        status: 'active',
        entityType: 'tenant',
        entityId: t.id,
        tenantId: t.id,
        tenantName: t.name,
        tenantPhone: t.phone,
        dedupKey,
        isAnomaly: true,
        actionType: 'view_tenant',
        suggestedActionLabel: 'Corriger le dossier',
        createdAt: nowISO,
        updatedAt: nowISO
      });
    }

    if (guaranteeVal < 0) {
      const dedupKey = `data_anomaly_guarantee_${t.id}`;
      detectedAlerts.push({
        landlordId,
        type: 'data_anomaly',
        category: 'Données',
        priority: 'Critique',
        title: `Garantie locative négative : ${t.name}`,
        description: `Le solde de garantie locative est négatif (${guaranteeVal} $). Les déductions de travaux excèdent le montant initial déposé.`,
        status: 'active',
        entityType: 'tenant',
        entityId: t.id,
        tenantId: t.id,
        tenantName: t.name,
        tenantPhone: t.phone,
        dedupKey,
        isAnomaly: true,
        actionType: 'view_tenant',
        suggestedActionLabel: 'Régulariser la caution',
        createdAt: nowISO,
        updatedAt: nowISO
      });
    }
  }

  // ==============================================================
  // IDEMPOTENT PERSISTENCE: Save new alerts without recreating
  // ==============================================================
  let newAlertsCount = 0;
  for (const alert of detectedAlerts) {
    const existing = existingAlertsMap.get(alert.dedupKey);
    if (!existing) {
      // Create new active alert
      await addDoc(collection(db, 'radar_alerts'), alert);
      newAlertsCount++;
    } else if (existing.status === 'active') {
      // Alert already active, no duplicate needed
    }
  }

  const activeAlertsCount = existingAlertsSnap.docs.filter(d => d.data().status === 'active').length + newAlertsCount;

  return {
    newAlertsCount,
    totalActiveAlerts: activeAlertsCount,
    scannedEntitiesCount: tenants.length + properties.length + contracts.length + payments.length + maintenance.length
  };
}

/**
 * Mark a Radar alert as resolved or dismissed with comments
 */
export async function updateRadarAlertStatus(
  alertId: string, 
  status: RadarAlertStatus, 
  comment?: string
): Promise<void> {
  const alertRef = doc(db, 'radar_alerts', alertId);
  const now = new Date().toISOString();
  const updates: any = {
    status,
    updatedAt: now
  };
  if (status === 'resolved') {
    updates.resolvedAt = now;
  }
  if (comment) {
    updates.resolutionComment = comment;
  }
  await updateDoc(alertRef, updates);
}
