import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Plus, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Download, 
  MessageSquare, 
  X, 
  ShieldAlert,
  Sparkles,
  FileCheck2
} from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { 
  TerminationProcedure, 
  ProcedureType, 
  ProcedureStatus, 
  calculateNoticeEndDate, 
  generateNoticeLetterPDF, 
  generateClosureInventoryPDF 
} from '../services/terminationEngine';
import { useSubscription } from '../context/SubscriptionContext';

export function NoticeAndTermination() {
  const { openSubscriptionModal } = useSubscription();
  const [procedures, setProcedures] = useState<TerminationProcedure[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<TerminationProcedure | null>(null);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    // Listen to procedures
    const qProc = query(collection(db, 'termination_procedures'), where('landlordId', '==', uid));
    const unsubProc = onSnapshot(qProc, (snap) => {
      setProcedures(snap.docs.map(d => ({ id: d.id, ...d.data() })) as TerminationProcedure[]);
      setLoading(false);
    });

    // Fetch tenants
    getDocs(query(collection(db, 'tenants'), where('landlordId', '==', uid))).then(snap => {
      setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch technicians
    getDocs(query(collection(db, 'technicians'), where('landlordId', '==', uid))).then(snap => {
      setTechnicians(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch contracts
    getDocs(query(collection(db, 'contracts'), where('landlordId', '==', uid))).then(snap => {
      setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubProc();
  }, []);

  // Filtered list
  const filtered = useMemo(() => {
    return procedures.filter(p => {
      const matchSearch = 
        (p.targetName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.reason || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.id || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchType = typeFilter === 'all' || p.procedureType === typeFilter;
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;

      return matchSearch && matchType && matchStatus;
    });
  }, [procedures, searchTerm, typeFilter, statusFilter]);

  // KPIs
  const activeCount = procedures.filter(p => !['Terminé', 'Annulé'].includes(p.status)).length;
  const imminentCount = procedures.filter(p => {
    if (['Terminé', 'Annulé'].includes(p.status) || !p.confirmedEndDate) return false;
    const days = differenceInDays(parseISO(p.confirmedEndDate), new Date());
    return days >= 0 && days <= 30;
  }).length;
  const contestedCount = procedures.filter(p => ['Contesté', 'En négociation'].includes(p.status)).length;
  const readyToCloseCount = procedures.filter(p => ['Fin de contrat programmée', 'En cours de clôture'].includes(p.status)).length;

  return (
    <div className="space-y-6 page-enter">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileCheck2 className="w-6 h-6 text-blue-600" />
              Préavis & Résiliations
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              {procedures.length} dossier{procedures.length > 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gestion sécurisée des délais de congé, bilans de sortie, et résiliations de contrats (Baux & Prestations).
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Initier une Résiliation</span>
        </button>
      </div>

      {/* Recommended Pro Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-indigo-700/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold">Sécurité Juridique & Modèles Officiels OHADA / RDC</h3>
              <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-900 text-[10px] font-extrabold uppercase">Recommandé</span>
            </div>
            <p className="text-xs text-indigo-200 mt-0.5 max-w-2xl">
              Générez automatiquement les lettres de congé, constats de restitution des clés, décomptes de caution et accords amiables prêts pour signature.
            </p>
          </div>
        </div>

        <button
          onClick={() => openSubscriptionModal('pro')}
          className="shrink-0 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Forfait Pro Recommandé</span>
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Procédures en cours</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 dark:text-white mt-2">{activeCount}</p>
          <span className="text-[11px] text-gray-400">Préavis & résiliations actifs</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Échéance &lt; 30 jours</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">{imminentCount}</p>
          <span className="text-[11px] text-gray-400">Fin de contrat imminente</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Contestés / Négociation</span>
            <div className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-2">{contestedCount}</p>
          <span className="text-[11px] text-gray-400">À arbitrer ou régulariser</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Clôtures à valider</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{readyToCloseCount}</p>
          <span className="text-[11px] text-gray-400">État des lieux & restitution</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, motif, référence..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs sm:text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none"
          >
            <option value="all">Tous les types</option>
            <option value="preavis_location">Bail Locataire</option>
            <option value="resiliation_technicien">Prestation Technicien</option>
            <option value="accord_amiable">Accord Amiable</option>
            <option value="manquement_contractuel">Manquement Contractuel</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none"
          >
            <option value="all">Tous les statuts</option>
            <option value="Préavis en cours">Préavis en cours</option>
            <option value="Fin de contrat programmée">Fin programmée</option>
            <option value="En cours de clôture">En cours de clôture</option>
            <option value="Contesté">Contesté</option>
            <option value="Terminé">Terminé</option>
          </select>
        </div>
      </div>

      {/* Procedures List */}
      {loading ? (
        <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl border border-gray-100 dark:border-gray-700 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-xs text-gray-400">Chargement des procédures...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl border border-gray-100 dark:border-gray-700 text-center">
          <FileCheck2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="font-bold text-gray-900 dark:text-white text-base">Aucune procédure de résiliation enregistrée</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
            Initiez un préavis de location ou une fin de contrat de prestation pour automatiser le calcul des délais légaux et les bilans de clôture.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            Nouveau préavis
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map(proc => {
            const isRental = proc.procedureType === 'preavis_location';
            const daysRemaining = proc.confirmedEndDate 
              ? differenceInDays(parseISO(proc.confirmedEndDate), new Date()) 
              : null;

            return (
              <div
                key={proc.id}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-gray-400">
                      #{proc.id.substring(0, 8).toUpperCase()}
                    </span>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      isRental 
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' 
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>
                      {isRental ? 'Bail d\'habitation' : 'Prestation technique'}
                    </span>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      proc.status === 'Terminé' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                      proc.status === 'Contesté' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 animate-pulse' :
                      proc.status === 'Préavis en cours' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {proc.status}
                    </span>

                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      Initié par : <strong>{proc.initiator === 'tenant' ? 'Le Locataire' : (proc.initiator === 'technician' ? 'Le Technicien' : 'Le Bailleur')}</strong>
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-base text-gray-900 dark:text-white">
                      {proc.targetName}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {proc.targetAddressOrSpecialty} • Motif : <span className="text-gray-800 dark:text-gray-200 font-medium">{proc.reason}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                    <div>
                      Notification : <strong className="text-gray-900 dark:text-white">{proc.notificationDate ? format(parseISO(proc.notificationDate), 'dd/MM/yyyy') : 'N/A'}</strong>
                    </div>
                    <div>
                      Échéance préavis : <strong className="text-gray-900 dark:text-white">{proc.confirmedEndDate ? format(parseISO(proc.confirmedEndDate), 'dd MMMM yyyy', { locale: fr }) : 'Non fixée'}</strong>
                    </div>
                    {daysRemaining !== null && proc.status !== 'Terminé' && (
                      <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] ${
                        daysRemaining < 0 ? 'bg-red-100 text-red-700' :
                        daysRemaining <= 30 ? 'bg-amber-100 text-amber-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {daysRemaining < 0 ? `Échu depuis ${Math.abs(daysRemaining)} j` : `${daysRemaining} jours restants`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0 flex-wrap">
                  <button
                    onClick={() => generateNoticeLetterPDF(proc)}
                    className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    title="Télécharger la lettre officielle de préavis PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Lettre PDF</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedProcedure(proc);
                      setShowChecklistModal(true);
                    }}
                    className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Bilan & Clôture</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedProcedure(proc);
                      setShowEventsModal(true);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl"
                    title="Journal des événements et messages"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE PROCEDURE MODAL */}
      {showCreateModal && (
        <CreateProcedureModal
          tenants={tenants}
          technicians={technicians}
          contracts={contracts}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* CLOSURE & CHECKLIST MODAL */}
      {showChecklistModal && selectedProcedure && (
        <ClosureChecklistModal
          procedure={selectedProcedure}
          onClose={() => {
            setShowChecklistModal(false);
            setSelectedProcedure(null);
          }}
        />
      )}

      {/* EVENTS & COMMENTS MODAL */}
      {showEventsModal && selectedProcedure && (
        <EventsModal
          procedure={selectedProcedure}
          onClose={() => {
            setShowEventsModal(false);
            setSelectedProcedure(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Modal to initiate a new termination procedure
 */
function CreateProcedureModal({ 
  tenants, 
  technicians, 
  contracts, 
  onClose 
}: { 
  tenants: any[], 
  technicians: any[], 
  contracts: any[], 
  onClose: () => void 
}) {
  const [loading, setLoading] = useState(false);
  const [procedureType, setProcedureType] = useState<ProcedureType>('preavis_location');
  const [targetId, setTargetId] = useState<string>(tenants[0]?.id || '');
  const [initiator, setInitiator] = useState<'landlord' | 'tenant' | 'technician'>('landlord');
  const [reason, setReason] = useState('');
  const [legalBasis, setLegalBasis] = useState('Loi n° 15/025 du 31 décembre 2015 relative aux baux à loyer en RDC (Art. 18)');
  const [notificationDate, setNotificationDate] = useState(new Date().toISOString().split('T')[0]);
  const [noticeDurationMonths, setNoticeDurationMonths] = useState(3);

  const handleProcedureTypeChange = (newType: ProcedureType) => {
    setProcedureType(newType);
    if (newType === 'resiliation_technicien') {
      setTargetId(technicians[0]?.id || '');
      setLegalBasis('Code des Obligations et clauses contractuelles de prestation de service');
      setNoticeDurationMonths(1);
    } else {
      setTargetId(tenants[0]?.id || '');
      setLegalBasis('Loi n° 15/025 du 31 décembre 2015 relative aux baux à loyer en RDC (Art. 18)');
      setNoticeDurationMonths(3);
    }
  };

  // Compute calculated end date
  const calculatedEndDate = useMemo(() => {
    return calculateNoticeEndDate(notificationDate, noticeDurationMonths, true);
  }, [notificationDate, noticeDurationMonths]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!reason.trim()) {
      toast.error("Veuillez préciser le motif de la notification.");
      return;
    }

    setLoading(true);
    try {
      const now = new Date().toISOString();
      const isTenantType = procedureType === 'preavis_location' || procedureType === 'accord_amiable';
      
      let targetName = 'Bénéficiaire';
      let targetAddressOrSpecialty = '';
      let targetPhone = '';
      let targetEmail = '';
      let contractId = '';

      if (isTenantType) {
        const t = tenants.find(x => x.id === targetId);
        targetName = t?.name || 'Locataire';
        targetAddressOrSpecialty = t?.address || 'Kinshasa';
        targetPhone = t?.phone || '';
        targetEmail = t?.email || '';
        const matchingContract = contracts.find(c => c.tenantId === targetId);
        contractId = matchingContract?.id || '';
      } else {
        const tech = technicians.find(x => x.id === targetId);
        targetName = tech?.name || 'Technicien';
        targetAddressOrSpecialty = tech?.specialty || 'Maintenance';
        targetPhone = tech?.phone || '';
        targetEmail = tech?.email || '';
      }

      const newProcedureData: Partial<TerminationProcedure> = {
        landlordId: auth.currentUser.uid,
        contractId,
        tenantId: isTenantType ? targetId : undefined,
        technicianId: !isTenantType ? targetId : undefined,
        targetName,
        targetAddressOrSpecialty,
        targetPhone,
        targetEmail,
        initiator,
        procedureType,
        reason: reason.trim(),
        legalBasis,
        notificationDate,
        effectiveDate: notificationDate,
        desiredEndDate: calculatedEndDate,
        confirmedEndDate: calculatedEndDate,
        noticeDurationMonths,
        status: 'Préavis en cours',
        closureChecklist: {
          rentPaidUpToDate: false,
          chargesSettled: false,
          inventoryExitDone: false,
          keysReturned: false,
          damagesIdentified: false,
          damageCost: 0,
          guaranteeAmount: 0,
          guaranteeReturned: 0,
          hasReserves: false,
          ongoingTasksTransferred: false,
          invoicesPaid: false,
          equipmentReturned: false,
          accessRevoked: false
        },
        events: [
          {
            timestamp: now,
            author: auth.currentUser.displayName || 'Bailleur',
            role: initiator,
            action: 'Procédure initiée',
            details: `Notification formelle de préavis (${noticeDurationMonths} mois). Échéance calculée : ${calculatedEndDate}`
          }
        ],
        comments: [],
        createdAt: now,
        updatedAt: now
      };

      await addDoc(collection(db, 'termination_procedures'), newProcedureData);

      // If rental contract exists, update its status to 'En préavis'
      if (contractId) {
        await updateDoc(doc(db, 'contracts', contractId), {
          status: 'En préavis',
          updatedAt: now
        }).catch(() => {});
      }

      toast.success("Procédure de préavis enregistrée avec succès !");
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la création de la procédure.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-7 border border-gray-100 dark:border-gray-700 my-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-base">
                Initier un Préavis / Résiliation
              </h3>
              <p className="text-xs text-gray-500">Conformité légale et calcul des délais</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Type de procédure</label>
            <select
              value={procedureType}
              onChange={e => handleProcedureTypeChange(e.target.value as ProcedureType)}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
            >
              <option value="preavis_location">Préavis de bail de location (Congé)</option>
              <option value="resiliation_technicien">Résiliation contrat de prestation technicien</option>
              <option value="accord_amiable">Résiliation d'un commun accord (Accord amiable)</option>
              <option value="manquement_contractuel">Procédure pour manquement contractuel</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {procedureType === 'resiliation_technicien' ? 'Technicien concerné' : 'Locataire concerné'}
              </label>
              <select
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              >
                {procedureType === 'resiliation_technicien'
                  ? technicians.map(t => <option key={t.id} value={t.id}>{t.name} ({t.specialty})</option>)
                  : tenants.map(t => <option key={t.id} value={t.id}>{t.name} - {t.address || 'Logement'}</option>)
                }
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Partie à l'initiative</label>
              <select
                value={initiator}
                onChange={e => setInitiator(e.target.value as any)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              >
                <option value="landlord">Le Bailleur / Gestionnaire</option>
                {procedureType === 'resiliation_technicien' ? (
                  <option value="technician">Le Technicien</option>
                ) : (
                  <option value="tenant">Le Locataire</option>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Date de notification</label>
              <input
                type="date"
                value={notificationDate}
                onChange={e => setNotificationDate(e.target.value)}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Durée du préavis</label>
              <select
                value={noticeDurationMonths}
                onChange={e => setNoticeDurationMonths(Number(e.target.value))}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              >
                <option value={1}>1 mois (Dérogatoire / Prestation)</option>
                <option value={2}>2 mois</option>
                <option value={3}>3 mois (Légal RDC - Habitation)</option>
                <option value={6}>6 mois (Bail commercial)</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
            <strong>Échéance légale calculée :</strong> {format(parseISO(calculatedEndDate), 'dd MMMM yyyy', { locale: fr })} (Fin de mois civil)
          </div>

          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Motif formel signifié</label>
            <textarea
              rows={2}
              placeholder="Ex: Fin de bail, reprise personnelle pour occupation, déménagement du locataire, fin de contrat de chantier..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white resize-none"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Fondement juridique / contractuel</label>
            <input
              type="text"
              value={legalBasis}
              onChange={e => setLegalBasis(e.target.value)}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white text-xs"
            />
          </div>

          <div className="pt-3 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md disabled:opacity-50"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer le préavis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal to execute Exit Checklist, inventory, and close the contract
 */
function ClosureChecklistModal({ procedure, onClose }: { procedure: TerminationProcedure, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState({ ...procedure.closureChecklist });
  const [currentStatus, setCurrentStatus] = useState<ProcedureStatus>(procedure.status);
  const isRental = procedure.procedureType !== 'resiliation_technicien';

  const handleSave = async (markAsClosed: boolean = false) => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const newStatus = markAsClosed ? 'Terminé' : currentStatus;

      const updateData: any = {
        closureChecklist: checklist,
        status: newStatus,
        updatedAt: now
      };

      if (markAsClosed) {
        updateData.closedAt = now;
      }

      await updateDoc(doc(db, 'termination_procedures', procedure.id), updateData);

      // If contract exists and marked closed, close contract
      if (procedure.contractId && markAsClosed) {
        await updateDoc(doc(db, 'contracts', procedure.contractId), {
          status: 'Résilié',
          updatedAt: now
        }).catch(() => {});
      }

      // If technician, deactivate technician account
      if (procedure.technicianId && markAsClosed && checklist.accessRevoked) {
        await updateDoc(doc(db, 'technicians', procedure.technicianId), {
          status: 'Inactif',
          updatedAt: now
        }).catch(() => {});
      }

      toast.success(markAsClosed ? "Procédure clôturée avec succès !" : "Bilan mis à jour !");
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-7 border border-gray-100 dark:border-gray-700 my-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700 mb-4">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-indigo-600" />
              Bilan de Clôture & Décompte
            </h3>
            <p className="text-xs text-gray-500">{procedure.targetName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs sm:text-sm">
          {/* Status selector */}
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Statut actuel du dossier</label>
            <select
              value={currentStatus}
              onChange={e => setCurrentStatus(e.target.value as ProcedureStatus)}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white font-medium"
            >
              <option value="Préavis en cours">Préavis en cours</option>
              <option value="Fin de contrat programmée">Fin de contrat programmée</option>
              <option value="En cours de clôture">En cours de clôture</option>
              <option value="Contesté">Contesté</option>
              <option value="En négociation">En négociation</option>
              <option value="Accord amiable">Accord amiable</option>
              <option value="Terminé">Terminé (Clôturé)</option>
              <option value="Annulé">Annulé</option>
            </select>
          </div>

          {/* Checklist items */}
          <div className="space-y-2.5 bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="font-bold text-gray-900 dark:text-white text-xs uppercase tracking-wider mb-2">
              Points de contrôle obligatoires :
            </p>

            {isRental ? (
              <>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.rentPaidUpToDate}
                    onChange={e => setChecklist({ ...checklist, rentPaidUpToDate: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Loyers payés et arriérés soldés</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.chargesSettled}
                    onChange={e => setChecklist({ ...checklist, chargesSettled: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Charges locatives (Eau, Snel, Syndic) réglées</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.inventoryExitDone}
                    onChange={e => setChecklist({ ...checklist, inventoryExitDone: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>État des lieux contradictoire de sortie réalisé</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.keysReturned}
                    onChange={e => setChecklist({ ...checklist, keysReturned: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Restitution intégrale des clés et télécommandes</span>
                </label>

                {/* Financial breakdown for guarantee deposit */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700/80 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-500">Caution consignée ($)</label>
                      <input
                        type="number"
                        value={checklist.guaranteeAmount}
                        onChange={e => setChecklist({ ...checklist, guaranteeAmount: Number(e.target.value) })}
                        className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500">Retenue dégradations ($)</label>
                      <input
                        type="number"
                        value={checklist.damageCost}
                        onChange={e => setChecklist({ 
                          ...checklist, 
                          damageCost: Number(e.target.value),
                          damagesIdentified: Number(e.target.value) > 0,
                          guaranteeReturned: Math.max(0, checklist.guaranteeAmount - Number(e.target.value))
                        })}
                        className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-gray-500">Caution nette restituée au locataire ($)</label>
                    <input
                      type="number"
                      value={checklist.guaranteeReturned}
                      onChange={e => setChecklist({ ...checklist, guaranteeReturned: Number(e.target.value) })}
                      className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-emerald-600"
                    />
                  </div>
                </div>

                {/* Reserves */}
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist.hasReserves}
                      onChange={e => setChecklist({ ...checklist, hasReserves: e.target.checked })}
                      className="w-4 h-4 rounded text-red-600"
                    />
                    <span className="text-red-700 dark:text-red-400 font-semibold text-xs">Clôture assortie de réserves (Litige en cours)</span>
                  </label>
                  {checklist.hasReserves && (
                    <input
                      type="text"
                      placeholder="Préciser les réserves..."
                      value={checklist.reserveNotes || ''}
                      onChange={e => setChecklist({ ...checklist, reserveNotes: e.target.value })}
                      className="mt-1 w-full p-2 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-lg text-xs"
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.ongoingTasksTransferred}
                    onChange={e => setChecklist({ ...checklist, ongoingTasksTransferred: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Interventions en cours clôturées ou réassignées</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.invoicesPaid}
                    onChange={e => setChecklist({ ...checklist, invoicesPaid: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Factures et honoraires de prestation soldés</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.equipmentReturned}
                    onChange={e => setChecklist({ ...checklist, equipmentReturned: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Matériel, outillage et badges restitués</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checklist.accessRevoked}
                    onChange={e => setChecklist({ ...checklist, accessRevoked: e.target.checked })}
                    className="w-4 h-4 rounded text-red-600"
                  />
                  <span>Désactiver le code d'accès au portail technicien</span>
                </label>
              </>
            )}
          </div>

          {/* Export PV button */}
          <button
            type="button"
            onClick={() => generateClosureInventoryPDF(procedure)}
            className="w-full py-2.5 px-4 bg-slate-100 dark:bg-gray-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 rounded-xl font-bold flex items-center justify-center gap-2 text-xs"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger le PV de Clôture Officiel PDF</span>
          </button>

          {/* Action buttons */}
          <div className="pt-3 flex gap-2">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={loading}
              className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 text-xs"
            >
              Enregistrer modifications
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={loading}
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all shadow-md text-xs"
            >
              Valider Clôture Définitive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal for Event history & Messages
 */
function EventsModal({ procedure, onClose }: { procedure: TerminationProcedure, onClose: () => void }) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !auth.currentUser) return;
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const newComment = {
        id: `c_${Date.now()}`,
        authorName: auth.currentUser.displayName || 'Bailleur',
        authorRole: 'landlord' as const,
        message: commentText.trim(),
        createdAt: now
      };

      const newEvent = {
        timestamp: now,
        author: auth.currentUser.displayName || 'Bailleur',
        role: 'landlord' as const,
        action: 'Message consigné',
        details: commentText.trim()
      };

      await updateDoc(doc(db, 'termination_procedures', procedure.id), {
        comments: [...(procedure.comments || []), newComment],
        events: [...(procedure.events || []), newEvent],
        updatedAt: now
      });

      setCommentText('');
      toast.success("Message enregistré dans l'historique officiel.");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'envoi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-gray-100 dark:border-gray-700 my-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700 mb-4">
          <h3 className="font-bold text-gray-900 dark:text-white text-base">
            Journal des Événements & Échanges
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {procedure.events && procedure.events.length > 0 ? (
            procedure.events.map((ev, idx) => (
              <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-100 dark:border-gray-800 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900 dark:text-white">{ev.action}</span>
                  <span className="text-[10px] text-gray-400">{format(parseISO(ev.timestamp), 'dd/MM/yyyy HH:mm')}</span>
                </div>
                <p className="text-gray-600 dark:text-gray-300">{ev.details}</p>
                <span className="text-[10px] text-blue-600 font-semibold block">{ev.author} ({ev.role})</span>
              </div>
            ))
          ) : (
            <p className="text-center text-xs text-gray-400 py-4">Aucun événement consigné pour le moment.</p>
          )}
        </div>

        <form onSubmit={handleAddComment} className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex gap-2">
          <input
            type="text"
            placeholder="Consigner un message, accord ou contestation..."
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            className="flex-1 p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white outline-none"
          />
          <button
            type="submit"
            disabled={submitting || !commentText.trim()}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
          >
            Consigner
          </button>
        </form>
      </div>
    </div>
  );
}
