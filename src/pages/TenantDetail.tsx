import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, deleteField } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { ArrowLeft, User, Phone, MapPin, Calendar, CreditCard, Download, Edit2, Trash2, AlertTriangle, RefreshCw, QrCode, ChevronRight } from 'lucide-react';
import { formatDistanceToNow, format, intervalToDuration } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import { QRCodeCanvas } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';

export function TenantDetail() {
  const { id } = useParams();
  const [tenant, setTenant] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showEditTenant, setShowEditTenant] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeductPrompt, setShowDeductPrompt] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [showPortalLinkModal, setShowPortalLinkModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!id || !auth.currentUser) return;

    const fetchTenant = async () => {
      try {
        const docRef = doc(db, 'tenants', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().landlordId === auth.currentUser?.uid) {
          setTenant({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (error) {
        console.error("Error fetching tenant:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTenant();

    const unsubPayments = onSnapshot(query(collection(db, 'payments'), where('tenantId', '==', id), where('landlordId', '==', auth.currentUser.uid)), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setPayments(data);
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'payments'); });

    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), where('tenantId', '==', id), where('landlordId', '==', auth.currentUser.uid)), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any), isExpense: true }));
      setExpenses(data);
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'expenses'); });

    return () => {
      unsubPayments();
      unsubExpenses();
    };
  }, [id]);

  const generateReceipt = (payment: any) => {
    if (!tenant) return;
    const doc = new jsPDF();
    
    // Colors
    const primaryColor = [37, 99, 235]; // Blue-600
    const textColor = [55, 65, 81]; // Gray-700
    const lightGray = [243, 244, 246]; // Gray-100

    // Header background
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 40, 'F');

    // Header text
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text('REÇU DE PAIEMENT', 105, 25, { align: 'center' });

    // Reset text color
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

    // Company Info (Placeholder)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('ImmoGest', 20, 50);
    doc.text('Gestion Immobilière', 20, 55);

    // Receipt Details Box
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(20, 65, 170, 30, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.text('Détails du reçu', 25, 73);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`N° de reçu : REC-${payment.id.substring(0, 6).toUpperCase()}`, 25, 82);
    doc.text(`Date : ${format(new Date(payment.date), 'dd MMMM yyyy', { locale: fr })}`, 25, 89);

    // Payment Info
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Informations du locataire', 20, 110);
    doc.line(20, 112, 190, 112);

    doc.setFont('helvetica', 'normal');
    doc.text(`Nom : ${tenant.name}`, 20, 122);
    doc.text(`Téléphone : ${tenant.phone || 'Non renseigné'}`, 20, 129);
    doc.text(`Adresse : ${tenant.address}`, 20, 136);
    doc.text(`Type de paiement : ${payment.type}`, 20, 143);
    doc.text(`Méthode : ${payment.method}`, 20, 150);

    // Amount Box
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(120, 115, 70, 25, 3, 3, 'S');
    
    doc.setFont('helvetica', 'normal');
    doc.text('Montant payé', 155, 123, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`${payment.amount} $`, 155, 133, { align: 'center' });

    // Footer
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Merci de votre confiance.', 105, 270, { align: 'center' });
    doc.text('Document généré électroniquement par ImmoGest.', 105, 277, { align: 'center' });

    doc.save(`Recu_${tenant.name.replace(/\s+/g, '_')}_${format(new Date(payment.date), 'yyyyMMdd')}.pdf`);
  };

  const handleDeleteTenant = async () => {
    try {
      const qPayments = query(collection(db, 'payments'), where('tenantId', '==', id));
      const paySnap = await getDocs(qPayments);
      await Promise.all(paySnap.docs.map(d => deleteDoc(doc(db, 'payments', d.id))));

      const qMaintenance = query(collection(db, 'maintenance'), where('tenantId', '==', id));
      const maintSnap = await getDocs(qMaintenance);
      await Promise.all(maintSnap.docs.map(d => deleteDoc(doc(db, 'maintenance', d.id))));

      const qContracts = query(collection(db, 'contracts'), where('tenantId', '==', id));
      const contractSnap = await getDocs(qContracts);
      await Promise.all(contractSnap.docs.map(d => deleteDoc(doc(db, 'contracts', d.id))));

      const qExpenses = query(collection(db, 'expenses'), where('tenantId', '==', id));
      const expSnap = await getDocs(qExpenses);
      await Promise.all(expSnap.docs.map(d => deleteDoc(doc(db, 'expenses', d.id))));

      const qUsers = query(collection(db, 'users'), where('tenantId', '==', id));
      const usersSnap = await getDocs(qUsers);
      await Promise.all(usersSnap.docs.map(d => deleteDoc(doc(db, 'users', d.id))));

      await deleteDoc(doc(db, 'tenants', id!));
      navigate('/tenants');
    } catch (error) {
      console.error("Error deleting tenant cascade", error);
      // alert("Erreur lors de la suppression.");
    }
  };

  const handleDeductGuarantee = async (data: { amount: number; type: string; notes: string }) => {
    if (!tenant || !auth.currentUser) return;
    
    if (data.amount > tenant.guaranteeAmount) {
      alert("Le montant à déduire est supérieur à la garantie disponible.");
      return;
    }

    try {
      const now = new Date().toISOString();
      
      // 1. Create payment record
      await addDoc(collection(db, 'payments'), {
        amount: data.amount,
        date: now,
        method: 'Déduction Garantie',
        type: data.type,
        notes: data.notes,
        tenantId: tenant.id,
        landlordId: auth.currentUser.uid,
        createdAt: now
      });

      // 2. Update tenant guarantee amount
      const newGuaranteeAmount = tenant.guaranteeAmount - data.amount;
      let newStatus = tenant.guaranteeStatus;
      if (newGuaranteeAmount === 0) newStatus = 'Non payée';
      else if (newGuaranteeAmount < tenant.monthlyRent * 3) newStatus = 'Partielle';

      await updateDoc(doc(db, 'tenants', tenant.id), {
        guaranteeAmount: newGuaranteeAmount,
        guaranteeStatus: newGuaranteeAmount === 0 ? 'Non payée' : 'Partielle',
        updatedAt: now
      });

      // Update local state to reflect changes immediately before snapshot catches up
      setTenant({ ...tenant, guaranteeAmount: newGuaranteeAmount, guaranteeStatus: newGuaranteeAmount === 0 ? 'Non payée' : 'Partielle' });
      setShowDeductPrompt(false);

    } catch (error) {
      console.error("Error deducting guarantee", error);
      // alert("Erreur lors de la déduction.");
    }
  };

  const handleRestoreGuarantee = async (amount: number) => {
    if (!tenant || !auth.currentUser) return;
    try {
      const now = new Date().toISOString();
      
      // 1. Create payment record
      await addDoc(collection(db, 'payments'), {
        amount: amount,
        date: now,
        method: 'Cash', // Default to cash, could be made selectable
        type: 'Garantie',
        notes: 'Restauration de la garantie suite à un paiement.',
        tenantId: tenant.id,
        landlordId: auth.currentUser.uid,
        createdAt: now
      });

      // 2. Update tenant guarantee amount
      const newGuaranteeAmount = tenant.guaranteeAmount + amount;
      let newStatus = tenant.guaranteeStatus;
      if (newGuaranteeAmount >= tenant.monthlyRent * 3) newStatus = 'Payée'; // Example logic
      else newStatus = 'Partielle';

      await updateDoc(doc(db, 'tenants', tenant.id), {
        guaranteeAmount: newGuaranteeAmount,
        guaranteeStatus: newStatus,
        updatedAt: now
      });

      setTenant({ ...tenant, guaranteeAmount: newGuaranteeAmount, guaranteeStatus: newStatus });
      setShowRestorePrompt(false);

    } catch (error) {
      console.error("Error restoring guarantee", error);
      // alert("Erreur lors de la restauration.");
    }
  };

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 w-32 bg-gray-200 rounded"></div>
      <div className="h-48 bg-gray-200 rounded-2xl"></div>
    </div>;
  }

  if (!tenant) {
    return <div>Locataire introuvable.</div>;
  }

  const exactDurationObj = intervalToDuration({ start: new Date(tenant.entryDate), end: new Date() });
  const durationParts = [];
  if (exactDurationObj.years) durationParts.push(`${exactDurationObj.years} an${exactDurationObj.years > 1 ? 's' : ''}`);
  if (exactDurationObj.months) durationParts.push(`${exactDurationObj.months} mois`);
  if (exactDurationObj.days) durationParts.push(`${exactDurationObj.days} jour${exactDurationObj.days > 1 ? 's' : ''}`);
  const duration = durationParts.length > 0 ? durationParts.join(', ') : "Moins d'un jour";

  return (
    <div className="space-y-6">
      <Link to="/tenants" className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Retour aux locataires
      </Link>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {tenant.photoUrl ? (
              <img 
                src={tenant.photoUrl} 
                alt={tenant.name} 
                className="w-16 h-16 rounded-full object-cover shrink-0 border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-80 transition-opacity" 
                referrerPolicy="no-referrer"
                onClick={() => setShowPhotoModal(true)} 
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <User className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{tenant.name}</h1>
              <p className="text-gray-500 dark:text-gray-400">{tenant.housingType}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowEditTenant(true)}
              className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl font-medium transition-colors"
            >
              <Edit2 className="w-5 h-5" />
              Modifier
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center justify-center gap-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 px-4 py-2.5 rounded-xl font-medium transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              Supprimer
            </button>

            <button
              onClick={() => setShowPortalLinkModal(true)}
              className="flex items-center justify-center gap-2 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 px-4 py-2.5 rounded-xl font-medium transition-colors"
            >
              <CreditCard className="w-5 h-5" />
              Espace Locataire
            </button>
            <button
              onClick={() => setShowPaymentForm(true)}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
            >
              <CreditCard className="w-5 h-5" />
              Ajouter un paiement
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Phone className="w-4 h-4" /> Téléphone</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.phone}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Adresse / Email</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.address}</p>
            {tenant.email && <p className="text-sm text-gray-500 dark:text-gray-400">{tenant.email}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Durée d'occupation</p>
            <p className="font-medium text-gray-900 dark:text-white">{duration}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Depuis le {format(new Date(tenant.entryDate), 'dd/MM/yyyy')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Loyer mensuel</p>
            <p className="font-medium text-gray-900 dark:text-white text-lg">{tenant.monthlyRent} $</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Situation Familiale</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.familyStatus || 'Célibataire'}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{tenant.childrenCount || 0} enfant(s)</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Cohabitants</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.cohabitants || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Pièce d'identité</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.idType || 'Non spécifié'}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{tenant.idNumber || '-'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Forfait Eau</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.waterAmount || 0} $</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Forfait Élec.</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.electricityAmount || 0} $</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Frais Syndics</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.syndicAmount || 0} $</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Networks</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.networkAmount || 0} $</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Entretien</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.cleaningAmount || 0} $</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">Autre</p>
            <p className="font-medium text-gray-900 dark:text-white">{tenant.otherAmount || 0} $</p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Garantie</h3>
            <div className="flex items-center gap-4">
              <p className="font-bold text-gray-900 dark:text-white">{tenant.guaranteeAmount} $</p>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                tenant.guaranteeStatus === 'Payée' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                tenant.guaranteeStatus === 'Partielle' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {tenant.guaranteeStatus}
              </span>
            </div>
          </div>
          {tenant.guaranteeAmount > 0 && (
            <button
              onClick={() => setShowDeductPrompt(true)}
              className="flex items-center gap-2 text-sm bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 px-3 py-2 rounded-lg font-medium transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              Déduire loyer impayé
            </button>
          )}
          {tenant.guaranteeStatus !== 'Payée' && (
            <button
              onClick={() => setShowRestorePrompt(true)}
              className="flex items-center gap-2 text-sm bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 px-3 py-2 rounded-lg font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Restaurer garantie
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Historique des paiements</h2>

        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {payments.length === 0 && expenses.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">Aucun paiement ou dépense enregistré.</div>
          ) : (
            [...payments, ...expenses.map(e => ({ ...e, isExpense: true, type: e.category, method: 'Dépense / Déduction', notes: e.description }))]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(payment => {
              const isExpanded = expandedHistoryId === payment.id;
              return (
              <div key={payment.id} className="flex flex-col border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer" onClick={() => setExpandedHistoryId(isExpanded ? null : payment.id)}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    payment.isExpense 
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      : payment.type === 'Loyer' 
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' 
                        : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                  }`}>
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                       {payment.type} - {payment.method}
                       <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{format(new Date(payment.date), 'dd MMMM yyyy', { locale: fr })}</p>
                    {payment.notes && !isExpanded && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic truncate max-w-xs sm:max-w-md">"{payment.notes}"</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-6 w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
                  <p className={`font-bold text-lg mr-2 ${payment.isExpense || Number(payment.amount) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                    {payment.isExpense ? '-' : ''}{Math.abs(Number(payment.amount))} $
                  </p>
                  {!payment.isExpense && (
                    <>
                      <button 
                        onClick={() => setEditingPayment(payment)}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Modifier le paiement"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => generateReceipt(payment)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        title="Télécharger le reçu"
                      >
                        <Download className="w-5 h-5" />
                      </button>

                    </>
                  )}
                </div>
              </div>
              {isExpanded && (
                 <div className="px-6 pb-6 pt-2 bg-gray-50 dark:bg-gray-700/30 text-sm text-gray-700 dark:text-gray-300 space-y-2 border-t border-gray-100 dark:border-gray-700">
                    <p><strong>Date:</strong> {format(new Date(payment.date), 'dd MMMM yyyy', { locale: fr })}</p>
                    <p><strong>Montant:</strong> {Math.abs(Number(payment.amount))} $</p>
                    <p><strong>Méthode:</strong> {payment.method}</p>
                    <p><strong>Type:</strong> {payment.type}</p>
                    {payment.notes && <p><strong>Détails:</strong> {payment.notes}</p>}
                    {payment.isExpense && <p className="text-xs italic mt-2 text-gray-500">* Cette dépense a été déduite de la garantie locative du locataire.</p>}
                 </div>
              )}
              </div>
            );
            })
          )}
        </div>
      </div>

      {showPaymentForm && (
        <AddPaymentModal tenant={tenant} onClose={() => setShowPaymentForm(false)} />
      )}
      {showEditTenant && (
        <EditTenantModal tenant={tenant} onClose={() => setShowEditTenant(false)} />
      )}
      {editingPayment && (
        <EditPaymentModal payment={editingPayment} onClose={() => setEditingPayment(null)} />
      )}
      {showDeleteConfirm && (
        <ConfirmModal 
          title="Supprimer le locataire" 
          message="Êtes-vous sûr de vouloir supprimer ce locataire ? Cette action est irréversible et supprimera également l'accès à son historique depuis cette page."
          onConfirm={handleDeleteTenant} 
          onCancel={() => setShowDeleteConfirm(false)} 
        />
      )}
      {showDeductPrompt && (
        <DeductGuaranteeModal 
          tenant={tenant} 
          onConfirm={handleDeductGuarantee} 
          onCancel={() => setShowDeductPrompt(false)} 
        />
      )}
      {showRestorePrompt && (
        <RestoreGuaranteeModal 
          tenant={tenant} 
          onConfirm={handleRestoreGuarantee} 
          onCancel={() => setShowRestorePrompt(false)} 
        />
      )}
      {showPortalLinkModal && (
        <PortalLinkModal tenant={tenant} onClose={() => setShowPortalLinkModal(false)} />
      )}

      {showPhotoModal && tenant.photoUrl && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[60]" onClick={() => setShowPhotoModal(false)}>
          <img src={tenant.photoUrl} alt={tenant.name} className="max-w-full max-h-[90vh] object-contain rounded-xl" />
          <button className="absolute top-4 right-4 text-white hover:text-gray-300 w-10 h-10 flex items-center justify-center bg-black/50 rounded-full">
            <span className="text-xl font-bold">×</span>
          </button>
        </div>
      )}
    </div>
  );
}

