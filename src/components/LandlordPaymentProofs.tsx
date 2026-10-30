import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  Eye, 
  Download, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Clock, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  X,
  Building,
  User,
  ShieldCheck
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PaymentProof } from './PaymentProofUpload';
import toast from 'react-hot-toast';

interface LandlordPaymentProofsProps {
  landlordId: string;
  onPaymentCreated?: () => void;
}

export const LandlordPaymentProofs: React.FC<LandlordPaymentProofsProps> = ({ 
  landlordId, 
  onPaymentCreated 
}) => {
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Active file lightbox viewer
  const [activeFileViewer, setActiveFileViewer] = useState<{ url: string; name: string; type: string } | null>(null);

  // Image zoom & rotation state
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotationAngle, setRotationAngle] = useState<number>(0);

  const openFileViewer = (file: { url: string; name: string; type: string }) => {
    setZoomLevel(1);
    setRotationAngle(0);
    setActiveFileViewer(file);
  };

  // Modals for actions
  const [rejectModalProof, setRejectModalProof] = useState<PaymentProof | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const [infoModalProof, setInfoModalProof] = useState<PaymentProof | null>(null);
  const [infoRequestText, setInfoRequestText] = useState<string>('');
  const [infoSubmitting, setInfoSubmitting] = useState(false);

  const [acceptModalProof, setAcceptModalProof] = useState<PaymentProof | null>(null);
  const [createPaymentRecord, setCreatePaymentRecord] = useState(true);
  const [acceptSubmitting, setAcceptSubmitting] = useState(false);

  // Load proofs for this landlord in real-time
  useEffect(() => {
    if (!landlordId) return;

    const q = query(
      collection(db, 'payment_proofs'),
      where('landlordId', '==', landlordId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: PaymentProof[] = [];
      snapshot.forEach((docSnap) => {
        loaded.push({ id: docSnap.id, ...docSnap.data() } as PaymentProof);
      });
      loaded.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setProofs(loaded);
      setLoading(false);
    }, (error) => {
      console.warn('Erreur chargement preuves propriétaire:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [landlordId]);

  // Filtered proofs
  const filteredProofs = proofs.filter((p) => {
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    const searchLow = searchTerm.toLowerCase();
    const matchesSearch = 
      !searchTerm ||
      p.tenantName?.toLowerCase().includes(searchLow) ||
      p.propertyName?.toLowerCase().includes(searchLow) ||
      p.transactionReference?.toLowerCase().includes(searchLow) ||
      p.paymentType?.toLowerCase().includes(searchLow);

    return matchesStatus && matchesSearch;
  });

  const pendingCount = proofs.filter(p => p.status === 'En attente de vérification' || p.status === 'En cours de vérification').length;

  // Handle Accept
  const handleConfirmAccept = async () => {
    if (!acceptModalProof || !acceptModalProof.id) return;

    setAcceptSubmitting(true);
    const toastId = toast.loading('Validation de la preuve...');

    try {
      const nowIso = new Date().toISOString();

      // 1. Update proof status
      await updateDoc(doc(db, 'payment_proofs', acceptModalProof.id), {
        status: 'Preuve acceptée',
        verifiedAt: nowIso,
        verifiedBy: landlordId,
        updatedAt: nowIso
      });

      // 2. Optional: Automatically record in payments collection
      if (createPaymentRecord) {
        await addDoc(collection(db, 'payments'), {
          landlordId,
          tenantId: acceptModalProof.tenantId,
          tenantName: acceptModalProof.tenantName,
          propertyId: acceptModalProof.propertyId || '',
          propertyName: acceptModalProof.propertyName || 'Bien locatif',
          amount: acceptModalProof.amount,
          currency: acceptModalProof.currency,
          date: acceptModalProof.paymentDate || nowIso.split('T')[0],
          paymentDate: acceptModalProof.paymentDate || nowIso.split('T')[0],
          method: acceptModalProof.paymentMethod,
          paymentMethod: acceptModalProof.paymentMethod,
          type: acceptModalProof.paymentType,
          status: 'Payé',
          reference: acceptModalProof.transactionReference,
          notes: `Validé via preuve de paiement #${acceptModalProof.id}. ${acceptModalProof.comment || ''}`.trim(),
          proofId: acceptModalProof.id,
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }

      // 3. Notify tenant
      if (acceptModalProof.tenantId) {
        await addDoc(collection(db, 'notifications'), {
          tenantId: acceptModalProof.tenantId,
          landlordId,
          type: 'PAYMENT_PROOF_ACCEPTED',
          title: 'Preuve de paiement acceptée',
          message: `Votre preuve de paiement pour ${acceptModalProof.paymentType} (${acceptModalProof.amount} ${acceptModalProof.currency}) a été vérifiée et acceptée par votre bailleur.`,
          read: false,
          createdAt: nowIso
        });
      }

      toast.success('Preuve validée avec succès ! Le paiement a été enregistré.', { id: toastId });
      setAcceptModalProof(null);
      if (onPaymentCreated) onPaymentCreated();
    } catch (err: any) {
      console.error('Erreur acceptation preuve:', err);
      toast.error(err.message || 'Échec de la validation.', { id: toastId });
    } finally {
      setAcceptSubmitting(false);
    }
  };

  // Handle Reject
  const handleConfirmReject = async () => {
    if (!rejectModalProof || !rejectModalProof.id) return;
    if (!rejectionReason.trim()) {
      toast.error('Veuillez indiquer le motif du rejet.');
      return;
    }

    setRejectSubmitting(true);
    const toastId = toast.loading('Rejet de la preuve...');

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, 'payment_proofs', rejectModalProof.id), {
        status: 'Preuve rejetée',
        rejectionReason: rejectionReason.trim(),
        verifiedAt: nowIso,
        verifiedBy: landlordId,
        updatedAt: nowIso
      });

      // Notify tenant
      if (rejectModalProof.tenantId) {
        await addDoc(collection(db, 'notifications'), {
          tenantId: rejectModalProof.tenantId,
          landlordId,
          type: 'PAYMENT_PROOF_REJECTED',
          title: 'Preuve de paiement rejetée',
          message: `Votre preuve de paiement pour ${rejectModalProof.paymentType} a été rejetée. Motif : "${rejectionReason.trim()}".`,
          read: false,
          createdAt: nowIso
        });
      }

      toast.success('Preuve marquée comme rejetée et locataire notifié.', { id: toastId });
      setRejectModalProof(null);
      setRejectionReason('');
    } catch (err: any) {
      console.error('Erreur rejet:', err);
      toast.error(err.message || 'Échec du rejet.', { id: toastId });
    } finally {
      setRejectSubmitting(false);
    }
  };

  // Handle Request Info
  const handleConfirmInfoRequest = async () => {
    if (!infoModalProof || !infoModalProof.id) return;
    if (!infoRequestText.trim()) {
      toast.error('Veuillez préciser l\'information demandée.');
      return;
    }

    setInfoSubmitting(true);
    const toastId = toast.loading('Envoi de la demande...');

    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, 'payment_proofs', infoModalProof.id), {
        status: 'Informations complémentaires demandées',
        additionalInfoRequest: infoRequestText.trim(),
        updatedAt: nowIso
      });

      // Notify tenant
      if (infoModalProof.tenantId) {
        await addDoc(collection(db, 'notifications'), {
          tenantId: infoModalProof.tenantId,
          landlordId,
          type: 'PAYMENT_PROOF_INFO_REQUESTED',
          title: 'Complément demandé sur votre preuve',
          message: `Votre bailleur a demandé une précision sur votre paiement : "${infoRequestText.trim()}".`,
          read: false,
          createdAt: nowIso
        });
      }

      toast.success('Demande de complément transmise au locataire.', { id: toastId });
      setInfoModalProof(null);
      setInfoRequestText('');
    } catch (err: any) {
      console.error('Erreur demande info:', err);
      toast.error(err.message || 'Échec de l\'envoi.', { id: toastId });
    } finally {
      setInfoSubmitting(false);
    }
  };

  const getStatusBadge = (status: PaymentProof['status']) => {
    switch (status) {
      case 'Preuve acceptée':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Preuve acceptée
          </span>
        );
      case 'Preuve rejetée':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> Rejetée
          </span>
        );
      case 'Informations complémentaires demandées':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <HelpCircle className="w-3.5 h-3.5" /> Complément requis
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5 animate-pulse" /> À vérifier
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Preuves de paiement reçues
              {pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white animate-bounce">
                  {pendingCount} en attente
                </span>
              )}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Contrôlez les justificatifs transmis par vos locataires et validez leurs écritures comptables.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher locataire, réf..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-hidden"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tous ({proofs.length})
            </button>
            <button
              onClick={() => setStatusFilter('En attente de vérification')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === 'En attente de vérification'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              À vérifier ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('Preuve acceptée')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === 'Preuve acceptée'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Acceptées
            </button>
            <button
              onClick={() => setStatusFilter('Preuve rejetée')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === 'Preuve rejetée'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Rejetées
            </button>
          </div>
        </div>
      </div>

      {/* Main Table or Card List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : filteredProofs.length === 0 ? (
          <div className="text-center py-16 px-4">
            <ShieldCheck className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base">
              Aucune preuve de paiement trouvée
            </h3>
            <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
              {statusFilter !== 'ALL' || searchTerm
                ? 'Aucun résultat ne correspond à vos critères de recherche.'
                : 'Les preuves transmises par vos locataires apparaîtront ici pour vérification et archivage comptable.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredProofs.map((proof) => (
              <div
                key={proof.id}
                className="p-5 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Left: Tenant & Payment details */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white text-base">
                      {proof.amount.toLocaleString()} {proof.currency}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                      {proof.paymentType}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      via {proof.paymentMethod}
                    </span>
                    {getStatusBadge(proof.status)}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {proof.tenantName}
                    </span>
                    {proof.propertyName && (
                      <span className="flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        {proof.propertyName}
                      </span>
                    )}
                    <span>
                      Réf: <strong className="text-slate-700 dark:text-slate-300">{proof.transactionReference}</strong>
                    </span>
                    <span>Date: {proof.paymentDate}</span>
                  </div>

                  {proof.comment && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                      « {proof.comment} »
                    </p>
                  )}

                  {/* Rejection / Info note */}
                  {proof.rejectionReason && (
                    <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 p-2 rounded-lg border border-rose-200/50">
                      <strong>Rejeté :</strong> {proof.rejectionReason}
                    </div>
                  )}
                  {proof.additionalInfoRequest && (
                    <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200/50">
                      <strong>Complément demandé :</strong> {proof.additionalInfoRequest}
                    </div>
                  )}

                  {/* Attached files pills */}
                  {proof.files && proof.files.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 items-center">
                      <span className="text-xs text-slate-400 font-medium">Fichier(s) :</span>
                      {proof.files.map((file, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => openFileViewer(file)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 transition"
                        >
                          {file.type.includes('pdf') ? (
                            <FileText className="w-3.5 h-3.5 text-rose-500" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                          )}
                          <span className="max-w-[120px] truncate">{file.name}</span>
                          <Eye className="w-3 h-3 text-slate-400 ml-0.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0">
                  {/* View primary document */}
                  {proof.files && proof.files[0] && (
                    <button
                      type="button"
                      onClick={() => openFileViewer(proof.files[0])}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="Inspecter le justificatif"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}

                  {/* Actions for pending proofs */}
                  {proof.status !== 'Preuve acceptée' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setAcceptModalProof(proof);
                          setCreatePaymentRecord(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Accepter
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setInfoModalProof(proof);
                          setInfoRequestText('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-xs font-semibold transition"
                      >
                        <HelpCircle className="w-4 h-4" />
                        Complément
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRejectModalProof(proof);
                          setRejectionReason('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-700/60 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold transition"
                      >
                        <XCircle className="w-4 h-4" />
                        Rejeter
                      </button>
                    </>
                  )}

                  {proof.status === 'Preuve acceptée' && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                      <CheckCircle2 className="w-4 h-4" /> Validé & Enregistré
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accept Confirmation Modal */}
      {acceptModalProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Valider la preuve de paiement ?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Vous vous apprêtez à certifier le paiement de <strong>{acceptModalProof.amount.toLocaleString()} {acceptModalProof.currency}</strong> versé par <strong>{acceptModalProof.tenantName}</strong> pour « {acceptModalProof.paymentType} ».
            </p>

            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createPaymentRecord}
                  onChange={(e) => setCreatePaymentRecord(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white block">
                    Générer automatiquement l'enregistrement de paiement
                  </span>
                  <span className="text-slate-500">
                    Mettra à jour la comptabilité, réduira le solde dû et marquera la quittance comme réglée.
                  </span>
                </div>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAcceptModalProof(null)}
                disabled={acceptSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmAccept}
                disabled={acceptSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md shadow-emerald-600/20 transition"
              >
                {acceptSubmitting ? 'Validation...' : 'Confirmer et Valider'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center mb-4">
              <XCircle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Rejeter la preuve de paiement
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Veuillez indiquer un motif clair pour informer <strong>{rejectModalProof.tenantName}</strong> afin qu'il puisse corriger ou soumettre un justificatif valide.
            </p>

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Motif du rejet <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Ex : Référence introuvable sur le relevé bancaire, capture floue, montant ne correspond pas..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 outline-hidden"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectModalProof(null)}
                disabled={rejectSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={rejectSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-md shadow-rose-600/20 transition"
              >
                {rejectSubmitting ? 'Traitement...' : 'Rejeter et Notifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Info Modal */}
      {infoModalProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-4">
              <HelpCircle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Demander des informations complémentaires
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Précisez au locataire ce qui manque pour que vous puissiez valider son versement.
            </p>

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Précision demandée <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Ex : Merci d'envoyer la capture montrant l'heure exacte et le nom du destinataire..."
                value={infoRequestText}
                onChange={(e) => setInfoRequestText(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-hidden"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setInfoModalProof(null)}
                disabled={infoSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmInfoRequest}
                disabled={infoSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shadow-md shadow-amber-600/20 transition"
              >
                {infoSubmitting ? 'Envoi...' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Document Viewer with Zoom & Rotate */}
      {activeFileViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            {/* Viewer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white bg-slate-950/50">
              <div className="flex items-center gap-2 max-w-md truncate">
                {activeFileViewer.type.includes('pdf') ? (
                  <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-blue-500 shrink-0" />
                )}
                <span className="font-semibold text-sm truncate">
                  {activeFileViewer.name}
                </span>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                {!activeFileViewer.type.includes('pdf') && !activeFileViewer.url.includes('.pdf') && (
                  <>
                    <button
                      onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Zoom arrière"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-400 font-mono w-12 text-center">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button
                      onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Zoom avant"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setRotationAngle((r) => (r + 90) % 360)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Faire pivoter"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                  </>
                )}

                <a
                  href={activeFileViewer.url}
                  download={activeFileViewer.name}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1 text-xs"
                  title="Télécharger l'original"
                >
                  <Download className="w-4 h-4" />
                </a>

                <button
                  onClick={() => setActiveFileViewer(null)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Viewer Stage */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/60 relative">
              {activeFileViewer.type.includes('pdf') || activeFileViewer.url.includes('.pdf') ? (
                <iframe
                  src={activeFileViewer.url}
                  title={activeFileViewer.name}
                  className="w-full h-[75vh] rounded-lg border border-slate-800 bg-white"
                />
              ) : (
                <div className="overflow-auto max-w-full max-h-[75vh] flex items-center justify-center">
                  <img
                    src={activeFileViewer.url}
                    alt={activeFileViewer.name}
                    style={{
                      transform: `scale(${zoomLevel}) rotate(${rotationAngle}deg)`,
                      transition: 'transform 0.15s ease-out'
                    }}
                    className="max-w-full max-h-[70vh] object-contain rounded shadow-2xl"
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
