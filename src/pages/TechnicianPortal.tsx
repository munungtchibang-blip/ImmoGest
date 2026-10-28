import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, getDocs, where } from 'firebase/firestore';
import { db, auth, logout } from '../lib/firebase';
import { 
  Wrench, 
  CheckCircle2, 
  Clock, 
  Calendar as CalendarIcon, 
  Camera, 
  FileText, 
  Check, 
  LogOut, 
  Building2, 
  MapPin, 
  Search, 
  FileCheck2,
  PackageCheck,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { PhotoModal } from '../components/PhotoModal';

interface TechnicianPortalProps {
  onSwitchRole?: () => void;
}

export function TechnicianPortal({ onSwitchRole }: TechnicianPortalProps = {}) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'history' | 'calendar' | 'account'>('tasks');
  const [interventions, setInterventions] = useState<any[]>([]);
  const [techProcedures, setTechProcedures] = useState<any[]>([]);
  const currentUser = auth.currentUser;

  // Independent technician session
  const [techSession, setTechSession] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('technician_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(() => Boolean(auth.currentUser || localStorage.getItem('technician_session')));
  const [selectedIntervention, setSelectedIntervention] = useState<any | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [photoToView, setPhotoToView] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [codeChecking, setCodeChecking] = useState(false);

  // Report Form state
  const [reportText, setReportText] = useState('');
  const [partsUsed, setPartsUsed] = useState('');
  const [partsCost, setPartsCost] = useState('');
  const [interventionDuration, setInterventionDuration] = useState('');
  const [beforePhotos, setBeforePhotos] = useState<string[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quote Submission Form state
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteTarget, setQuoteTarget] = useState<any | null>(null);
  const [quoteLaborCost, setQuoteLaborCost] = useState('');
  const [quotePartsCost, setQuotePartsCost] = useState('');
  const [quoteTravelCost, setQuoteTravelCost] = useState('');
  const [quotePartsDescription, setQuotePartsDescription] = useState('');
  const [quoteDiagnostic, setQuoteDiagnostic] = useState('');
  const [quoteCurrency, setQuoteCurrency] = useState<'USD' | 'CDF'>('USD');
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);

  const handleVerifyAccessCode = async (code: string) => {
    if (!code.trim()) return;
    setCodeChecking(true);
    try {
      const q = query(collection(db, 'technicians'), where('accessCode', '==', code.trim().toUpperCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const raw = snap.docs[0].data();
        const data: any = { id: snap.docs[0].id, ...raw };
        setTechSession(data);
        localStorage.setItem('technician_session', JSON.stringify(data));
        toast.success(`Bienvenue, ${data.name || 'Technicien'} ! Accès autorisé.`);
      } else {
        toast.error("Code d'accès non reconnu ou invalide.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erreur de connexion.");
    } finally {
      setCodeChecking(false);
    }
  };

  // Check URL param ?code=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam && (!techSession || techSession.accessCode !== codeParam)) {
      setTimeout(() => {
        handleVerifyAccessCode(codeParam);
      }, 0);
    }
  }, [techSession]);

  useEffect(() => {
    // Determine technician identity: either logged in firebase user or authenticated tech session
    const effectiveId = techSession?.id || currentUser?.uid;
    const effectivePhone = techSession?.phone || currentUser?.phoneNumber || '';
    const effectiveName = techSession?.name || '';
    const userEmail = currentUser?.email || techSession?.email || '';

    if (!effectiveId && !techSession && !currentUser) {
      setTimeout(() => {
        setLoading(false);
      }, 0);
      return;
    }

    const q = query(collection(db, 'maintenance'));
    const unsub = onSnapshot(q, (snapshot) => {
      const allDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const techTickets = allDocs.filter((t: any) => {
        if (effectiveId && t.assignedTechnicianId === effectiveId) return true;
        if (effectiveName && t.assignedTechnicianName === effectiveName) return true;
        if (effectivePhone && t.assignedTechnicianPhone === effectivePhone) return true;
        if (userEmail && t.assignedTechnicianEmail === userEmail) return true;
        // Also allow unassigned tickets for landlord of this technician
        if (techSession?.landlordId && t.landlordId === techSession.landlordId && (!t.assignedTechnicianId || t.status === 'Nouvelle')) return true;
        return false;
      });

      techTickets.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setInterventions(techTickets);
      setLoading(false);
    }, (err) => {
      console.error("Erreur chargement interventions technicien:", err);
      setLoading(false);
    });

    const qProc = query(collection(db, 'termination_procedures'));
    const unsubProc = onSnapshot(qProc, (pSnap) => {
      const allProc = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const matching = allProc.filter((p: any) => 
        (effectiveId && p.technicianId === effectiveId) ||
        (effectiveName && p.targetName?.toLowerCase() === effectiveName?.toLowerCase()) ||
        (effectivePhone && p.targetPhone === effectivePhone)
      );
      setTechProcedures(matching);
    }, (err) => {
      console.warn("Erreur chargement procédures technicien:", err);
    });

    return () => {
      unsub();
      unsubProc();
    };
  }, [currentUser, techSession]);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Status badge styling helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Nouvelle':
      case 'En attente d\'acceptation':
        return { label: status || 'Nouvelle', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200' };
      case 'Acceptée':
        return { label: 'Acceptée', bg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200' };
      case 'En cours':
        return { label: 'En cours de travaux', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200' };
      case 'En attente de pièces':
        return { label: 'En attente de pièces', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200' };
      case 'Terminée':
        return { label: 'Terminée (En attente validation)', bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200' };
      case 'Clôturée':
      case 'Résolu':
        return { label: 'Clôturée & Validée', bg: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border-gray-200' };
      default:
        return { label: status || 'En attente', bg: 'bg-blue-100 text-blue-800' };
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'Urgente':
        return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200';
      case 'Haute':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200';
      case 'Moyenne':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200';
    }
  };

  // Filtered interventions
  const filteredInterventions = useMemo(() => {
    return interventions.filter(item => {
      const matchesSearch = 
        (item.ticketNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.propertyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.tenantName || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (filterStatus === 'all') return true;
      if (filterStatus === 'active') {
        return ['Nouvelle', 'En attente', 'En attente d\'acceptation', 'Acceptée', 'En cours', 'En attente de pièces'].includes(item.status);
      }
      if (filterStatus === 'done') {
        return ['Terminée', 'Clôturée', 'Résolu'].includes(item.status);
      }
      return item.status === filterStatus;
    });
  }, [interventions, searchTerm, filterStatus]);

  // Calendar events
  const calendarInterventions = useMemo(() => {
    return interventions.filter(i => i.scheduledDate || i.createdAt);
  }, [interventions]);

  // Handlers for Technician actions
  const handleAcceptIntervention = async (item: any) => {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'maintenance', item.id), {
        status: 'Acceptée',
        assignedTechnicianId: currentUser?.uid || '',
        assignedTechnicianName: currentUser?.displayName || 'Technicien de maintenance',
        assignedTechnicianPhone: currentUser?.phoneNumber || '',
        acceptedAt: now,
        updatedAt: now
      });
      toast.success("Intervention acceptée avec succès !");
      if (selectedIntervention?.id === item.id) {
        setSelectedIntervention((prev: any) => ({ ...prev, status: 'Acceptée', acceptedAt: now }));
      }
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'acceptation.");
    }
  };

  const handleStartWork = async (item: any) => {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'maintenance', item.id), {
        status: 'En cours',
        startedAt: now,
        updatedAt: now
      });
      toast.success("Travaux démarrés ! Statut passé en 'En cours'.");
      if (selectedIntervention?.id === item.id) {
        setSelectedIntervention((prev: any) => ({ ...prev, status: 'En cours', startedAt: now }));
      }
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du démarrage des travaux.");
    }
  };

  const handleSetWaitingParts = async (item: any) => {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'maintenance', item.id), {
        status: 'En attente de pièces',
        updatedAt: now
      });
      toast.success("Intervention marquée : En attente de pièces de rechange.");
      if (selectedIntervention?.id === item.id) {
        setSelectedIntervention((prev: any) => ({ ...prev, status: 'En attente de pièces' }));
      }
    } catch (e) {
      console.error(e);
      toast.error("Erreur de mise à jour.");
    }
  };

  const openReportModal = (item: any) => {
    setSelectedIntervention(item);
    setReportText(item.technicianNotes || '');
    setPartsUsed(item.partsUsed || '');
    setPartsCost(item.partsCost ? String(item.partsCost) : '');
    setInterventionDuration(item.duration || '');
    setShowReportModal(true);
  };

  const openQuoteModal = (item: any) => {
    setQuoteTarget(item);
    setQuoteLaborCost(item.quote?.laborCost ? String(item.quote.laborCost) : '');
    setQuotePartsCost(item.quote?.partsCost ? String(item.quote.partsCost) : '');
    setQuoteTravelCost(item.quote?.travelCost ? String(item.quote.travelCost) : '');
    setQuotePartsDescription(item.quote?.partsDescription || '');
    setQuoteDiagnostic(item.quote?.diagnostic || '');
    setQuoteCurrency(item.quote?.currency || 'USD');
    setShowQuoteModal(true);
  };

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteTarget) return;

    const parts = Number(quotePartsCost) || 0;
    const labor = Number(quoteLaborCost) || 0;
    const travel = Number(quoteTravelCost) || 0;
    const total = parts + labor + travel;

    if (total <= 0) {
      toast.error("Veuillez renseigner un montant pour le devis.");
      return;
    }

    setQuoteSubmitting(true);
    try {
      await updateDoc(doc(db, 'maintenance', quoteTarget.id), {
        status: 'Devis soumis',
        quote: {
          partsCost: parts,
          partsDescription: quotePartsDescription.trim(),
          laborCost: labor,
          travelCost: travel,
          totalCost: total,
          currency: quoteCurrency,
          diagnostic: quoteDiagnostic.trim(),
          submittedAt: new Date().toISOString(),
          submittedBy: techSession?.name || currentUser?.displayName || 'Technicien'
        },
        estimatedCost: total,
        updatedAt: new Date().toISOString()
      });

      toast.success(`Devis de ${total} ${quoteCurrency} soumis au bailleur avec succès !`);
      setShowQuoteModal(false);
    } catch (err: any) {
      console.error("Erreur transmission devis:", err);
      toast.error("Impossible de transmettre le devis.");
    } finally {
      setQuoteSubmitting(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      toast.error("La photo dépasse 4 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (type === 'before') {
        setBeforePhotos(prev => [...prev, base64]);
      } else {
        setAfterPhotos(prev => [...prev, base64]);
      }
      toast.success(`Photo ${type === 'before' ? 'Avant' : 'Après'} ajoutée.`);
    };
    reader.readAsDataURL(file);
  };

  const submitInterventionReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIntervention) return;
    setIsSubmitting(true);

    try {
      const now = new Date().toISOString();
      const numPartsCost = partsCost ? Number(partsCost) : 0;

      const updateData: any = {
        status: 'Terminée',
        technicianNotes: reportText,
        partsUsed: partsUsed,
        partsCost: numPartsCost,
        duration: interventionDuration,
        completedAt: now,
        updatedAt: now
      };

      if (afterPhotos.length > 0) {
        updateData.afterPhotos = afterPhotos;
      }
      if (beforePhotos.length > 0) {
        updateData.beforePhotos = beforePhotos;
      }

      await updateDoc(doc(db, 'maintenance', selectedIntervention.id), updateData);
      toast.success("Rapport transmis ! L'intervention est déclarée Terminée.");
      setShowReportModal(false);
      setSelectedIntervention(null);
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la transmission du rapport.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentUser && !techSession) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-sm w-full p-7 border border-gray-100 dark:border-gray-700 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/20">
            <Wrench className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-gray-900 dark:text-white">Portail Technicien Agréé</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-5">
            Espace d'intervention sur site. Entrez le code d'accès communiqué par votre propriétaire ou agence immobilière.
          </p>

          <form onSubmit={(e) => { e.preventDefault(); handleVerifyAccessCode(accessCodeInput); }} className="space-y-3.5">
            <div>
              <input
                type="text"
                placeholder="Ex: TECH-4892"
                value={accessCodeInput}
                onChange={e => setAccessCodeInput(e.target.value.toUpperCase())}
                className="w-full text-center text-lg font-mono font-bold tracking-widest p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 dark:text-white"
                required
              />
            </div>

            <button
              type="submit"
              disabled={codeChecking}
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{codeChecking ? 'Vérification...' : 'Accéder à mes interventions'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="text-[11px] text-gray-400 mt-5">
            Vous pouvez également cliquer directement sur le lien reçu par WhatsApp ou SMS.
          </p>
        </div>
      </div>
    );
  }

  const handleTechnicianLogout = () => {
    localStorage.removeItem('technician_session');
    setTechSession(null);
    if (currentUser) {
      logout();
    }
    if (onSwitchRole) {
      onSwitchRole();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col antialiased transition-colors duration-200">
      
      {/* Top Professional Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white flex items-center justify-center shadow-md">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-gray-900 dark:text-white">ImmoGest</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                  Technicien Pro
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {techSession ? `${techSession.name} (${techSession.specialty})` : 'Espace Interventions & Maintenance sur site'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTechnicianLogout}
              className="p-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              title="Déconnexion"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1 sm:gap-4 border-t border-gray-100 dark:border-gray-800 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`py-3 px-3 text-xs sm:text-sm font-extrabold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'tasks'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400 dark:border-amber-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Mes Interventions</span>
            {interventions.filter(i => ['Nouvelle', 'En attente', 'En cours', 'Acceptée'].includes(i.status)).length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {interventions.filter(i => ['Nouvelle', 'En attente', 'En cours', 'Acceptée'].includes(i.status)).length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-3 text-xs sm:text-sm font-extrabold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'history'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400 dark:border-amber-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Historique & Rapports</span>
          </button>

          <button
            onClick={() => setActiveTab('calendar')}
            className={`py-3 px-3 text-xs sm:text-sm font-extrabold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'calendar'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400 dark:border-amber-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Planning des travaux</span>
          </button>

          <button
            onClick={() => setActiveTab('account')}
            className={`py-3 px-3 text-xs sm:text-sm font-extrabold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'account'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400 dark:border-amber-400'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Mon Profil</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">

        {/* ======================================================== */}
        {/* TAB: TASKS (INTERVENTIONS ATTRIBUÉES) */}
        {/* ======================================================== */}
        {activeTab === 'tasks' && (
          <div className="space-y-6 tab-enter">

            {/* Active Contract Termination / Handover Card */}
            {techProcedures.length > 0 && (
              <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-500/30 rounded-3xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    <span className="font-extrabold text-sm text-gray-900 dark:text-white">
                      Procédure de fin de contrat de prestation
                    </span>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                    {techProcedures[0].status}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Échéance de fin de mission : <strong>{techProcedures[0].confirmedEndDate ? new Date(techProcedures[0].confirmedEndDate).toLocaleDateString('fr-FR') : 'À convenir'}</strong>. Motif : {techProcedures[0].reason}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center gap-1.5">
                    {techProcedures[0].closureChecklist?.ongoingTasksTransferred ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                    <span>Tâches transférées</span>
                  </div>
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center gap-1.5">
                    {techProcedures[0].closureChecklist?.invoicesPaid ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                    <span>Factures réglées</span>
                  </div>
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center gap-1.5">
                    {techProcedures[0].closureChecklist?.equipmentReturned ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                    <span>Outils restitués</span>
                  </div>
                  <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center gap-1.5">
                    {techProcedures[0].closureChecklist?.accessRevoked ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                    <span>Accès révoqué</span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs card-enter">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Assignées</span>
                <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{interventions.length}</p>
                <p className="text-[10px] text-gray-500">Toutes catégories</p>
              </div>

              <div className="p-4 bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border border-amber-200/60 dark:border-amber-800/40 shadow-xs card-enter">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">À Réaliser</span>
                <p className="text-2xl font-black text-amber-900 dark:text-amber-300 mt-1">
                  {interventions.filter(i => ['Nouvelle', 'En attente', 'Acceptée', 'En cours'].includes(i.status)).length}
                </p>
                <p className="text-[10px] text-amber-600">Interventions actives</p>
              </div>

              <div className="p-4 bg-blue-50/70 dark:bg-blue-950/30 rounded-2xl border border-blue-200/60 dark:border-blue-800/40 shadow-xs card-enter">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">En Cours</span>
                <p className="text-2xl font-black text-blue-900 dark:text-blue-300 mt-1">
                  {interventions.filter(i => i.status === 'En cours').length}
                </p>
                <p className="text-[10px] text-blue-600">Travaux engagés</p>
              </div>

              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40 shadow-xs card-enter">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Terminées</span>
                <p className="text-2xl font-black text-emerald-900 dark:text-emerald-300 mt-1">
                  {interventions.filter(i => ['Terminée', 'Clôturée', 'Résolu'].includes(i.status)).length}
                </p>
                <p className="text-[10px] text-emerald-600">Livrées ou validées</p>
              </div>
            </div>

            {/* Filter and Search Controls */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher par n° dossier, panne, logement..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs sm:text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto hide-scrollbar">
                {[
                  { id: 'all', label: 'Toutes' },
                  { id: 'active', label: 'À Traiter' },
                  { id: 'En cours', label: 'En cours' },
                  { id: 'En attente de pièces', label: 'Attente pièces' },
                  { id: 'done', label: 'Terminées' },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilterStatus(f.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      filterStatus === f.id
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List of Interventions */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse"></div>
                ))}
              </div>
            ) : filteredInterventions.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-8 space-y-3">
                <div className="w-14 h-14 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
                  <PackageCheck className="w-7 h-7" />
                </div>
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Aucune intervention correspondante</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                  Vous n'avez aucune intervention assignée sous ce filtre pour l'instant. Votre planning est à jour !
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInterventions.map((item) => {
                  const statusInfo = getStatusBadge(item.status);
                  const isFinished = ['Terminée', 'Clôturée', 'Résolu'].includes(item.status);
                  const ticketRef = item.ticketNumber || `INT-${item.id.substring(0, 6).toUpperCase()}`;

                  return (
                    <div
                      key={item.id}
                      className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-xs hover:border-amber-300 dark:hover:border-amber-700/80 transition-all card-enter"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/60 pb-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 rounded-lg border border-amber-200/50">
                            #{ticketRef}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${statusInfo.bg}`}>
                            {statusInfo.label}
                          </span>
                          {item.priority && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getPriorityBadge(item.priority)}`}>
                              Priorité : {item.priority}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Signalé le {item.createdAt ? format(new Date(item.createdAt), 'dd MMMM yyyy', { locale: fr }) : 'Récemment'}
                        </span>
                      </div>

                      {/* Details of Issue */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 space-y-2">
                          <h4 className="text-sm font-extrabold text-gray-900 dark:text-white break-words">
                            {item.title ? `${item.title} : ` : ''}{item.description}
                          </h4>

                          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-300">
                              <Building2 className="w-3.5 h-3.5 text-amber-600" />
                              {item.propertyName || 'Bien locatif'}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              {item.tenantName ? `Locataire: ${item.tenantName}` : 'Logement occupé'}
                            </span>
                          </div>

                          {item.notes && (
                            <div className="p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800 text-xs text-gray-600 dark:text-gray-300">
                              <span className="font-bold text-gray-800 dark:text-gray-200">Consigne Bailleur : </span>
                              {item.notes}
                            </div>
                          )}

                          {item.technicianNotes && (
                            <div className="p-2.5 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200">
                              <span className="font-bold">Dernier rapport technicien : </span>
                              {item.technicianNotes}
                            </div>
                          )}
                        </div>

                        {/* Photos & Actions */}
                        <div className="flex flex-col justify-between items-start md:items-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100 dark:border-gray-800">
                          {item.photoUrl && (
                            <button
                              onClick={() => setPhotoToView(item.photoUrl)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Photo constat</span>
                            </button>
                          )}

                          {/* Workflow Action Buttons */}
                          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            {(!item.status || item.status === 'Nouvelle' || item.status === 'En attente') && (
                              <button
                                onClick={() => handleAcceptIntervention(item)}
                                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Accepter</span>
                              </button>
                            )}

                            {(!item.status || ['Nouvelle', 'En attente', 'Acceptée', 'Devis soumis'].includes(item.status)) && (
                              <button
                                onClick={() => openQuoteModal(item)}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-xl text-xs font-bold border border-blue-200 dark:border-blue-700 cursor-pointer flex items-center gap-1 transition-all"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>{item.quote ? `Devis (${item.quote.totalCost} ${item.quote.currency || '$'})` : "Soumettre un devis"}</span>
                              </button>
                            )}

                            {item.status === 'Acceptée' && (
                              <button
                                onClick={() => handleStartWork(item)}
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Démarrer les travaux</span>
                              </button>
                            )}

                            {(item.status === 'En cours' || item.status === 'En attente de pièces') && (
                              <>
                                {item.status === 'En cours' && (
                                  <button
                                    onClick={() => handleSetWaitingParts(item)}
                                    className="px-2.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                                  >
                                    Attente pièces
                                  </button>
                                )}
                                <button
                                  onClick={() => openReportModal(item)}
                                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Finaliser le rapport</span>
                                </button>
                              </>
                            )}

                            {isFinished && (
                              <button
                                onClick={() => openReportModal(item)}
                                className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Consulter rapport</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB: HISTORY (INTERVENTIONS TERMINÉES ET CLÔTURÉES) */}
        {/* ======================================================== */}
        {activeTab === 'history' && (
          <div className="space-y-4 tab-enter">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Registre des Interventions Effectuées</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Historique complet des dépannages réalisés et validés par les gestionnaires.
              </p>
            </div>

            <div className="space-y-3">
              {interventions.filter(i => ['Terminée', 'Clôturée', 'Résolu'].includes(i.status)).map(item => (
                <div key={item.id} className="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs card-enter space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-gray-600 dark:text-gray-300">
                      #{item.ticketNumber || item.id.substring(0, 8).toUpperCase()}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {item.status === 'Clôturée' ? 'Clôturée par la gérance' : 'Terminée par le technicien'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">{item.description}</h4>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Bien : {item.propertyName || 'N/A'}</span>
                    <span>Durée : {item.duration || 'Non précisée'}</span>
                    {item.partsCost !== undefined && <span>Fournitures : {item.partsCost} $</span>}
                  </div>
                  {item.technicianNotes && (
                    <p className="text-xs italic text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-xl">
                      « {item.technicianNotes} »
                    </p>
                  )}
                </div>
              ))}
              {interventions.filter(i => ['Terminée', 'Clôturée', 'Résolu'].includes(i.status)).length === 0 && (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
                  <p className="text-xs text-gray-400">Aucune intervention terminée pour le moment.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB: CALENDAR (PLANNING DES TRAVAUX) */}
        {/* ======================================================== */}
        {activeTab === 'calendar' && (
          <div className="space-y-4 tab-enter">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Planning & Tournées de Réparation</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Calendrier des interventions planifiées avec adresses et urgences.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {calendarInterventions.map(ci => (
                <div key={ci.id} className="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs card-enter space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      {ci.scheduledDate || (ci.createdAt ? format(new Date(ci.createdAt), 'dd MMMM yyyy', { locale: fr }) : 'Date à convenir')}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">
                      {ci.status}
                    </span>
                  </div>

                  <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white break-words">{ci.description}</h4>

                  <div className="text-xs text-gray-500 space-y-1">
                    <p className="flex items-center gap-1 text-gray-700 dark:text-gray-300 font-semibold">
                      <Building2 className="w-3 h-3 text-amber-600" />
                      {ci.propertyName || 'Bien locatif'}
                    </p>
                    <p className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-gray-400" />
                      {ci.tenantName ? `Locataire : ${ci.tenantName}` : 'Logement client'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB: ACCOUNT (MON PROFIL TECHNICIEN) */}
        {/* ======================================================== */}
        {activeTab === 'account' && (
          <div className="max-w-lg mx-auto bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-5 tab-enter">
            <div className="flex items-center gap-4 border-b border-gray-100 dark:border-gray-700 pb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white flex items-center justify-center text-xl font-black shadow-md">
                {currentUser?.displayName?.charAt(0) || 'T'}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white">{currentUser?.displayName || 'Technicien Prestataire'}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{currentUser?.email || 'technicien@imomgest.cd'}</p>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  Technicien Agréé ImmoGest
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-800">
                <span className="text-gray-500">ID Intervenant :</span>
                <span className="font-mono font-bold">{currentUser?.uid.substring(0, 12)}...</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-800">
                <span className="text-gray-500">Rôle applicatif :</span>
                <span className="font-bold text-amber-600">technician</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-800">
                <span className="text-gray-500">Interventions traitées :</span>
                <span className="font-bold text-gray-900 dark:text-white">{interventions.length}</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={toggleDarkMode}
                className="w-full py-2.5 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Mode Sombre / Clair
              </button>

              <button
                onClick={() => logout()}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>Se déconnecter</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ======================================================== */}
      {/* MODAL: RAPPORT D'INTERVENTION TECHNICIEN */}
      {/* ======================================================== */}
      {showReportModal && selectedIntervention && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 tab-enter">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Rapport Technique</span>
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                  Dossier #{selectedIntervention.ticketNumber || selectedIntervention.id.substring(0, 6).toUpperCase()}
                </h3>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitInterventionReport} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Rapport des travaux & Diagnostic *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Expliquez en détail l'origine de la panne, les réparations effectuées et vos conseils d'utilisation..."
                  value={reportText}
                  onChange={e => setReportText(e.target.value)}
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Pièces de rechange utilisées
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Joint 1/2, disjoncteur 16A"
                    value={partsUsed}
                    onChange={e => setPartsUsed(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Coût des pièces ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={partsCost}
                    onChange={e => setPartsCost(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Durée de l'intervention
                </label>
                <input
                  type="text"
                  placeholder="Ex: 1h30, 2 jours"
                  value={interventionDuration}
                  onChange={e => setInterventionDuration(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
                />
              </div>

              {/* Photos Avant / Après */}
              <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <span className="font-extrabold text-gray-900 dark:text-white">Photos de l'intervention</span>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <Camera className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">+ Photo Avant</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(e, 'before')} />
                  </label>

                  <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <Camera className="w-5 h-5 text-emerald-500 mb-1" />
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">+ Photo Après</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handlePhotoUpload(e, 'after')} />
                  </label>
                </div>

                {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
                  <div className="flex gap-2 overflow-x-auto py-2">
                    {beforePhotos.map((p, i) => (
                      <img key={i} src={p} alt="Avant" className="w-14 h-14 object-cover rounded-xl border border-gray-200" />
                    ))}
                    {afterPhotos.map((p, i) => (
                      <img key={i} src={p} alt="Après" className="w-14 h-14 object-cover rounded-xl border-2 border-emerald-500" />
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Envoi...' : 'Transmettre & Clôturer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quote Submission Modal */}
      {showQuoteModal && quoteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 text-xs sm:text-sm border border-gray-100 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-gray-900 dark:text-white text-base">
                    Devis de Réparation
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Dossier #{quoteTarget.ticketNumber || quoteTarget.id.substring(0, 6).toUpperCase()} • {quoteTarget.propertyName || 'Bien locatif'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQuoteModal(false)}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitQuote} className="space-y-4">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Diagnostic technique préliminaire
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Ex: Fuite au niveau de la pipe d'évacuation WC, robinet d'arrêt bloqué..."
                  value={quoteDiagnostic}
                  onChange={e => setQuoteDiagnostic(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Détail des pièces et fournitures requises
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Pipe WC PVC 100, joint à lèvre, téflon, mastic sanitaire..."
                  value={quotePartsDescription}
                  onChange={e => setQuotePartsDescription(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Coût fournitures
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={quotePartsCost}
                    onChange={e => setQuotePartsCost(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Main-d'œuvre
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={quoteLaborCost}
                    onChange={e => setQuoteLaborCost(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Déplacement
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={quoteTravelCost}
                    onChange={e => setQuoteTravelCost(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-blue-50 dark:bg-blue-900/30 rounded-2xl border border-blue-200 dark:border-blue-800">
                <div>
                  <span className="text-xs text-blue-900 dark:text-blue-200 font-bold">Devise du devis :</span>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setQuoteCurrency('USD')}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition-colors ${
                        quoteCurrency === 'USD'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      USD ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuoteCurrency('CDF')}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition-colors ${
                        quoteCurrency === 'CDF'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      CDF (Franc Congolais)
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-black text-blue-700 dark:text-blue-300">Montant Total</span>
                  <p className="text-xl font-black text-blue-900 dark:text-blue-100 font-mono">
                    {(Number(quotePartsCost) || 0) + (Number(quoteLaborCost) || 0) + (Number(quoteTravelCost) || 0)}{' '}
                    {quoteCurrency === 'USD' ? '$' : 'FC'}
                  </p>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowQuoteModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={quoteSubmitting}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  {quoteSubmitting ? 'Transmission...' : 'Soumettre le devis au bailleur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {photoToView && (
        <PhotoModal url={photoToView} onClose={() => setPhotoToView(null)} />
      )}
    </div>
  );
}
