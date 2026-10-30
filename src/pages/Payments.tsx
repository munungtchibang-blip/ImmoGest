import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { 
  CreditCard, 
  Search, 
  Download, 
  ArrowLeft, 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCcw, 
  Clock, 
  Ban, 
  Check, 
  Smartphone,
  ShieldCheck
} from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import { useSubscription } from '../context/SubscriptionContext';
import { LandlordPaymentProofs } from '../components/LandlordPaymentProofs';
import toast from 'react-hot-toast';
import { 
  DEFAULT_CURRENCY_CONFIG, 
  PaymentRecord, 
  PaymentStatus,
  calculateTenantFinancials, 
  findPotentialDuplicates, 
  createPaymentAdjustment, 
  generateReceiptNumber 
} from '../services/financialEngine';

export function Payments() {
  const { subscription, openSubscriptionModal } = useSubscription();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [tenantsMap, setTenantsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [guaranteeFilter, setGuaranteeFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'tenant' | 'amount', direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
  const [viewingPayment, setViewingPayment] = useState<PaymentRecord | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showPostPayModal, setShowPostPayModal] = useState(false);
  const [cancellingPayment, setCancellingPayment] = useState<PaymentRecord | null>(null);
  const [duplicateInspection, setDuplicateInspection] = useState<PaymentRecord[] | null>(null);

  // Status Filter Tabs
  const [activeTab, setActiveTab] = useState<'all' | 'confirmed' | 'pending' | 'proofs' | 'disputed' | 'unpaid' | 'adjustments'>('all');

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    let unsub: () => void;

    const fetchTenants = async () => {
      const qT = query(collection(db, 'tenants'), where('landlordId', '==', uid));
      const snap = await getDocs(qT);
      const map: Record<string, any> = {};
      snap.forEach(docSnap => {
        map[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      setTenantsMap(map);
      
      const qP = query(collection(db, 'payments'), where('landlordId', '==', uid));
      unsub = onSnapshot(qP, (snapshot) => {
        const data = snapshot.docs.map(docSnap => ({ 
          id: docSnap.id, 
          ...(docSnap.data() as any) 
        })) as PaymentRecord[];
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setPayments(data);
        setLoading(false);
      }, (error) => { handleFirestoreError(error, OperationType.LIST, 'payments'); });
    };

    fetchTenants();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Duplicate payment map
  const potentialDuplicates = useMemo(() => {
    return findPotentialDuplicates(payments);
  }, [payments]);

  // Tab counters
  const counts = useMemo(() => {
    const confirmed = payments.filter(p => (!p.status || p.status === 'Confirmé') && !p.isAdjustment).length;
    const pending = payments.filter(p => p.status === 'En attente').length;
    const disputed = payments.filter(p => p.status === 'Contesté' || p.status === 'Échoué').length;
    const adjustments = payments.filter(p => p.isAdjustment || p.status === 'Annulé').length;
    return { confirmed, pending, disputed, adjustments };
  }, [payments]);

  // Generate official PDF receipt
  const generateReceipt = (payment: PaymentRecord) => {
    const tenant = tenantsMap[payment.tenantId];
    if (!tenant) return;
    const doc = new jsPDF();
    
    const primaryColor = [30, 58, 138]; // Navy Blue
    const emeraldColor = [16, 185, 129];
    const textColor = [55, 65, 81];
    const lightGray = [248, 250, 252];

    // Header background
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 42, 'F');

    // Header title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    const docTitle = payment.type === 'Garantie' ? 'QUITTANCE DE CAUTION' : 'QUITTANCE DE LOYER';
    doc.text(docTitle, 105, 24, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('ImmoGest • Système Certifié de Gestion Locative', 105, 33, { align: 'center' });

    // Reset text color
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

    // Box: Quittance Details
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(16, 50, 178, 28, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('RÉFÉRENCES DE LA QUITTANCE', 22, 58);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const recNum = payment.receiptNumber || generateReceiptNumber(payment.id);
    doc.text(`N° Pièce Comptable : ${recNum}`, 22, 66);
    doc.text(`Date d'encaissement : ${format(new Date(payment.date), 'dd MMMM yyyy', { locale: fr })}`, 22, 72);
    doc.text(`Statut : ${payment.status || 'Confirmé'} (Validé)`, 120, 66);
    doc.text(`Mode : ${payment.method}${payment.mobileMoneyProvider ? ` (${payment.mobileMoneyProvider})` : ''}`, 120, 72);

    // Box: Tenant & Property
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('LOCATAIRE & BIEN LOUÉ', 16, 90);
    doc.line(16, 92, 194, 92);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nom complet : ${tenant.name}`, 16, 102);
    doc.text(`Téléphone : ${tenant.phone || 'Non renseigné'}`, 16, 110);
    doc.text(`Adresse du bien : ${tenant.address || 'Adresse principale'}`, 16, 118);
    doc.text(`Nature du versement : ${payment.type}`, 16, 126);

    // Big Amount Box
    doc.setDrawColor(emeraldColor[0], emeraldColor[1], emeraldColor[2]);
    doc.setLineWidth(0.8);
    doc.setFillColor(240, 253, 244); // light green
    doc.roundedRect(120, 98, 74, 34, 3, 3, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(5, 150, 105);
    doc.text('MONTANT ENCAISSÉ', 157, 107, { align: 'center' });

    doc.setFontSize(16);
    const displayAmount = payment.currency === 'CDF'
      ? `${Number(payment.amount).toLocaleString()} CDF`
      : `${Number(payment.amount).toLocaleString()} $`;
    doc.text(displayAmount, 157, 118, { align: 'center' });

    if (payment.currency === 'CDF' && payment.exchangeRate) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      const eqUSD = Math.round(payment.amount / payment.exchangeRate);
      doc.text(`(Équivalent : ~${eqUSD}$ au taux de ${payment.exchangeRate} CDF/$)`, 157, 126, { align: 'center' });
    }

    // Payment notes / Reference
    let startY = 145;
    if (payment.transactionRef) {
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Référence transaction : ${payment.transactionRef}`, 16, startY);
      startY += 8;
    }

    if (payment.notes) {
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text(`Observations : « ${payment.notes} »`, 16, startY);
      startY += 12;
    }

    // Legal notice
    doc.setDrawColor(226, 232, 240);
    doc.line(16, 230, 194, 230);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Ce reçu a été émis informatiquement par ImmoGest et atteste du règlement libératoire de la somme susmentionnée.', 105, 238, { align: 'center' });
    doc.text('Toute falsification est punie par la loi. Pour toute vérification, contacter le gestionnaire immobilier.', 105, 243, { align: 'center' });

    const pdfBlob = doc.output('blob');
    const fileName = `Quittance_${recNum}_${tenant.name.replace(/\s+/g, '_')}.pdf`;
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

    const downloadPDF = () => {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    };

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: 'Quittance de loyer',
        text: `Voici la quittance pour ${tenant.name}.`
      }).catch(() => downloadPDF());
    } else {
      downloadPDF();
    }
  };

  // Filter payments
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const tenantDetails = tenantsMap[p.tenantId];
      const tenantName = tenantDetails?.name || '';
      const paymentDate = new Date(p.date);
      const m = (paymentDate.getMonth() + 1).toString();
      const y = paymentDate.getFullYear().toString();

      // Search
      const matchSearch = tenantName.toLowerCase().includes(search.toLowerCase()) || 
             p.type.toLowerCase().includes(search.toLowerCase()) ||
             (p.transactionRef && p.transactionRef.toLowerCase().includes(search.toLowerCase()));
             
      const matchMonth = monthFilter === '' || m === monthFilter;
      const matchYear = yearFilter === '' || y === yearFilter;
      const matchCurrency = currencyFilter === 'all' || (p.currency || 'USD') === currencyFilter;

      // Tab filter
      let matchTab = true;
      if (activeTab === 'confirmed') {
        matchTab = (!p.status || p.status === 'Confirmé') && !p.isAdjustment;
      } else if (activeTab === 'pending') {
        matchTab = p.status === 'En attente';
      } else if (activeTab === 'disputed') {
        matchTab = p.status === 'Contesté' || p.status === 'Échoué';
      } else if (activeTab === 'adjustments') {
        matchTab = !!p.isAdjustment || p.status === 'Annulé';
      }

      // Guarantee filter
      let matchGuarantee = true;
      if (guaranteeFilter !== '') {
        if (p.type === 'Garantie' && tenantDetails?.guaranteeStatus === guaranteeFilter) {
          matchGuarantee = true;
        } else {
          matchGuarantee = false;
        }
      }

      return matchSearch && matchMonth && matchYear && matchCurrency && matchTab && matchGuarantee;
    });
  }, [payments, tenantsMap, search, monthFilter, yearFilter, currencyFilter, activeTab, guaranteeFilter]);

  // Sorting
  const sortedPayments = useMemo(() => {
    return [...filteredPayments].sort((a, b) => {
      if (sortConfig.key === 'date') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
      } else if (sortConfig.key === 'amount') {
        const amtA = a.amountUSD || a.amount;
        const amtB = b.amountUSD || b.amount;
        return sortConfig.direction === 'asc' ? amtA - amtB : amtB - amtA;
      } else if (sortConfig.key === 'tenant') {
        const nameA = tenantsMap[a.tenantId]?.name || '';
        const nameB = tenantsMap[b.tenantId]?.name || '';
        return sortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      return 0;
    });
  }, [filteredPayments, sortConfig, tenantsMap]);

  // Fast landlord validation of a pending payment
  const handleValidatePendingPayment = async (payment: PaymentRecord) => {
    if (!auth.currentUser) return;
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'payments', payment.id), {
        status: 'Confirmé',
        confirmedAt: now,
        confirmedBy: auth.currentUser.uid
      });
      toast.success("Paiement validé avec succès !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la validation du paiement.");
    }
  };

  return (
    <div className="space-y-6 page-enter">
      <Link to="/" className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-xs border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium text-xs sm:text-sm">
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" /> Retour au tableau de bord
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Paiements & Trésorerie</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              Multi-devises USD / CDF
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5">
            Suivi rigoureux des loyers encaissés, avances, cautions isolées et rapprochements.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddPayment(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-xs"
          >
            <CreditCard className="w-4 h-4" />
            Nouveau Paiement
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 scrollbar-none">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Tous</span>
          <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">{payments.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('confirmed')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'confirmed'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Confirmés</span>
          <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 rounded-full text-[10px]">
            {counts.confirmed}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'pending'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>En Attente de Vérification</span>
          {counts.pending > 0 && (
            <span className="px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded-full text-[10px] animate-pulse">
              {counts.pending}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('proofs')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'proofs'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Preuves Reçues</span>
        </button>

        <button
          onClick={() => setActiveTab('unpaid')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'unpaid'
              ? 'bg-red-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Mois Impayés & Arriérés</span>
        </button>

        <button
          onClick={() => setActiveTab('adjustments')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'adjustments'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Ajustements & Contre-passations</span>
          <span className="px-1.5 py-0.2 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 rounded-full text-[10px]">
            {counts.adjustments}
          </span>
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Rechercher par locataire, référence, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs sm:text-sm text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={guaranteeFilter}
            onChange={(e) => setGuaranteeFilter(e.target.value)}
            className="p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none"
          >
            <option value="">Status Caution (Tous)</option>
            <option value="Payée">Caution Payée</option>
            <option value="Partielle">Caution Partielle</option>
            <option value="Non payée">Caution Non Payée</option>
          </select>
          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className="p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none"
          >
            <option value="all">Toutes devises</option>
            <option value="USD">USD ($)</option>
            <option value="CDF">CDF (Franc congolais)</option>
          </select>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none"
          >
            <option value="">Tous les mois</option>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <option key={m} value={m.toString()}>
                {format(new Date(2024, m - 1, 1), 'MMMM', { locale: fr })}
              </option>
            ))}
          </select>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none"
          >
            <option value="">Toutes les années</option>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
              <option key={y} value={y.toString()}>{y}</option>
            ))}
          </select>
          <select
            value={`${sortConfig.key}-${sortConfig.direction}`}
            onChange={(e) => {
              const [key, direction] = e.target.value.split('-');
              setSortConfig({ key: key as any, direction: direction as any });
            }}
            className="p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none"
          >
            <option value="date-desc">Date (Plus récent)</option>
            <option value="date-asc">Date (Plus ancien)</option>
            <option value="tenant-asc">Locataire (A-Z)</option>
            <option value="amount-desc">Montant (Décroissant)</option>
          </select>
        </div>
      </div>

      {/* Content depending on active tab */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
        </div>
      ) : activeTab === 'proofs' ? (
        auth.currentUser ? (
          <LandlordPaymentProofs
            landlordId={auth.currentUser.uid}
            onPaymentCreated={() => setActiveTab('all')}
          />
        ) : null
      ) : activeTab === 'unpaid' ? (
        <UnpaidTab tenants={Object.values(tenantsMap)} payments={payments} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700 overflow-hidden">
          {sortedPayments.length === 0 ? (
            <div className="p-12 text-center">
              <CreditCard className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">Aucun paiement trouvé dans cette vue.</p>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.05 }
                }
              }}
              className="divide-y divide-gray-100 dark:divide-gray-750"
            >
              {sortedPayments.map(payment => {
                const tenant = tenantsMap[payment.tenantId];
                const isDupe = potentialDuplicates.has(payment.id);
                const isAdj = payment.isAdjustment || Number(payment.amount) < 0;
                const isCancelled = payment.status === 'Annulé';
                const isPending = payment.status === 'En attente';

                return (
                  <motion.div 
                    key={payment.id} 
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.25 } }
                    }}
                    onClick={() => setViewingPayment(payment)}
                    className={`p-3 sm:px-4 sm:py-3 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors cursor-pointer ${
                      isAdj ? 'bg-purple-50/40 dark:bg-purple-950/20' : ''
                    } ${isCancelled ? 'opacity-60 bg-gray-50/60 dark:bg-gray-900/40' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                        isAdj 
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                          : payment.type === 'Garantie' 
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                            : isPending
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                      }`}>
                        {payment.currency === 'CDF' ? 'FC' : '$'}
                      </div>
                      
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                            {tenant?.name || 'Locataire inconnu'}
                          </p>

                          {/* Badges */}
                          {isDupe && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDuplicateInspection(potentialDuplicates.get(payment.id) || [payment]);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 hover:bg-amber-200 transition-colors"
                              title="Détection de paiement en double"
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Doublon suspect
                            </button>
                          )}

                          {isAdj && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                              <RotateCcw className="w-2.5 h-2.5" />
                              Contre-passation
                            </span>
                          )}

                          {isPending && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                              <Clock className="w-2.5 h-2.5" />
                              À valider
                            </span>
                          )}

                          {isCancelled && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                              <Ban className="w-2.5 h-2.5" />
                              Annulé
                            </span>
                          )}

                          {payment.reconciled && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300">
                              <Check className="w-2.5 h-2.5" />
                              Rapproché
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {format(new Date(payment.date), 'dd MMM yyyy', { locale: fr })} • {payment.type} • {payment.method}
                          {payment.mobileMoneyProvider ? ` (${payment.mobileMoneyProvider})` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="text-right">
                        <p className={`font-bold text-xs sm:text-sm ${
                          isAdj ? 'text-purple-600 dark:text-purple-400' : 'text-gray-900 dark:text-white'
                        }`}>
                          {payment.currency === 'CDF'
                            ? `${Number(payment.amount).toLocaleString()} CDF`
                            : `${Number(payment.amount).toLocaleString()} $`}
                        </p>
                        {payment.currency === 'CDF' && payment.exchangeRate && (
                          <p className="text-[10px] text-gray-400">
                            ~{Math.round(payment.amount / payment.exchangeRate)}$ (Taux: {payment.exchangeRate})
                          </p>
                        )}
                      </div>

                      {/* Quick validate if pending */}
                      {isPending && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleValidatePendingPayment(payment);
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                          title="Confirmer la réception de ce paiement"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Valider</span>
                        </button>
                      )}

                      {/* Download Receipt */}
                      {!isCancelled && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); generateReceipt(payment); }}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          title="Télécharger la quittance officielle"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}

                      {/* Reversible Adjustment Modal trigger */}
                      {!isAdj && !isCancelled && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCancellingPayment(payment);
                          }}
                          className="text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 p-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                          title="Régulariser par contre-passation (annulation traçable)"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      )}

      {/* Add Payment Modal */}
      {showAddPayment && (
        <AddPaymentModal
          tenants={Object.entries(tenantsMap).map(([id, t]) => ({ id, ...(t as any) }))}
          onClose={() => setShowAddPayment(false)}
          onSuccess={() => {
            setShowAddPayment(false);
            if (subscription.tierId !== 'pro' && subscription.tierId !== 'vip') {
              setShowPostPayModal(true);
            }
          }}
        />
      )}

      {/* Traceable Cancellation / Contre-passation Modal */}
      {cancellingPayment && (
        <CancelAdjustmentModal
          payment={cancellingPayment}
          tenantName={tenantsMap[cancellingPayment.tenantId]?.name || 'Locataire'}
          onClose={() => setCancellingPayment(null)}
          onSuccess={() => {
            setCancellingPayment(null);
            toast.success("Contre-passation enregistrée avec succès. La traçabilité comptable est préservée.");
          }}
        />
      )}

      {/* Duplicates inspection modal */}
      {duplicateInspection && (
        <DuplicateInspectionModal
          duplicates={duplicateInspection}
          tenantsMap={tenantsMap}
          onClose={() => setDuplicateInspection(null)}
          onCancelPayment={(p) => {
            setDuplicateInspection(null);
            setCancellingPayment(p);
          }}
        />
      )}

      {/* Viewing Payment Detail Modal */}
      {viewingPayment && (
        <div className="fixed inset-0 bg-slate-900/10 dark:bg-black/20 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-7 border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-5 border-b border-gray-100 dark:border-gray-700 pb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                Détail de la transaction
              </h2>
              <button onClick={() => setViewingPayment(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <span className="text-gray-500 dark:text-gray-400">Locataire</span>
                <span className="font-bold text-gray-900 dark:text-white">{tenantsMap[viewingPayment.tenantId]?.name || 'Inconnu'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <span className="text-gray-500 dark:text-gray-400">Nature</span>
                <span className="font-semibold text-gray-900 dark:text-white">{viewingPayment.type}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <span className="text-gray-500 dark:text-gray-400">Statut</span>
                <span className="font-semibold px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {viewingPayment.status || 'Confirmé'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <span className="text-gray-500 dark:text-gray-400">Montant Nominal</span>
                <span className="font-bold text-emerald-600 text-base">
                  {viewingPayment.currency === 'CDF'
                    ? `${Number(viewingPayment.amount).toLocaleString()} CDF`
                    : `${Number(viewingPayment.amount).toLocaleString()} $`}
                </span>
              </div>
              {viewingPayment.currency === 'CDF' && viewingPayment.exchangeRate && (
                <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                  <span className="text-gray-500 dark:text-gray-400">Taux appliqué</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">1 USD = {viewingPayment.exchangeRate} CDF</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <span className="text-gray-500 dark:text-gray-400">Moyen de règlement</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {viewingPayment.method}
                  {viewingPayment.mobileMoneyProvider ? ` • ${viewingPayment.mobileMoneyProvider}` : ''}
                </span>
              </div>
              {viewingPayment.transactionRef && (
                <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                  <span className="text-gray-500 dark:text-gray-400">Réf. transaction</span>
                  <span className="font-mono text-gray-900 dark:text-white">{viewingPayment.transactionRef}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <span className="text-gray-500 dark:text-gray-400">Date</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {format(new Date(viewingPayment.date), 'dd MMMM yyyy', { locale: fr })}
                </span>
              </div>

              {viewingPayment.cancellationReason && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl text-xs text-red-700 dark:text-red-300">
                  <span className="font-bold block">Motif de régularisation :</span>
                  {viewingPayment.cancellationReason}
                </div>
              )}

              {viewingPayment.notes && (
                <div className="p-2.5 bg-gray-50 dark:bg-gray-900 rounded-xl text-xs text-gray-600 dark:text-gray-400 italic">
                  "{viewingPayment.notes}"
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-2">
              <button 
                onClick={() => generateReceipt(viewingPayment)}
                className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Quittance PDF
              </button>
              <button 
                onClick={() => setViewingPayment(null)} 
                className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-medium transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pro recommendation modal after payment */}
      {showPostPayModal && (
        <div className="fixed inset-0 bg-slate-900/10 dark:bg-black/20 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base">
              Paiement Enregistré !
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">
              La quittance a été émise. Avec le forfait <strong>Professionnel</strong>, envoyez la quittance directement par WhatsApp et synchronisez automatiquement vos relevés Mobile Money.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setShowPostPayModal(false);
                  openSubscriptionModal('pro');
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold shadow-md transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Passer au Forfait Pro Recommandé</span>
              </button>
              <button
                onClick={() => setShowPostPayModal(false)}
                className="w-full py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Continuer sans changer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Unpaid & Arrears Tab calculating automated rental statements
 */
function UnpaidTab({ tenants, payments }: { tenants: any[], payments: PaymentRecord[] }) {
  const statements = useMemo(() => {
    return tenants.map(t => {
      const fin = calculateTenantFinancials(t, payments);
      return {
        ...t,
        ...fin
      };
    }).filter(t => !t.isUpToDate).sort((a, b) => b.netRentBalanceUSD - a.netRentBalanceUSD);
  }, [tenants, payments]);

  if (statements.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700 p-12 text-center transition-colors">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <p className="text-gray-900 dark:text-white font-bold text-lg">Aucun retard de paiement !</p>
        <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1">
          Tous vos locataires sont parfaitement à jour dans leurs loyers exigibles.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="divide-y divide-gray-100 dark:divide-gray-750">
        {statements.map(tenant => (
          <div key={tenant.id} className="p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 flex items-center justify-center shrink-0 text-xs font-bold">
                <span>{tenant.unpaidMonths}m</span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white truncate">{tenant.name}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {tenant.address} • <span className="text-red-500 font-semibold">{tenant.unpaidMonths} mois impayé(s)</span>
                  {tenant.guaranteeRemainingUSD > 0 && ` • Caution due: ${tenant.guaranteeRemainingUSD}$`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
              <div className="text-right">
                <p className="font-bold text-red-600 dark:text-red-400 text-sm sm:text-base">
                  {tenant.netRentBalanceUSD.toLocaleString()} $
                </p>
                <p className="text-[10px] text-gray-400">
                  (~{tenant.netRentBalanceCDF.toLocaleString()} CDF)
                </p>
              </div>
              <a 
                href={`https://wa.me/${tenant.phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Bonjour ${tenant.name}, ceci est un rappel concernant votre solde locatif de ${tenant.netRentBalanceUSD.toLocaleString()} $ (${tenant.unpaidMonths} mois impayés). Merci de régulariser la situation dans les plus brefs délais.`)}`}
                target="_blank"
                rel="noreferrer"
                className="bg-emerald-600 hover:bg-emerald-700 text-white p-1.5 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-colors shadow-xs"
                title="Relancer sur WhatsApp"
              >
                Relancer
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Add Payment Modal supporting USD/CDF, live rate, and Mobile Money details
 */
function AddPaymentModal({ tenants, onClose, onSuccess }: { tenants: any[], onClose: () => void, onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'CDF'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(DEFAULT_CURRENCY_CONFIG.defaultRateUSDToCDF);
  const [formData, setFormData] = useState({
    tenantId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'Cash',
    mobileMoneyProvider: 'M-Pesa' as const,
    transactionRef: '',
    type: 'Loyer',
    notes: '',
    status: 'Confirmé' as PaymentStatus
  });

  const convertedEquivalent = useMemo(() => {
    const num = Number(formData.amount) || 0;
    if (currency === 'USD') {
      return `${(num * exchangeRate).toLocaleString()} CDF`;
    } else {
      return `${Math.round(num / exchangeRate).toLocaleString()} $`;
    }
  }, [formData.amount, currency, exchangeRate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !formData.tenantId) {
      setError('Veuillez sélectionner un locataire.');
      return;
    }
    const numAmount = Number(formData.amount);
    if (!numAmount || numAmount <= 0) {
      setError('Veuillez indiquer un montant valide.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const now = new Date().toISOString();
      const amountUSD = currency === 'USD' ? numAmount : Math.round((numAmount / exchangeRate) * 100) / 100;
      const amountCDF = currency === 'CDF' ? numAmount : Math.round(numAmount * exchangeRate);

      const pRef = collection(db, 'payments');
      const tempId = Math.random().toString(36).substring(2, 8);
      const receiptNumber = generateReceiptNumber(tempId);

      const paymentData = {
        amount: numAmount,
        currency,
        exchangeRate,
        amountUSD,
        amountCDF,
        date: new Date(formData.date).toISOString(),
        method: formData.method,
        mobileMoneyProvider: formData.method === 'Mobile Money' ? formData.mobileMoneyProvider : undefined,
        transactionRef: formData.transactionRef.trim() || undefined,
        type: formData.type,
        notes: formData.notes.trim() || undefined,
        receiptNumber,
        status: formData.status,
        tenantId: formData.tenantId,
        landlordId: auth.currentUser.uid,
        confirmedAt: formData.status === 'Confirmé' ? now : undefined,
        confirmedBy: formData.status === 'Confirmé' ? auth.currentUser.uid : undefined,
        createdAt: now
      };

      // If method is guarantee deduction, update tenant guarantee account
      if (formData.method === 'Déduction Garantie') {
        const tenantRef = doc(db, 'tenants', formData.tenantId);
        const tenantSnap = await getDoc(tenantRef);
        if (tenantSnap.exists()) {
          const currentGuarantee = tenantSnap.data().guaranteeAmount || 0;
          if (currentGuarantee < amountUSD) {
            setError(`La garantie actuelle (${currentGuarantee}$) est insuffisante.`);
            setLoading(false);
            return;
          }
          const newGuarantee = currentGuarantee - amountUSD;
          let status = tenantSnap.data().guaranteeStatus;
          if (newGuarantee <= 0) status = 'Non payée';
          else if (newGuarantee < (tenantSnap.data().monthlyRent * 3)) status = 'Partielle';
          else status = 'Payée';
          await updateDoc(tenantRef, { guaranteeAmount: newGuarantee, guaranteeStatus: status });
        }
      }

      await addDoc(pRef, paymentData);
      toast.success("Paiement enregistré avec succès !");
      if (onSuccess) onSuccess();
      else onClose();
    } catch (e: any) {
      console.error(e);
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col transition-colors border border-gray-100 dark:border-gray-700 overflow-hidden my-auto">
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            Nouveau Paiement
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3.5 text-xs sm:text-sm overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 p-3 rounded-xl text-xs font-semibold border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Locataire</label>
            <select 
              required 
              value={formData.tenantId} 
              onChange={e => setFormData({ ...formData, tenantId: e.target.value })} 
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Sélectionnez un locataire</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name} • {t.address}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select 
                value={formData.type} 
                onChange={e => setFormData({ ...formData, type: e.target.value })} 
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option>Loyer</option>
                <option>Garantie</option>
                <option>Avance</option>
                <option>Eau</option>
                <option>Électricité</option>
                <option>Frais syndics</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Devise</label>
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setCurrency('USD')}
                  className={`flex-1 py-2 font-bold text-xs transition-colors ${
                    currency === 'USD' ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  USD ($)
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency('CDF')}
                  className={`flex-1 py-2 font-bold text-xs transition-colors ${
                    currency === 'CDF' ? 'bg-blue-600 text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  CDF (FC)
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                Montant ({currency})
              </label>
              <input 
                required 
                type="number" 
                min="1" 
                value={formData.amount} 
                onChange={e => setFormData({ ...formData, amount: e.target.value })} 
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder={currency === 'USD' ? 'Ex: 400' : 'Ex: 1140000'} 
              />
              {formData.amount && (
                <p className="text-[11px] text-gray-400 mt-1">
                  ≈ {convertedEquivalent}
                </p>
              )}
            </div>

            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                Taux (1$ = CDF)
              </label>
              <input 
                type="number" 
                value={exchangeRate} 
                onChange={e => setExchangeRate(Number(e.target.value))} 
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
              <input 
                required 
                type="date" 
                value={formData.date} 
                onChange={e => setFormData({ ...formData, date: e.target.value })} 
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
              />
            </div>

            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Mode de versement</label>
              <select 
                value={formData.method} 
                onChange={e => setFormData({ ...formData, method: e.target.value as any })} 
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option>Cash</option>
                <option>Mobile Money</option>
                <option>Banque</option>
                <option>Déduction Garantie</option>
              </select>
            </div>
          </div>

          {formData.method === 'Mobile Money' && (
            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-xs text-blue-900 dark:text-blue-300">
                <Smartphone className="w-3.5 h-3.5" />
                Détails Mobile Money
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={formData.mobileMoneyProvider}
                  onChange={e => setFormData({ ...formData, mobileMoneyProvider: e.target.value as any })}
                  className="p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs"
                >
                  <option value="M-Pesa">Vodacom M-Pesa</option>
                  <option value="Orange Money">Orange Money</option>
                  <option value="Airtel Money">Airtel Money</option>
                  <option value="Autre">Autre opérateur</option>
                </select>
                <input
                  type="text"
                  placeholder="ID / Réf. transaction (ex: MP2401...)"
                  value={formData.transactionRef}
                  onChange={e => setFormData({ ...formData, transactionRef: e.target.value })}
                  className="p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Notes ou quittance</label>
            <textarea 
              rows={2} 
              value={formData.notes} 
              onChange={e => setFormData({ ...formData, notes: e.target.value })} 
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none" 
              placeholder="Commentaires, référence quittance manuelle..." 
            />
          </div>

          <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex gap-2 sticky bottom-0 bg-white dark:bg-gray-800 pb-1 mt-4">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Annuler
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Validation...' : 'Valider & Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Traceable cancellation modal (Contre-passation / Redressement)
 * Never delete a validated transaction. Instead, append an offsetting adjustment.
 */
function CancelAdjustmentModal({ 
  payment, 
  tenantName, 
  onClose, 
  onSuccess 
}: { 
  payment: PaymentRecord, 
  tenantName: string, 
  onClose: () => void, 
  onSuccess: () => void 
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Veuillez expliciter le motif de cette régularisation.');
      return;
    }
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');

    try {
      await createPaymentAdjustment(payment, reason.trim(), auth.currentUser.uid);
      onSuccess();
    } catch (e: any) {
      console.error(e);
      setError("Erreur lors de la régularisation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/10 dark:bg-black/20 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3 text-purple-600 mb-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base">Régularisation Comptable</h3>
            <p className="text-xs text-gray-500">Contre-passation traçable (Norme d'audit)</p>
          </div>
        </div>

        <div className="p-3 bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 rounded-xl text-xs text-purple-900 dark:text-purple-300 mb-4 space-y-1">
          <p className="font-semibold">Transaction cible : {payment.amount} {payment.currency || '$'} ({payment.type})</p>
          <p>Locataire : {tenantName} • Date : {format(new Date(payment.date), 'dd/MM/yyyy')}</p>
          <p className="text-[11px] text-purple-700 dark:text-purple-400">
            En application des règles financières strictes, la transaction d'origine ne sera pas supprimée. Une écriture négative compensatoire sera générée pour maintenir la parfaite intégrité des soldes.
          </p>
        </div>

        <form onSubmit={handleConfirmAdjustment} className="space-y-4">
          {error && (
            <div className="p-2.5 bg-red-50 text-red-600 rounded-lg text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Motif obligatoire de la correction :
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: Erreur de saisie de montant, transaction déclarée par erreur, chèque sans provision..."
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-3 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Abandonner
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            >
              {loading ? 'Régularisation...' : 'Enregistrer la Contre-passation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Inspection modal for suspected duplicate payments
 */
function DuplicateInspectionModal({ 
  duplicates, 
  tenantsMap, 
  onClose, 
  onCancelPayment 
}: { 
  duplicates: PaymentRecord[], 
  tenantsMap: Record<string, any>, 
  onClose: () => void, 
  onCancelPayment: (p: PaymentRecord) => void 
}) {
  return (
    <div className="fixed inset-0 bg-slate-900/10 dark:bg-black/20 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-bold text-gray-900 dark:text-white text-base">Détection de doublons potentiels</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-300 mb-4">
          Le module financier a identifié {duplicates.length} transactions pour le même locataire avec un montant identique à dates très proches. Comparez-les ci-dessous :
        </p>

        <div className="space-y-2.5 max-h-72 overflow-y-auto">
          {duplicates.map(p => {
            const tenant = tenantsMap[p.tenantId];
            return (
              <div key={p.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">{tenant?.name} • {p.type}</p>
                  <p className="text-[11px] text-gray-400">
                    Date: {format(new Date(p.date), 'dd/MM/yyyy HH:mm')} • Mode: {p.method}
                    {p.transactionRef ? ` • Réf: ${p.transactionRef}` : ''}
                  </p>
                  <p className="text-[11px] font-semibold text-emerald-600">
                    Montant: {p.amount} {p.currency || '$'} ({p.status || 'Confirmé'})
                  </p>
                </div>

                <button
                  onClick={() => onCancelPayment(p)}
                  className="px-2.5 py-1.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                >
                  Annuler ce doublon
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-5 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
