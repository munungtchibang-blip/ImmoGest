import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  X, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  HelpCircle, 
  Eye, 
  Download, 
  Plus, 
  ShieldCheck, 
  Info,
  Layers,
  Terminal,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Database
} from 'lucide-react';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  uploadPaymentProofFile, 
  formatFileSize, 
  validateProofFile, 
  downloadProofFile,
  type UploadProgressDetails 
} from '../services/storageService';
import toast from 'react-hot-toast';

export interface PaymentProof {
  id?: string;
  tenantId: string;
  tenantName: string;
  tenantEmail?: string;
  tenantPhone?: string;
  tenantUserId?: string;
  landlordId: string;
  propertyId?: string;
  propertyName?: string;
  unitNumber?: string;
  contractId?: string;
  paymentId?: string | null;
  paymentType: 'Loyer' | 'Caution' | 'Charges' | 'Réparation' | 'Autre';
  amount: number;
  currency: 'USD' | 'CDF';
  paymentDate: string;
  paymentMethod: 'Airtel Money' | 'M-Pesa' | 'Orange Money' | 'Virement bancaire' | 'Espèces' | 'Autre';
  transactionReference: string;
  comment?: string;
  files: Array<{
    url: string;
    name: string;
    size: number;
    type: string;
    storagePath?: string;
  }>;
  proofUrl?: string;
  fileCount?: number;
  status: 'En attente de vérification' | 'En cours de vérification' | 'Preuve acceptée' | 'Preuve rejetée' | 'Informations complémentaires demandées';
  rejectionReason?: string;
  additionalInfoRequest?: string;
  statusHistory?: Array<{
    fromStatus: string;
    toStatus: string;
    changedBy: string;
    changedAt: string;
    reason?: string;
  }>;
  verifiedAt?: string;
  verifiedBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentProofUploadProps {
  tenant: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    userId?: string;
    landlordId: string;
    propertyId?: string;
    propertyName?: string;
    unitNumber?: string;
    contractId?: string;
    rentAmount?: number;
    currency?: 'USD' | 'CDF';
  };
  onProofSubmitted?: () => void;
}

