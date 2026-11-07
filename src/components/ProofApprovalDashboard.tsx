import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc,
  updateDoc, 
  addDoc,
  writeBatch 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  Filter, 
  Eye, 
  Download, 
  FileText, 
  Image as ImageIcon, 
  Building, 
  User, 
  Copy, 
  Check, 
  AlertCircle, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  X, 
  ShieldCheck,
  HelpCircle
} from 'lucide-react';
import { downloadProofFile, formatFileSize } from '../services/storageService';
import toast from 'react-hot-toast';

export interface DashboardProof {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantEmail?: string;
  tenantPhone?: string;
  tenantUserId?: string;
  landlordId: string;
  propertyId?: string;
  propertyName?: string;
  unitNumber?: string;
  paymentId?: string | null;
  paymentType?: string;
  amount: number;
  currency?: string;
  paymentDate?: string;
  paymentMethod?: string;
  transactionReference?: string;
  comment?: string;
  comments?: string;
  proofUrl?: string;
  fileUrl?: string;
  files?: Array<{
    url: string;
    name: string;
    size: number;
    type: string;
    storagePath?: string;
  }>;
  fileCount?: number;
  status: 'En attente de vérification' | 'En cours de vérification' | 'Preuve acceptée' | 'Preuve rejetée' | 'Informations complémentaires demandées' | 'En attente' | 'Confirmé' | 'Rejeté';
  rejectionReason?: string;
  additionalInfoRequest?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  statusHistory?: Array<{
    fromStatus: string;
    toStatus: string;
    changedBy: string;
    changedAt: string;
    reason?: string;
    comment?: string;
  }>;
  createdAt: string;
  updatedAt?: string;
}

interface ProofApprovalDashboardProps {
  landlordId?: string;
  onProofUpdated?: () => void;
}