function PortalLinkModal({ tenant, onClose }: { tenant: any, onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const baseUrl = window.location.origin;
  const paymentUrl = `${baseUrl}/pay/${tenant.id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(paymentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-8 text-center transition-colors relative">
        <button 
          onClick={onClose}
          className="absolute top-4 left-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 mt-4">Espace Locataire</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">Partagez ce lien avec votre locataire pour qu'il puisse payer son loyer ou signaler un problème.</p>
        
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 rounded-lg mb-6 break-all">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 select-all">{paymentUrl}</p>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={copyLink}
            className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            {copied ? 'Lien copié !' : 'Copier le lien'}
          </button>
          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors inline-block"
          >
            Ouvrir l'espace locataire
          </a>
          <button 
            onClick={onClose} 
            className="w-full py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel }: { title: string, message: string, onConfirm: () => void, onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Annuler</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors">Confirmer</button>
        </div>
      </div>
    </div>
  );
}

function DeductGuaranteeModal({ tenant, onConfirm, onCancel }: { tenant: any, onConfirm: (data: {amount: number, type: string, notes: string}) => void, onCancel: () => void }) {
  const [amount, setAmount] = useState(tenant.monthlyRent.toString());
  const [type, setType] = useState('Loyer');
  const [notes, setNotes] = useState('Déduction automatique sur la garantie.');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const num = Number(amount);
    if (num > tenant.guaranteeAmount) {
      setError(`Le montant ne peut pas dépasser la garantie actuelle (${tenant.guaranteeAmount} $).`);
      return;
    }
    if (num > 0) {
      onConfirm({ amount: num, type, notes });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Déduire de la garantie</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">Garantie actuelle : {tenant.guaranteeAmount} $</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motif de la déduction</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option>Loyer</option>
              <option>Eau</option>
              <option>Électricité / Lumière</option>
              <option>Frais syndics</option>
              <option>Internet / Networks</option>
              <option>Ventilation / Climatisation</option>
              <option>Plomberies</option>
              <option>Canalisation</option>
              <option>Dépenses / Réparations</option>
              <option>Autre</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Montant à déduire ($)</label>
            <input 
              required 
              type="number" 
              min="1" 
              max={tenant.guaranteeAmount}
              value={amount} 
              onChange={e => {
                setAmount(e.target.value);
                setError('');
              }} 
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea 
              rows={2}
              value={notes} 
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Annuler</button>
            <button type="submit" className="flex-1 py-2.5 px-4 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-colors">Déduire</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddPaymentModal({ tenant, onClose }: { tenant: any, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    amount: tenant.monthlyRent.toString(),
    date: new Date().toISOString().split('T')[0],
    method: 'Cash',
    type: 'Loyer',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'payments'), {
        ...formData,
        amount: Number(formData.amount),
        date: new Date(formData.date).toISOString(),
        tenantId: tenant.id,
        landlordId: auth.currentUser.uid,
        createdAt: now
      });
      onClose();
    } catch (error) {
      console.error("Error adding payment", error);
      setError("Erreur lors de l'ajout.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full transition-colors">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Nouveau Paiement</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pour {tenant.name}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de paiement</label>
            <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option>Loyer</option>
              <option>Garantie</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Montant ($)</label>
            <input required type="number" min="1" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Méthode</label>
            <select value={formData.method} onChange={e => setFormData({...formData, method: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option>Cash</option>
              <option>Mobile Money</option>
              <option>Banque</option>
              <option>Déduction Garantie</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optionnel)</label>
            <textarea rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="Commentaires sur le paiement..." />
          </div>
          
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Annuler</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 px-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RestoreGuaranteeModal({ tenant, onConfirm, onCancel }: { tenant: any, onConfirm: (amount: number) => void, onCancel: () => void }) {
  const [amount, setAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (num > 0) {
      onConfirm(num);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Restaurer la garantie</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4 text-sm">Garantie actuelle : {tenant.guaranteeAmount} $</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Montant payé pour la garantie ($)</label>
            <input 
              required 
              type="number" 
              min="1" 
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Annuler</button>
            <button type="submit" className="flex-1 py-2.5 px-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors">Restaurer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditTenantModal({ tenant, onClose }: { tenant: any, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: tenant.name,
    email: tenant.email || '',
    phone: tenant.phone,
    address: tenant.address,
    entryDate: tenant.entryDate.split('T')[0],
    housingType: tenant.housingType,
    level: tenant.level || 0,
    guaranteeAmount: tenant.guaranteeAmount.toString(),
    guaranteeStatus: tenant.guaranteeStatus,
    monthlyRent: tenant.monthlyRent.toString(),
    photoUrl: tenant.photoUrl || '',
    familyStatus: tenant.familyStatus || 'Célibataire',
    childrenCount: tenant.childrenCount?.toString() || '0',
    cohabitants: tenant.cohabitants || '',
    idType: tenant.idType || 'Carte d\'électeur',
    idNumber: tenant.idNumber || '',
    waterAmount: tenant.waterAmount?.toString() || '0',
    electricityAmount: tenant.electricityAmount?.toString() || '0',
    syndicAmount: tenant.syndicAmount?.toString() || '0',
    networkAmount: tenant.networkAmount?.toString() || '0',
    cleaningAmount: tenant.cleaningAmount?.toString() || '0',
    otherAmount: tenant.otherAmount?.toString() || '0'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const updateData: any = {
        ...formData,
        guaranteeAmount: Number(formData.guaranteeAmount || 0),
        monthlyRent: Number(formData.monthlyRent || 0),
        childrenCount: Number(formData.childrenCount || 0),
        waterAmount: Number(formData.waterAmount || 0),
        electricityAmount: Number(formData.electricityAmount || 0),
        syndicAmount: Number(formData.syndicAmount || 0),
        networkAmount: Number(formData.networkAmount || 0),
        cleaningAmount: Number(formData.cleaningAmount || 0),
        otherAmount: Number(formData.otherAmount || 0),
        entryDate: new Date(formData.entryDate).toISOString(),
        hasNewUpdates: true,
        updatedAt: new Date().toISOString()
      };
      
      if (updateData.housingType !== 'Appartement' && updateData.housingType !== 'Immeuble') {
          updateData.level = deleteField();
      }

      if (!updateData.photoUrl) {
        delete updateData.photoUrl;
      }
      await updateDoc(doc(db, 'tenants', tenant.id), updateData);
      onClose();
    } catch (error) {
      console.error("Error updating tenant", error);
      setError("Erreur lors de la modification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full my-8 transition-colors">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Modifier le locataire</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom complet</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Téléphone</label>
                <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email (pour la sécurité locataire)</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse / N° Porte</label>
                <input required type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo (optionnel)</label>
                <input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setFormData({...formData, photoUrl: reader.result as string});
                    reader.readAsDataURL(file);
                  } else {
                    setFormData({...formData, photoUrl: ''});
                  }
                }} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                {formData.photoUrl && <img src={formData.photoUrl} alt="Aperçu" className="mt-2 h-16 w-16 object-cover rounded-lg" />}
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date d'entrée</label>
                <input required type="date" value={formData.entryDate} onChange={e => setFormData({...formData, entryDate: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de logement</label>
                <select value={formData.housingType} onChange={e => setFormData({...formData, housingType: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option>Appartement</option>
                  <option>Maison</option>
                  <option>Chambre</option>
                  <option>Studio</option>
                  <option>Boutique</option>
                </select>
              </div>
              {(formData.housingType === 'Appartement' || formData.housingType === 'Immeuble') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Étage sélectionné</label>
                  <input required type="number" min="0" value={formData.level} onChange={e => setFormData({...formData, level: parseInt(e.target.value) || 0})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: 2 pour le 2ème étage" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Garantie ($)</label>
                  <input required type="number" min="0" value={formData.guaranteeAmount} onChange={e => setFormData({...formData, guaranteeAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut garantie</label>
                  <select value={formData.guaranteeStatus} onChange={e => setFormData({...formData, guaranteeStatus: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option>Non payée</option>
                    <option>Partielle</option>
                    <option>Payée</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Loyer mensuel ($)</label>
                <input required type="number" min="1" value={formData.monthlyRent} onChange={e => setFormData({...formData, monthlyRent: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Eau ($)</label>
                  <input required type="number" min="0" value={formData.waterAmount} onChange={e => setFormData({...formData, waterAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Électricité ($)</label>
                  <input required type="number" min="0" value={formData.electricityAmount} onChange={e => setFormData({...formData, electricityAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Frais syndics ($)</label>
                  <input required type="number" min="0" value={formData.syndicAmount} onChange={e => setFormData({...formData, syndicAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Internet / Networks ($)</label>
                  <input required type="number" min="0" value={formData.networkAmount} onChange={e => setFormData({...formData, networkAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entretien ($)</label>
                  <input required type="number" min="0" value={formData.cleaningAmount} onChange={e => setFormData({...formData, cleaningAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Autre ($)</label>
                  <input required type="number" min="0" value={formData.otherAmount} onChange={e => setFormData({...formData, otherAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de pièce d'identité</label>
                  <select value={formData.idType} onChange={e => setFormData({...formData, idType: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option>Carte d'électeur</option>
                    <option>Permis de conduire</option>
                    <option>Passeport</option>
                    <option>Carte d'identité</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Numéro de la pièce</label>
                  <input type="text" value={formData.idNumber} onChange={e => setFormData({...formData, idNumber: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut marital</label>
                  <select value={formData.familyStatus} onChange={e => setFormData({...formData, familyStatus: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option>Célibataire</option>
                    <option>En couple</option>
                    <option>Marié(e)</option>
                    <option>Divorcé(e)</option>
                    <option>Veuf/Veuve</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enfants</label>
                  <input required type="number" min="0" value={formData.childrenCount} onChange={e => setFormData({...formData, childrenCount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cohabitants</label>
                <input type="text" value={formData.cohabitants} onChange={e => setFormData({...formData, cohabitants: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Frère, ami..." />
              </div>
            </div>
          </div>
          
          <div className="pt-4 flex gap-3 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Annuler</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditPaymentModal({ payment, onClose }: { payment: any, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    amount: payment.amount.toString(),
    date: payment.date.split('T')[0],
    method: payment.method,
    type: payment.type,
    notes: payment.notes || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
        const oldMethod = payment.method;
        const oldAmount = payment.amount;
        const newMethod = formData.method;
        const newAmount = Number(formData.amount);

        let guaranteeAdjustment = 0;

        if (oldMethod === 'Déduction Garantie' && newMethod !== 'Déduction Garantie') {
          // Restoring the full old amount
          guaranteeAdjustment = oldAmount;
        } else if (oldMethod !== 'Déduction Garantie' && newMethod === 'Déduction Garantie') {
          // Deducting the new amount
          guaranteeAdjustment = -newAmount;
        } else if (oldMethod === 'Déduction Garantie' && newMethod === 'Déduction Garantie') {
          // Adjusting the difference
          guaranteeAdjustment = oldAmount - newAmount;
        }

        if (guaranteeAdjustment !== 0) {
          const tenantRef = doc(db, 'tenants', payment.tenantId);
          const tenantSnap = await getDoc(tenantRef);
          if (tenantSnap.exists()) {
            const currentGuarantee = tenantSnap.data().guaranteeAmount || 0;
            const newGuarantee = currentGuarantee + guaranteeAdjustment;
            
            let status = tenantSnap.data().guaranteeStatus;
            if (newGuarantee <= 0) status = 'Non payée';
            else if (newGuarantee < tenantSnap.data().monthlyRent * 3) status = 'Partielle';
            else status = 'Payée';

            await updateDoc(tenantRef, {
              guaranteeAmount: newGuarantee,
              guaranteeStatus: status
            });
          }
        }

      await updateDoc(doc(db, 'payments', payment.id), {
        ...formData,
        amount: newAmount,
        date: new Date(formData.date).toISOString()
      });
      onClose();
    } catch (error) {
      console.error("Error updating payment", error);
      setError("Erreur lors de la modification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full transition-colors">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Modifier le paiement</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de paiement</label>
            <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option>Loyer</option>
              <option>Garantie</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Montant ($)</label>
            <input required type="number" min="1" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Méthode</label>
            <select value={formData.method} onChange={e => setFormData({...formData, method: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option>Cash</option>
              <option>Mobile Money</option>
              <option>Banque</option>
              <option>Déduction Garantie</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optionnel)</label>
            <textarea rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="Commentaires sur le paiement..." />
          </div>
          
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Annuler</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