export const PaymentProofUpload: React.FC<PaymentProofUploadProps> = ({ tenant, onProofSubmitted }) => {
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(Boolean(tenant.id));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadDetails, setUploadDetails] = useState<UploadProgressDetails | null>(null);
  const [uploadLogs, setUploadLogs] = useState<Array<{ timestamp: string; step: string; message: string; percentage: number }>>([]);
  const [showLogTerminal, setShowLogTerminal] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [showFormModal, setShowFormModal] = useState(false);

  useEffect(() => {
    if (showLogTerminal && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [uploadLogs, showLogTerminal]);

  // Tenant rent dues and payment linkages
  const [tenantPayments, setTenantPayments] = useState<any[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('custom');

  // Form states
  const [paymentType, setPaymentType] = useState<PaymentProof['paymentType']>('Loyer');
  const [amount, setAmount] = useState<string>(tenant.rentAmount ? String(tenant.rentAmount) : '');
  const [currency, setCurrency] = useState<'USD' | 'CDF'>(tenant.currency || 'USD');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentProof['paymentMethod']>('M-Pesa');
  const [transactionReference, setTransactionReference] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Array<{ name: string; size: number; type: string; previewUrl?: string }>>([]);

  // Preview lightbox modal state
  const [activePreviewDoc, setActivePreviewDoc] = useState<{ url: string; name: string; type: string } | null>(null);

  // Real-time listener for tenant's payment proofs & pending payments
  useEffect(() => {
    if (!tenant.id) {
      return;
    }

    const q = query(
      collection(db, 'payment_proofs'),
      where('tenantId', '==', tenant.id)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: PaymentProof[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push({ id: docSnap.id, ...docSnap.data() } as PaymentProof);
        });
        // Sort newest first
        loaded.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setProofs(loaded);
        setLoading(false);
      },
      (error) => {
        console.warn('Erreur chargement preuves de paiement:', error);
        setLoading(false);
      }
    );

    // Query tenant payments to link with proofs
    const qPayments = query(
      collection(db, 'payments'),
      where('tenantId', '==', tenant.id)
    );
    const unsubPayments = onSnapshot(
      qPayments,
      (snap) => {
        const loadedPays = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        loadedPays.sort((a: any, b: any) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime());
        setTenantPayments(loadedPays);
      },
      (err) => console.warn('Erreur chargement paiements locataire:', err)
    );

    return () => {
      unsubscribe();
      unsubPayments();
    };
  }, [tenant.id]);

  const handleSelectPayment = (payId: string) => {
    setSelectedPaymentId(payId);
    if (payId === 'custom') {
      setAmount(tenant.rentAmount ? String(tenant.rentAmount) : '');
      setPaymentType('Loyer');
      return;
    }
    const target = tenantPayments.find(p => p.id === payId);
    if (target) {
      if (target.amount) setAmount(String(target.amount));
      if (target.currency) setCurrency(target.currency);
      if (target.type) setPaymentType(target.type);
    }
  };

  // Handle file selections with binary signature validation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);

    const validNewFiles: File[] = [];
    const newPreviews: Array<{ name: string; size: number; type: string; previewUrl?: string }> = [];

    for (const file of filesArray) {
      const check = await validateProofFile(file);
      if (!check.valid) {
        toast.error(check.error || `Fichier ${file.name} invalide.`);
        continue;
      }
      validNewFiles.push(file);

      const isImg = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
      newPreviews.push({
        name: file.name,
        size: file.size,
        type: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        previewUrl: isImg ? URL.createObjectURL(file) : undefined
      });
    }

    setSelectedFiles((prev) => [...prev, ...validNewFiles]);
    setFilePreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const resetForm = () => {
    setSelectedPaymentId('custom');
    setPaymentType('Loyer');
    setAmount(tenant.rentAmount ? String(tenant.rentAmount) : '');
    setCurrency(tenant.currency || 'USD');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('M-Pesa');
    setTransactionReference('');
    setComment('');
    setSelectedFiles([]);
    setFilePreviews([]);
    setUploadProgress(null);
    setUploadDetails(null);
    setUploadLogs([]);
    setShowFormModal(false);
  };

  const getStepInfo = (step?: UploadProgressDetails['step']) => {
    switch (step) {
      case 'validating':
        return {
          label: 'Étape 1/5 : Contrôle de sécurité & signature binaire',
          badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          icon: ShieldCheck,
        };
      case 'optimizing':
        return {
          label: 'Étape 2/5 : Optimisation & compression haute netteté',
          badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          icon: Sparkles,
        };
      case 'chunking':
        return {
          label: 'Étape 3/5 : Découpage par morceaux (128 Ko / fragment)',
          badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          icon: Layers,
        };
      case 'uploading':
        return {
          label: 'Étape 4/5 : Transfert et acheminement réseau sécurisé',
          badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: Upload,
        };
      case 'persisting':
        return {
          label: 'Étape 5/5 : Sécurisation & enregistrement définitif',
          badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          icon: Database,
        };
      case 'completed':
        return {
          label: 'Transmission confirmée et enregistrée',
          badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: CheckCircle2,
        };
      default:
        return {
          label: 'Initialisation de la transmission...',
          badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
          icon: Clock,
        };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Veuillez saisir un montant valide.');
      return;
    }
    if (!transactionReference.trim()) {
      toast.error('Veuillez préciser la référence ou numéro de transaction.');
      return;
    }
    if (selectedFiles.length === 0) {
      toast.error('Veuillez ajouter au moins un reçu, capture ou relevé comme justificatif.');
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(5);
    const startTimestamp = new Date().toLocaleTimeString('fr-FR');
    setUploadDetails({
      percentage: 5,
      step: 'validating',
      message: `Initialisation de la transmission de ${selectedFiles.length} justificatif(s)...`,
      timestamp: startTimestamp,
      totalBytes: selectedFiles.reduce((acc, f) => acc + f.size, 0)
    });
    setUploadLogs([
      {
        timestamp: startTimestamp,
        step: 'INIT',
        message: `Démarrage de la transmission sécurisée (${selectedFiles.length} justificatif(s), ${formatFileSize(selectedFiles.reduce((acc, f) => acc + f.size, 0))})...`,
        percentage: 5
      }
    ]);

    const toastId = toast.loading('Transmission sécurisée de votre preuve...');

    try {
      // 1. Upload files with chunking and progress details
      const uploadedFiles = [];
      const totalFiles = selectedFiles.length;

      for (let i = 0; i < totalFiles; i++) {
        const file = selectedFiles[i];
        const fileNum = i + 1;

        const res = await uploadPaymentProofFile(file, tenant.id, (pct, details) => {
          // Weight upload percentage smoothly across multiple files (from 5% to 88%)
          const fileBase = (i / totalFiles) * 80;
          const fileShare = (pct / 100) * (80 / totalFiles);
          const compositePct = Math.min(88, Math.max(5, Math.round(5 + fileBase + fileShare)));
          setUploadProgress(compositePct);

          if (details) {
            setUploadDetails(details);
            setUploadLogs((prev) => [
              ...prev.slice(-18),
              {
                timestamp: details.timestamp,
                step: details.step.toUpperCase(),
                message: totalFiles > 1 ? `[Fichier ${fileNum}/${totalFiles}] ${details.message}` : details.message,
                percentage: details.percentage
              }
            ]);
          }
        });

        uploadedFiles.push({
          url: res.url,
          name: res.name,
          size: res.size,
          type: res.type,
          storagePath: res.storagePath
        });
      }

      setUploadProgress(92);
      const nowIso = new Date().toISOString();
      const persistTime = new Date().toLocaleTimeString('fr-FR');

      setUploadDetails({
        percentage: 92,
        step: 'persisting',
        message: 'Enregistrement de la quittance et liaison automatique à votre bail...',
        timestamp: persistTime,
      });
      setUploadLogs((prev) => [
        ...prev.slice(-18),
        {
          timestamp: persistTime,
          step: 'PERSISTING',
          message: "Enregistrement de la quittance et de l'historique d'audit dans Firestore...",
          percentage: 92
        }
      ]);

      // 2. Save payment proof document with full metadata and status history
      const proofPayload = {
        tenantId: tenant.id,
        tenantName: tenant.name || 'Locataire',
        tenantEmail: tenant.email || '',
        tenantPhone: tenant.phone || '',
        tenantUserId: tenant.userId || '',
        landlordId: tenant.landlordId || '',
        propertyId: tenant.propertyId || '',
        propertyName: tenant.propertyName || 'Bien locatif',
        unitNumber: tenant.unitNumber || '',
        contractId: tenant.contractId || '',
        paymentId: selectedPaymentId && selectedPaymentId !== 'custom' ? selectedPaymentId : null,
        paymentType,
        amount: parseFloat(amount),
        currency,
        paymentDate,
        paymentMethod,
        transactionReference: transactionReference.trim(),
        comment: comment.trim(),
        files: uploadedFiles,
        proofUrl: uploadedFiles[0]?.url || '',
        fileCount: uploadedFiles.length,
        status: 'En attente de vérification',
        statusHistory: [
          {
            fromStatus: 'Nouveau',
            toStatus: 'En attente de vérification',
            changedBy: tenant.name || 'Locataire',
            changedAt: nowIso,
            reason: 'Transmission initiale du justificatif de paiement'
          }
        ],
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const proofDocRef = await addDoc(collection(db, 'payment_proofs'), proofPayload);

      // If linked to an existing payment, update that payment with the proof ID
      if (selectedPaymentId && selectedPaymentId !== 'custom') {
        try {
          await updateDoc(doc(db, 'payments', selectedPaymentId), {
            proofId: proofDocRef.id,
            proofUrl: uploadedFiles[0]?.url || '',
            updatedAt: nowIso
          });
        } catch (linkErr) {
          console.warn("Could not link proof to payment:", linkErr);
        }
      }

      // 3. Notify landlord with both userId and landlordId for notification query compatibility
      if (tenant.landlordId) {
        try {
          await addDoc(collection(db, 'notifications'), {
            userId: tenant.landlordId,
            landlordId: tenant.landlordId,
            tenantId: tenant.id,
            type: 'PAYMENT_PROOF_SUBMITTED',
            title: 'Nouvelle preuve de paiement reçue',
            message: `${tenant.name} a transmis un justificatif de paiement de ${amount} ${currency} pour ${paymentType.toLowerCase()} (${paymentMethod}, Réf: ${transactionReference.trim()}).`,
            read: false,
            createdAt: nowIso
          });
        } catch (notifErr) {
          console.warn('Could not post notification:', notifErr);
        }
      }

      const finishTime = new Date().toLocaleTimeString('fr-FR');
      setUploadProgress(100);
      setUploadDetails({
        percentage: 100,
        step: 'completed',
        message: 'Preuve validée et enregistrée avec succès !',
        timestamp: finishTime,
      });
      setUploadLogs((prev) => [
        ...prev.slice(-18),
        {
          timestamp: finishTime,
          step: 'COMPLETED',
          message: 'Transmission terminée et confirmée par le serveur ImmoGest.',
          percentage: 100
        }
      ]);

      toast.success('Preuve transmise avec succès ! En attente de vérification par votre bailleur.', { id: toastId });
      
      // Delay briefly so the tenant can see the green 100% checkmark and success state
      await new Promise((r) => setTimeout(r, 650));
      resetForm();
      if (onProofSubmitted) onProofSubmitted();
    } catch (err: any) {
      console.error('Erreur transmission preuve:', err);
      const errTime = new Date().toLocaleTimeString('fr-FR');
      setUploadDetails({
        percentage: uploadProgress || 0,
        step: 'error',
        message: err.message || 'Échec de transmission',
        timestamp: errTime,
      });
      setUploadLogs((prev) => [
        ...prev.slice(-18),
        {
          timestamp: errTime,
          step: 'ERREUR',
          message: `Échec : ${err.message || 'Erreur inconnue'}`,
          percentage: uploadProgress || 0
        }
      ]);
      toast.error(err.message || 'Échec de la transmission. Veuillez réessayer.', { id: toastId });
    } finally {
      setIsSubmitting(false);
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
            <AlertCircle className="w-3.5 h-3.5" /> Preuve rejetée
          </span>
        );
      case 'Informations complémentaires demandées':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <HelpCircle className="w-3.5 h-3.5" /> Complément demandé
          </span>
        );
      case 'En cours de vérification':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3.5 h-3.5 animate-spin" /> En cours de vérification
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" /> En attente de vérification
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card with action */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Mes preuves de paiement</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Transmettez vos reçus bancaires ou captures Mobile Money pour validation par votre bailleur.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowFormModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Transmettre une preuve
        </button>
      </div>

      {/* Info notice: Rule enforcement */}
      <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/60 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-blue-900 dark:text-blue-200">
          <strong>Règle importante :</strong> L'envoi d'une preuve de paiement ne vaut pas paiement définitif immédiat. Votre solde locatif sera crédité une fois la transaction formellement vérifiée et approuvée par le bailleur.
        </div>
      </div>

      {/* Proofs List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-white text-base">
            Historique des transmissions ({proofs.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : proofs.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-60" />
            <p className="text-slate-700 dark:text-slate-300 font-medium">Aucune preuve transmise pour le moment</p>
            <p className="text-slate-500 text-sm mt-1 mb-4">
              Avez-vous effectué un virement ou un paiement Mobile Money ? Transmettez le reçu pour obtenir votre reçu certifié.
            </p>
            <button
              onClick={() => setShowFormModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" />
              Transmettre un reçu maintenant
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {proofs.map((proof) => (
              <div
                key={proof.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors bg-slate-50/50 dark:bg-slate-800/40"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-white text-lg">
                        {proof.amount.toLocaleString()} {proof.currency}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                        {proof.paymentType}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        • {proof.paymentMethod}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      <span>Réf : <strong className="text-slate-700 dark:text-slate-300">{proof.transactionReference}</strong></span>
                      <span>• Date de paiement : {proof.paymentDate}</span>
                      <span>• Transmis le : {new Date(proof.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {getStatusBadge(proof.status)}
                  </div>
                </div>

                {/* Additional Info / Rejection notices */}
                {proof.status === 'Preuve rejetée' && proof.rejectionReason && (
                  <div className="mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Motif de rejet du bailleur :</strong> {proof.rejectionReason}
                    </div>
                  </div>
                )}

                {proof.status === 'Informations complémentaires demandées' && proof.additionalInfoRequest && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Précision demandée :</strong> {proof.additionalInfoRequest}
                    </div>
                  </div>
                )}

                {/* Comment note if present */}
                {proof.comment && (
                  <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 italic">
                    « {proof.comment} »
                  </div>
                )}

                {/* Files attached */}
                {proof.files && proof.files.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-slate-500 font-medium">Justificatif(s) :</span>
                    {proof.files.map((f, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActivePreviewDoc({ url: f.url, name: f.name, type: f.type })}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        {f.type.includes('pdf') ? (
                          <FileText className="w-3.5 h-3.5 text-rose-500" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                        )}
                        <span className="max-w-[140px] truncate">{f.name}</span>
                        <Eye className="w-3 h-3 text-slate-400 ml-1" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submission Modal Dialog */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Transmettre une preuve de paiement
                  </h3>
                  <p className="text-xs text-slate-500">
                    Complétez les détails du paiement et joignez votre justificatif
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Sélection du loyer ou paiement concerné */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Paiement ou échéance de loyer concerné
                </label>
                <select
                  value={selectedPaymentId}
                  onChange={(e) => handleSelectPayment(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-hidden"
                >
                  <option value="custom">Nouveau versement ou paiement libre</option>
                  {tenantPayments.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.type || 'Loyer'} - {p.amount} {p.currency || 'USD'} ({p.date ? new Date(p.date).toLocaleDateString('fr-FR') : 'Échéance'}) [{p.status || 'En attente'}]
                    </option>
                  ))}
                </select>
                {selectedPaymentId !== 'custom' ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                    ✓ Cette preuve sera directement rattachée à cette échéance et mettra à jour son statut dès validation.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Sélectionnez une échéance existante ou laissez « Paiement libre » pour un règlement spontané.
                  </p>
                )}
              </div>

              {/* Type de paiement */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Type de paiement <span className="text-rose-500">*</span>
                </label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as PaymentProof['paymentType'])}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-hidden"
                >
                  <option value="Loyer">Loyer mensuel</option>
                  <option value="Caution">Garantie locative / Caution</option>
                  <option value="Charges">Charges locatives</option>
                  <option value="Réparation">Frais de réparation</option>
                  <option value="Autre">Autre frais autorisé</option>
                </select>
              </div>

              {/* Amount & Currency */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Montant versé <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      placeholder="Ex: 500"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Devise
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'USD' | 'CDF')}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-hidden"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="CDF">CDF (FC)</option>
                  </select>
                </div>
              </div>

              {/* Date & Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Date du paiement <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Moyen de paiement <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentProof['paymentMethod'])}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-hidden"
                  >
                    <option value="M-Pesa">Vodacom M-Pesa</option>
                    <option value="Airtel Money">Airtel Money</option>
                    <option value="Orange Money">Orange Money</option>
                    <option value="Virement bancaire">Virement bancaire</option>
                    <option value="Espèces">Espèces avec reçu</option>
                    <option value="Autre">Autre moyen</option>
                  </select>
                </div>
              </div>

              {/* Transaction Reference */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Référence / N° de transaction <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: MP240912.1834.A01234 ou Réf virement"
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-hidden"
                />
              </div>

              {/* Comments */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Commentaire / Note explicative
                </label>
                <textarea
                  rows={2}
                  placeholder="Précision sur le versement (facultatif)..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-hidden"
                />
              </div>

              {/* File Upload Zone */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Reçu ou Capture justificative (Max 10 Mo, JPG/PNG/PDF) <span className="text-rose-500">*</span>
                </label>

                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 text-center hover:border-emerald-500 dark:hover:border-emerald-400 transition bg-slate-50/50 dark:bg-slate-800/40">
                  <input
                    type="file"
                    id="proof-file-input"
                    multiple
                    accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor="proof-file-input" className="cursor-pointer block">
                    <Upload className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      Cliquez pour sélectionner un fichier ou prendre une photo
                    </span>
                    <span className="block text-xs text-slate-500 mt-1">
                      Formats autorisés : JPG, PNG, WEBP, PDF (max 10 Mo)
                    </span>
                  </label>
                </div>

                {/* Previews */}
                {filePreviews.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {filePreviews.map((f, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {f.previewUrl ? (
                            <img
                              src={f.previewUrl}
                              alt={f.name}
                              className="w-8 h-8 object-cover rounded shrink-0 border border-slate-200"
                            />
                          ) : (
                            <FileText className="w-6 h-6 text-rose-500 shrink-0" />
                          )}
                          <div className="truncate">
                            <span className="font-medium text-slate-800 dark:text-slate-200 block truncate max-w-[220px]">
                              {f.name}
                            </span>
                            <span className="text-slate-500">{formatFileSize(f.size)}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Live Upload Progress with Step Tracker, Chunk Indicators & Live Activity Log */}
                {uploadProgress !== null && (
                  <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800 text-white space-y-3 shadow-lg animate-in fade-in duration-200">
                    {/* Step Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {(() => {
                          const stepInfo = getStepInfo(uploadDetails?.step);
                          const StepIcon = stepInfo.icon;
                          return (
                            <>
                              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                                <StepIcon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-semibold text-emerald-400 block truncate">
                                  {stepInfo.label}
                                </span>
                                <span className="text-[11px] text-slate-400 block truncate">
                                  {uploadDetails?.message || 'Transmission en cours...'}
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {uploadDetails?.totalChunks && uploadDetails.totalChunks > 1 && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-medium">
                            Morceau {uploadDetails.currentChunk || 1}/{uploadDetails.totalChunks}
                          </span>
                        )}
                        <span className="text-sm font-bold font-mono text-emerald-400">
                          {uploadProgress}%
                        </span>
                      </div>
                    </div>

                    {/* Primary Progress Bar */}
                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden relative">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-300 ease-out shadow-sm shadow-emerald-500/50"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>

                    {/* Step Pills Visualization */}
                    <div className="grid grid-cols-5 gap-1 pt-1">
                      {[
                        { id: 'validating', name: 'Contrôle' },
                        { id: 'optimizing', name: 'Optimisation' },
                        { id: 'chunking', name: 'Découpage' },
                        { id: 'uploading', name: 'Transfert' },
                        { id: 'persisting', name: 'Finalisation' }
                      ].map((st, sIdx) => {
                        const stepOrder = ['validating', 'optimizing', 'chunking', 'uploading', 'persisting', 'completed'];
                        const currentIdx = stepOrder.indexOf(uploadDetails?.step || 'validating');
                        const isDone = currentIdx > sIdx || uploadDetails?.step === 'completed';
                        const isCurrent = currentIdx === sIdx;

                        return (
                          <div 
                            key={st.id} 
                            className={`text-center py-1 rounded text-[10px] font-medium transition-all ${
                              isDone 
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                : isCurrent 
                                  ? 'bg-teal-500/30 text-teal-200 border border-teal-400 animate-pulse' 
                                  : 'bg-slate-800/60 text-slate-500 border border-slate-800'
                            }`}
                          >
                            {st.name}
                          </div>
                        );
                      })}
                    </div>

                    {/* Chunk Progress Segments if multiple chunks */}
                    {uploadDetails?.totalChunks && uploadDetails.totalChunks > 1 && (
                      <div className="pt-2 border-t border-slate-800/80">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3 text-purple-400" />
                            Découpage séquentiel (128 Ko / morceau)
                          </span>
                          <span className="font-mono text-purple-300">
                            {uploadDetails.currentChunk || 1} sur {uploadDetails.totalChunks} morceaux
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {Array.from({ length: uploadDetails.totalChunks }).map((_, cIdx) => {
                            const isCompletedChunk = (uploadDetails.currentChunk || 1) > cIdx + 1;
                            const isCurrentChunk = (uploadDetails.currentChunk || 1) === cIdx + 1;
                            return (
                              <div 
                                key={cIdx}
                                className={`h-1.5 flex-1 rounded-sm transition-all ${
                                  isCompletedChunk 
                                    ? 'bg-purple-400' 
                                    : isCurrentChunk 
                                      ? 'bg-purple-500 animate-pulse' 
                                      : 'bg-slate-800'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Live Terminal / Activity Log Container */}
                    <div className="pt-2 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => setShowLogTerminal(!showLogTerminal)}
                        className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 py-0.5 cursor-pointer transition"
                      >
                        <span className="flex items-center gap-1.5 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                          Journal de progression en direct ({uploadLogs.length})
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          {showLogTerminal ? 'Masquer' : 'Afficher'}
                          {showLogTerminal ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </span>
                      </button>

                      {showLogTerminal && (
                        <div className="mt-2 bg-black/60 rounded-lg p-2.5 max-h-32 overflow-y-auto font-mono text-[10px] space-y-1 border border-slate-800 text-slate-300 select-text">
                          {uploadLogs.length === 0 ? (
                            <div className="text-slate-500 italic">En attente des premières traces d'exécution...</div>
                          ) : (
                            uploadLogs.map((log, lIdx) => (
                              <div key={lIdx} className="flex items-start gap-1.5 leading-relaxed">
                                <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                                <span className={`shrink-0 px-1 py-0.2 rounded font-semibold text-[9px] ${
                                  log.step === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                                  log.step === 'ERREUR' ? 'bg-rose-500/20 text-rose-400' :
                                  log.step === 'CHUNKING' ? 'bg-purple-500/20 text-purple-300' :
                                  log.step === 'OPTIMIZING' ? 'bg-amber-500/20 text-amber-300' :
                                  'bg-slate-800 text-slate-300'
                                }`}>
                                  {log.step}
                                </span>
                                <span className="text-slate-300 break-words">{log.message}</span>
                              </div>
                            ))
                          )}
                          <div ref={logsEndRef} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons (sticky footer inside form) */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 sticky bottom-0 bg-white dark:bg-slate-900 pb-2">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium shadow-md shadow-emerald-600/20 transition hover:scale-[1.01] cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Transmission ({uploadProgress || 0}%)...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Transmettre la preuve
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Document Lightbox Viewer */}
      {activePreviewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white">
              <span className="font-semibold text-sm truncate max-w-md">
                {activePreviewDoc.name}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadProofFile(activePreviewDoc.url, activePreviewDoc.name)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer flex items-center gap-1.5 text-xs"
                  title="Télécharger le fichier"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Télécharger</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePreviewDoc(null)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/40">
              {activePreviewDoc.type.includes('pdf') || activePreviewDoc.url.includes('.pdf') ? (
                <iframe
                  src={activePreviewDoc.url}
                  title={activePreviewDoc.name}
                  className="w-full h-[70vh] rounded-lg border border-slate-800 bg-white"
                />
              ) : (
                <img
                  src={activePreviewDoc.url}
                  alt={activePreviewDoc.name}
                  className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