export const ProofApprovalDashboard: React.FC<ProofApprovalDashboardProps> = ({ 
  landlordId,
  onProofUpdated 
}) => {
  const [proofs, setProofs] = useState<DashboardProof[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals state
  const [approveModalProof, setApproveModalProof] = useState<DashboardProof | null>(null);
  const [approveComment, setApproveComment] = useState('');
  const [updatePaymentRecord, setUpdatePaymentRecord] = useState(true);
  const [isApproving, setIsApproving] = useState(false);

  const [rejectModalProof, setRejectModalProof] = useState<DashboardProof | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Lightbox Document Viewer
  const [activeViewerDoc, setActiveViewerDoc] = useState<{ url: string; name: string; type: string } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotationAngle, setRotationAngle] = useState(0);

  // Real-time listener for payment_proofs collection
  useEffect(() => {
    let q;
    if (landlordId) {
      q = query(collection(db, 'payment_proofs'), where('landlordId', '==', landlordId));
    } else {
      q = query(collection(db, 'payment_proofs'));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: DashboardProof[] = [];
        snapshot.forEach((d) => {
          loaded.push({ id: d.id, ...d.data() } as DashboardProof);
        });
        // Sort newest first
        loaded.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setProofs(loaded);
        setLoading(false);
      },
      (error) => {
        console.warn('Erreur chargement payment_proofs:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [landlordId]);

  // Helper to copy reference code
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Référence copiée !');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to resolve tenant Firebase Auth userId for notifications
  const resolveTenantAuthUid = async (tenantId: string, fallbackUserId?: string): Promise<string> => {
    if (fallbackUserId) return fallbackUserId;
    if (!tenantId) return '';
    try {
      const snap = await getDoc(doc(db, 'tenants', tenantId));
      if (snap.exists() && snap.data().userId) {
        return snap.data().userId;
      }
    } catch (e) {
      console.warn("Could not resolve tenant user ID:", e);
    }
    return tenantId;
  };

  // Filtered proofs
  const filteredProofs = useMemo(() => {
    return proofs.filter((proof) => {
      // 1. Status Filter
      let matchesStatus = true;
      const st = proof.status;
      if (statusFilter === 'pending') {
        matchesStatus = 
          st === 'En attente de vérification' || 
          st === 'En cours de vérification' || 
          st === 'En attente' ||
          st === 'Informations complémentaires demandées';
      } else if (statusFilter === 'accepted') {
        matchesStatus = st === 'Preuve acceptée' || st === 'Confirmé';
      } else if (statusFilter === 'rejected') {
        matchesStatus = st === 'Preuve rejetée' || st === 'Rejeté';
      }

      // 2. Search Query
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !q ||
        proof.tenantName?.toLowerCase().includes(q) ||
        proof.propertyName?.toLowerCase().includes(q) ||
        proof.unitNumber?.toLowerCase().includes(q) ||
        proof.transactionReference?.toLowerCase().includes(q) ||
        proof.paymentType?.toLowerCase().includes(q) ||
        proof.paymentMethod?.toLowerCase().includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [proofs, statusFilter, searchQuery]);

  // Status counts for tabs
  const counts = useMemo(() => {
    const pending = proofs.filter(p => 
      p.status === 'En attente de vérification' || 
      p.status === 'En cours de vérification' || 
      p.status === 'En attente' ||
      p.status === 'Informations complémentaires demandées'
    ).length;
    const accepted = proofs.filter(p => p.status === 'Preuve acceptée' || p.status === 'Confirmé').length;
    const rejected = proofs.filter(p => p.status === 'Preuve rejetée' || p.status === 'Rejeté').length;
    return { all: proofs.length, pending, accepted, rejected };
  }, [proofs]);

  // Execute Approval
  const handleExecuteApproval = async () => {
    if (!approveModalProof) return;
    setIsApproving(true);
    const toastId = toast.loading('Approbation de la preuve en cours...');

    try {
      const nowIso = new Date().toISOString();
      const currentActorId = auth.currentUser?.uid || landlordId || 'bailleur';
      const prevStatus = approveModalProof.status;

      const newHistoryItem = {
        fromStatus: prevStatus,
        toStatus: 'Preuve acceptée',
        changedBy: auth.currentUser?.displayName || 'Propriétaire / Gestionnaire',
        changedAt: nowIso,
        reason: approveComment.trim() || 'Preuve de paiement certifiée et approuvée'
      };
      const existingHistory = approveModalProof.statusHistory || [];

      const batch = writeBatch(db);

      // 1. Update proof document
      const proofRef = doc(db, 'payment_proofs', approveModalProof.id);
      batch.update(proofRef, {
        status: 'Preuve acceptée',
        verifiedAt: nowIso,
        verifiedBy: currentActorId,
        comments: approveComment.trim() || approveModalProof.comment || approveModalProof.comments || '',
        statusHistory: [...existingHistory, newHistoryItem],
        updatedAt: nowIso
      });

      // 2. Synchronize / Update linked Payment or create new
      if (updatePaymentRecord) {
        if (approveModalProof.paymentId) {
          // Update pre-existing payment
          const paymentRef = doc(db, 'payments', approveModalProof.paymentId);
          batch.update(paymentRef, {
            status: 'Payé',
            proofId: approveModalProof.id,
            proofUrl: approveModalProof.proofUrl || approveModalProof.fileUrl || (approveModalProof.files?.[0]?.url || ''),
            confirmedAt: nowIso,
            confirmedBy: currentActorId,
            updatedAt: nowIso
          });
        } else {
          // Create new record in payments collection
          const paymentRef = doc(collection(db, 'payments'));
          const monthKey = (approveModalProof.paymentDate || nowIso).slice(0, 7);
          batch.set(paymentRef, {
            landlordId: approveModalProof.landlordId || currentActorId,
            tenantId: approveModalProof.tenantId,
            tenantName: approveModalProof.tenantName,
            propertyId: approveModalProof.propertyId || '',
            propertyName: approveModalProof.propertyName || 'Bien locatif',
            amount: approveModalProof.amount,
            currency: approveModalProof.currency || 'USD',
            date: approveModalProof.paymentDate || nowIso.split('T')[0],
            paymentDate: approveModalProof.paymentDate || nowIso.split('T')[0],
            monthKey,
            method: approveModalProof.paymentMethod || 'Mobile Money',
            paymentMethod: approveModalProof.paymentMethod || 'Mobile Money',
            type: approveModalProof.paymentType || 'Loyer',
            status: 'Payé',
            reference: approveModalProof.transactionReference || '',
            notes: `Certifié via tableau des preuves #${approveModalProof.id}. ${approveComment.trim()}`.trim(),
            proofId: approveModalProof.id,
            proofUrl: approveModalProof.proofUrl || approveModalProof.fileUrl || (approveModalProof.files?.[0]?.url || ''),
            receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
            confirmedAt: nowIso,
            confirmedBy: currentActorId,
            createdAt: nowIso,
            updatedAt: nowIso
          });
          batch.update(proofRef, { paymentId: paymentRef.id });
        }
      }

      // 3. Notify Tenant (resolving auth user ID)
      const targetUserId = await resolveTenantAuthUid(approveModalProof.tenantId, approveModalProof.tenantUserId);
      if (targetUserId) {
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, {
          userId: targetUserId,
          tenantId: approveModalProof.tenantId,
          landlordId: approveModalProof.landlordId || currentActorId,
          type: 'PAYMENT_PROOF_ACCEPTED',
          title: 'Preuve de paiement approuvée',
          message: `Votre preuve de versement pour ${approveModalProof.paymentType || 'Loyer'} (${approveModalProof.amount} ${approveModalProof.currency || 'USD'}) a été approuvée par votre gestionnaire. ${approveComment.trim() ? `Note : "${approveComment.trim()}"` : ''}`,
          read: false,
          createdAt: nowIso
        });
      }

      await batch.commit();

      toast.success('Preuve approuvée avec succès !', { id: toastId });
      setApproveModalProof(null);
      setApproveComment('');
      if (onProofUpdated) onProofUpdated();
    } catch (err: any) {
      console.error('Erreur approbation:', err);
      toast.error(err.message || 'Impossible d\'approuver cette preuve.', { id: toastId });
    } finally {
      setIsApproving(false);
    }
  };

  // Execute Rejection
  const handleExecuteRejection = async () => {
    if (!rejectModalProof) return;
    if (!rejectReason.trim()) {
      toast.error('Veuillez renseigner le motif du rejet.');
      return;
    }

    setIsRejecting(true);
    const toastId = toast.loading('Rejet de la preuve...');

    try {
      const nowIso = new Date().toISOString();
      const currentActorId = auth.currentUser?.uid || landlordId || 'bailleur';
      const prevStatus = rejectModalProof.status;

      const newHistoryItem = {
        fromStatus: prevStatus,
        toStatus: 'Preuve rejetée',
        changedBy: auth.currentUser?.displayName || 'Propriétaire / Gestionnaire',
        changedAt: nowIso,
        reason: rejectReason.trim()
      };
      const existingHistory = rejectModalProof.statusHistory || [];

      // 1. Update proof document
      const proofRef = doc(db, 'payment_proofs', rejectModalProof.id);
      await updateDoc(proofRef, {
        status: 'Preuve rejetée',
        rejectionReason: rejectReason.trim(),
        verifiedAt: nowIso,
        verifiedBy: currentActorId,
        statusHistory: [...existingHistory, newHistoryItem],
        updatedAt: nowIso
      });

      // 2. Notify Tenant (resolving auth user ID)
      const targetUserId = await resolveTenantAuthUid(rejectModalProof.tenantId, rejectModalProof.tenantUserId);
      if (targetUserId) {
        await addDoc(collection(db, 'notifications'), {
          userId: targetUserId,
          tenantId: rejectModalProof.tenantId,
          landlordId: rejectModalProof.landlordId || currentActorId,
          type: 'PAYMENT_PROOF_REJECTED',
          title: 'Preuve de paiement rejetée',
          message: `Votre preuve de versement pour ${rejectModalProof.paymentType || 'Loyer'} a été rejetée. Motif : "${rejectReason.trim()}".`,
          read: false,
          createdAt: nowIso
        });
      }

      toast.success('Preuve rejetée et locataire notifié.', { id: toastId });
      setRejectModalProof(null);
      setRejectReason('');
      if (onProofUpdated) onProofUpdated();
    } catch (err: any) {
      console.error('Erreur rejet:', err);
      toast.error(err.message || 'Échec du rejet.', { id: toastId });
    } finally {
      setIsRejecting(false);
    }
  };

  // Status Badge Component
  const renderStatusBadge = (status: DashboardProof['status']) => {
    switch (status) {
      case 'Preuve acceptée':
      case 'Confirmé':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Acceptée
          </span>
        );
      case 'Preuve rejetée':
      case 'Rejeté':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> Rejetée
          </span>
        );
      case 'Informations complémentaires demandées':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <HelpCircle className="w-3.5 h-3.5" /> Complément requis
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3.5 h-3.5 animate-pulse" /> En attente
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Tableau d'Approbation des Preuves
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Validation, contrôle visuel et rapprochement comptable des versements locatifs
              </p>
            </div>
          </div>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par locataire, réf, bien..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs (All / Pending / Accepted / Rejected) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            statusFilter === 'pending'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>En attente</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            statusFilter === 'pending' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
          }`}>
            {counts.pending}
          </span>
        </button>

        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            statusFilter === 'all'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-4 h-4" />
          <span>Toutes</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            statusFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
          }`}>
            {counts.all}
          </span>
        </button>

        <button
          onClick={() => setStatusFilter('accepted')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            statusFilter === 'accepted'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Acceptées</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            statusFilter === 'accepted' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
          }`}>
            {counts.accepted}
          </span>
        </button>

        <button
          onClick={() => setStatusFilter('rejected')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            statusFilter === 'rejected'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
          }`}
        >
          <XCircle className="w-4 h-4" />
          <span>Rejetées</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            statusFilter === 'rejected' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
          }`}>
            {counts.rejected}
          </span>
        </button>
      </div>

      {/* Grid of Proofs */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-64 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 animate-pulse" />
          ))}
        </div>
      ) : filteredProofs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center">
          <ShieldCheck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Aucun justificatif trouvé
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {searchQuery 
              ? `Aucun résultat correspondant à votre recherche "${searchQuery}".`
              : statusFilter === 'pending' 
                ? 'Toutes les preuves soumises ont été examinées et validées.'
                : 'Aucune preuve enregistrée dans ce filtre.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProofs.map((proof) => {
            const primaryFile = proof.files?.[0] || (proof.fileUrl || proof.proofUrl ? {
              url: proof.fileUrl || proof.proofUrl || '',
              name: 'Justificatif',
              type: (proof.fileUrl || proof.proofUrl || '').includes('.pdf') ? 'application/pdf' : 'image/jpeg',
              size: 0
            } : null);

            const isPending = 
              proof.status === 'En attente de vérification' || 
              proof.status === 'En cours de vérification' || 
              proof.status === 'En attente' ||
              proof.status === 'Informations complémentaires demandées';

            return (
              <div
                key={proof.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Card Header: Tenant, Property, Status */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-base truncate">
                        <User className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="truncate">{proof.tenantName || 'Locataire'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        <Building className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{proof.propertyName || 'Bien locatif'} {proof.unitNumber ? `(${proof.unitNumber})` : ''}</span>
                      </div>
                    </div>
                    {renderStatusBadge(proof.status)}
                  </div>

                  {/* Amount & Method Badge */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 mb-3 flex items-center justify-between border border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                        {proof.paymentType || 'Loyer'}
                      </span>
                      <span className="text-xl font-extrabold text-slate-900 dark:text-white">
                        {proof.amount?.toLocaleString()} {proof.currency || 'USD'}
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                      {proof.paymentMethod || 'Mobile Money'}
                    </span>
                  </div>

                  {/* Transaction Reference & Date */}
                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 mb-3">
                    {proof.transactionReference && (
                      <div className="flex items-center justify-between gap-2 bg-slate-100/70 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-lg">
                        <span className="text-slate-500 text-[11px]">Réf transaction :</span>
                        <div className="flex items-center gap-1 font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                          <span className="truncate">{proof.transactionReference}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(proof.transactionReference!, proof.id)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title="Copier la référence"
                          >
                            {copiedId === proof.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Date versement :</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{proof.paymentDate || 'N/A'}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Transmis le :</span>
                      <span>{proof.createdAt ? new Date(proof.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</span>
                    </div>
                  </div>

                  {/* Rejection / Info notice if present */}
                  {proof.status === 'Preuve rejetée' && proof.rejectionReason && (
                    <div className="mb-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                      <div>
                        <strong>Motif de rejet :</strong> {proof.rejectionReason}
                      </div>
                    </div>
                  )}

                  {/* Locataire Comment */}
                  {(proof.comment || proof.comments) && (
                    <div className="mb-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 italic">
                      « {proof.comment || proof.comments} »
                    </div>
                  )}

                  {/* Attached File Preview Card */}
                  {primaryFile && (
                    <div className="mb-4 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        {primaryFile.type?.includes('pdf') || primaryFile.url?.includes('.pdf') ? (
                          <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                        <div className="truncate text-xs">
                          <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{primaryFile.name || 'Justificatif'}</p>
                          {primaryFile.size > 0 && <span className="text-[10px] text-slate-400">{formatFileSize(primaryFile.size)}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setZoomLevel(1);
                            setRotationAngle(0);
                            setActiveViewerDoc({ url: primaryFile.url, name: primaryFile.name, type: primaryFile.type });
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                          title="Inspecter le justificatif"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadProofFile(primaryFile.url, primaryFile.name)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                          title="Télécharger l'original"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Action Bar */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                  {isPending ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setApproveModalProof(proof);
                          setApproveComment('');
                          setUpdatePaymentRecord(true);
                        }}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approuver
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRejectModalProof(proof);
                          setRejectReason('');
                        }}
                        className="py-2 px-3 border border-rose-300 dark:border-rose-700/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        Rejeter
                      </button>
                    </>
                  ) : (
                    <div className="w-full flex items-center justify-between text-xs text-slate-500">
                      <span>Traité le {proof.verifiedAt ? new Date(proof.verifiedAt).toLocaleDateString() : 'N/A'}</span>
                      {primaryFile && (
                        <button
                          type="button"
                          onClick={() => downloadProofFile(primaryFile.url, primaryFile.name)}
                          className="text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" /> Quittance
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve Confirmation Modal with Comment Field */}
      {approveModalProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setApproveModalProof(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Approuver la preuve de paiement ?
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Validation du versement de <strong className="text-slate-900 dark:text-white">{approveModalProof.amount?.toLocaleString()} {approveModalProof.currency || 'USD'}</strong> transmis par <strong className="text-slate-900 dark:text-white">{approveModalProof.tenantName}</strong>.
            </p>

            <div className="mt-4 space-y-3">
              {/* Comment field */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Commentaire ou référence de rapprochement (facultatif)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex : Virement bien crédité sur le compte bancaire ce 04/03..."
                  value={approveComment}
                  onChange={(e) => setApproveComment(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              {/* Checkbox synchronize payment */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updatePaymentRecord}
                  onChange={(e) => setUpdatePaymentRecord(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white block">
                    Mettre à jour la comptabilité locative
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Marque l'échéance comme réglée et génère la quittance sans créer de doublon.
                  </span>
                </div>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setApproveModalProof(null)}
                disabled={isApproving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleExecuteApproval}
                disabled={isApproving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer"
              >
                {isApproving ? 'Validation...' : 'Confirmer l\'approbation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal with Reason Field */}
      {rejectModalProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setRejectModalProof(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center mb-4">
              <XCircle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Rejeter la preuve de paiement
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Indiquez la raison du rejet pour informer <strong className="text-slate-900 dark:text-white">{rejectModalProof.tenantName}</strong>.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Motif du rejet <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Ex : Référence introuvable sur le relevé, capture d'écran illisible, montant ne correspondant pas au loyer dû..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectModalProof(null)}
                disabled={isRejecting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleExecuteRejection}
                disabled={isRejecting || !rejectReason.trim()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition cursor-pointer"
              >
                {isRejecting ? 'Traitement...' : 'Rejeter et Notifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox Document Viewer (Zoom, Rotate & Download) */}
      {activeViewerDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white bg-slate-950/60">
              <div className="flex items-center gap-2 max-w-md truncate">
                {activeViewerDoc.type?.includes('pdf') || activeViewerDoc.url?.includes('.pdf') ? (
                  <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-blue-500 shrink-0" />
                )}
                <span className="font-semibold text-sm truncate">{activeViewerDoc.name}</span>
              </div>

              <div className="flex items-center gap-2">
                {!activeViewerDoc.type?.includes('pdf') && !activeViewerDoc.url?.includes('.pdf') && (
                  <>
                    <button
                      type="button"
                      onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Zoom arrière"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-400 font-mono w-10 text-center">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Zoom avant"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRotationAngle((r) => (r + 90) % 360)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Faire pivoter"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => downloadProofFile(activeViewerDoc.url, activeViewerDoc.name)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 text-xs"
                  title="Télécharger"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Télécharger</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveViewerDoc(null)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/40">
              {activeViewerDoc.type?.includes('pdf') || activeViewerDoc.url?.includes('.pdf') ? (
                <iframe
                  src={activeViewerDoc.url}
                  title={activeViewerDoc.name}
                  className="w-full h-[75vh] rounded-xl border border-slate-800 bg-white"
                />
              ) : (
                <div
                  className="transition-transform duration-200 flex items-center justify-center"
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${rotationAngle}deg)`,
                  }}
                >
                  <img
                    src={activeViewerDoc.url}
                    alt={activeViewerDoc.name}
                    className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
