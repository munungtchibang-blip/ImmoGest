import React, { useState, useEffect } from 'react';
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
  Info
} from 'lucide-react';
import { collection, addDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { uploadPaymentProofFile, formatFileSize, validateProofFile } from '../services/storageService';
import toast from 'react-hot-toast';

export interface PaymentProof {
  id?: string;
  tenantId: string;
  tenantName: string;
  tenantEmail?: string;
  tenantPhone?: string;
  landlordId: string;
  propertyId?: string;
  propertyName?: string;
  unitNumber?: string;
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
  }>;
  status: 'En attente de vérification' | 'En cours de vérification' | 'Preuve acceptée' | 'Preuve rejetée' | 'Informations complémentaires demandées';
  rejectionReason?: string;
  additionalInfoRequest?: string;
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
    landlordId: string;
    propertyId?: string;
    propertyName?: string;
    unitNumber?: string;
    rentAmount?: number;
    currency?: 'USD' | 'CDF';
  };
  onProofSubmitted?: () => void;
}

export const PaymentProofUpload: React.FC<PaymentProofUploadProps> = ({ tenant, onProofSubmitted }) => {
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);

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

  // Real-time listener for tenant's payment proofs
  useEffect(() => {
    if (!tenant.id) {
      setLoading(false);
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

    return () => unsubscribe();
  }, [tenant.id]);

  // Handle file selections
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);

    const validNewFiles: File[] = [];
    const newPreviews: Array<{ name: string; size: number; type: string; previewUrl?: string }> = [];

    for (const file of filesArray) {
      const check = validateProofFile(file);
      if (!check.valid) {
        toast.error(check.error || `Fichier ${file.name} invalide.`);
        continue;
      }
      validNewFiles.push(file);

      const isImg = file.type.startsWith('image/');
      newPreviews.push({
        name: file.name,
        size: file.size,
        type: file.type,
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
    setPaymentType('Loyer');
    setAmount(tenant.rentAmount ? String(tenant.rentAmount) : '');
    setCurrency(tenant.currency || 'USD');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('M-Pesa');
    setTransactionReference('');
    setComment('');
    setSelectedFiles([]);
    setFilePreviews([]);
    setShowFormModal(false);
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
    const toastId = toast.loading('Envoi de votre preuve de paiement...');

    try {
      // 1. Upload files
      const uploadedFiles = [];
      for (const file of selectedFiles) {
        const res = await uploadPaymentProofFile(file, tenant.id);
        uploadedFiles.push({
          url: res.url,
          name: res.name,
          size: res.size,
          type: res.type
        });
      }

      const nowIso = new Date().toISOString();

      // 2. Save payment proof document
      const proofPayload = {
        tenantId: tenant.id,
        tenantName: tenant.name || 'Locataire',
        tenantEmail: tenant.email || '',
        tenantPhone: tenant.phone || '',
        landlordId: tenant.landlordId || '',
        propertyId: tenant.propertyId || '',
        propertyName: tenant.propertyName || 'Bien locatif',
        unitNumber: tenant.unitNumber || '',
        paymentType,
        amount: parseFloat(amount),
        currency,
        paymentDate,
        paymentMethod,
        transactionReference: transactionReference.trim(),
        comment: comment.trim(),
        files: uploadedFiles,
        status: 'En attente de vérification',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await addDoc(collection(db, 'payment_proofs'), proofPayload);

      // 3. Notify landlord
      if (tenant.landlordId) {
        try {
          await addDoc(collection(db, 'notifications'), {
            landlordId: tenant.landlordId,
            tenantId: tenant.id,
            type: 'PAYMENT_PROOF_SUBMITTED',
            title: 'Nouvelle preuve de paiement reçue',
            message: `${tenant.name} a transmis une preuve de ${amount} ${currency} pour ${paymentType.toLowerCase()} (Réf: ${transactionReference.trim()}).`,
            read: false,
            createdAt: nowIso
          });
        } catch (notifErr) {
          console.warn('Could not post notification:', notifErr);
        }
      }

      toast.success('Preuve transmise avec succès ! En attente de vérification par votre bailleur.', { id: toastId });
      resetForm();
      if (onProofSubmitted) onProofSubmitted();
    } catch (err: any) {
      console.error('Erreur transmission preuve:', err);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
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
                  Reçu ou Capture justificative (Max 5 Mo, JPG/PNG/PDF) <span className="text-rose-500">*</span>
                </label>

                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 text-center hover:border-emerald-500 dark:hover:border-emerald-400 transition bg-slate-50/50 dark:bg-slate-800/40">
                  <input
                    type="file"
                    id="proof-file-input"
                    multiple
                    accept="image/jpeg,image/png,image/jpg,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor="proof-file-input" className="cursor-pointer block">
                    <Upload className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      Cliquez pour sélectionner un fichier ou une photo
                    </span>
                    <span className="block text-xs text-slate-500 mt-1">
                      Formats autorisés : JPG, PNG, PDF (max 5 Mo)
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
                          className="p-1 text-slate-400 hover:text-rose-500 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons (sticky footer inside form) */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 sticky bottom-0 bg-white dark:bg-slate-900 pb-2">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium shadow-md shadow-emerald-600/20 transition hover:scale-[1.01]"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Transmission...
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
                <a
                  href={activePreviewDoc.url}
                  download={activePreviewDoc.name}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                  title="Télécharger"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setActivePreviewDoc(null)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
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
