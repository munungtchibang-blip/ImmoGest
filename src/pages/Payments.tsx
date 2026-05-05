import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, updateDoc, doc, getDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { CreditCard, Search, Download, ArrowLeft, Edit2, Trash2, FileSpreadsheet, X, Repeat } from 'lucide-react';
import { format, differenceInMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';

export function Payments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [tenantsMap, setTenantsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [guaranteeFilter, setGuaranteeFilter] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'tenant' | 'amount', direction: 'asc' | 'desc' }>({ key: 'tenant', direction: 'asc' });
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [viewingPayment, setViewingPayment] = useState<any>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);

  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'historique' | 'impayes'>('historique');



  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    let unsub: () => void;

    // Fetch tenants to map IDs to names
    const fetchTenants = async () => {
      const qT = query(collection(db, 'tenants'), where('landlordId', '==', uid));
      const snap = await getDocs(qT);
      const map: Record<string, any> = {};
      snap.forEach(doc => {
        map[doc.id] = { id: doc.id, ...doc.data() };
      });
      setTenantsMap(map);
      
      const qP = query(collection(db, 'payments'), where('landlordId', '==', uid));
      unsub = onSnapshot(qP, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
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

  const generateReceipt = (payment: any) => {
    const tenant = tenantsMap[payment.tenantId];
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
    doc.text(`Téléphone : ${tenant.phone || 'Non spécifié'}`, 20, 129);
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

    const pdfBlob = doc.output('blob');
    const fileName = `Recu_${tenant.name.replace(/\s+/g, '_')}_${format(new Date(payment.date), 'yyyyMMdd')}.pdf`;
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
        title: 'Reçu de paiement',
        text: `Voici le reçu de paiement pour ${tenant.name}.`
      }).catch(() => downloadPDF());
    } else {
      downloadPDF();
    }
  };

  const filteredPayments = payments.filter(p => {
    const tenantDetails = tenantsMap[p.tenantId];
    const tenantName = tenantDetails?.name || '';
    const paymentDate = new Date(p.date);
    const m = (paymentDate.getMonth() + 1).toString();
    const y = paymentDate.getFullYear().toString();

    const matchSearch = tenantName.toLowerCase().includes(search.toLowerCase()) || 
           p.type.toLowerCase().includes(search.toLowerCase());
           
    const matchMonth = monthFilter === '' || m === monthFilter;
    const matchYear = yearFilter === '' || y === yearFilter;
    
    // Only apply guaranteeFilter if it's set AND if it's a guarantee payment
    let matchGuarantee = true;
    if (guaranteeFilter !== '') {
      // If we are filtering by guarantee, either the payment must be a Guarantee type,
      // and the tenant associated with it must have the selected guaranteeStatus
      if (p.type === 'Garantie' && tenantDetails?.guaranteeStatus === guaranteeFilter) {
        matchGuarantee = true;
      } else {
        matchGuarantee = false;
      }
    }

    return matchSearch && matchMonth && matchYear && matchGuarantee;
  });

  const sortedPayments = [...filteredPayments].sort((a, b) => {
    if (sortConfig.key === 'date') {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
    } else if (sortConfig.key === 'amount') {
      return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
    } else if (sortConfig.key === 'tenant') {
      const nameA = tenantsMap[a.tenantId]?.name || '';
      const nameB = tenantsMap[b.tenantId]?.name || '';
      return sortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    return 0;
  });

  const groupedPayments = sortedPayments.reduce((acc, payment) => {
    const tId = payment.tenantId || 'inconnu';
    if (!acc[tId]) acc[tId] = [];
    acc[tId].push(payment);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Retour au tableau de bord
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <div className="flex gap-4 border-b-2 border-transparent w-full sm:w-auto">
          <button 
            onClick={() => setActiveTab('historique')}
            className={`pb-2 px-2 text-lg font-bold transition-colors border-b-2 ${activeTab === 'historique' ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Historique
          </button>
          <button 
            onClick={() => setActiveTab('impayes')}
            className={`pb-2 px-2 text-lg font-bold transition-colors border-b-2 ${activeTab === 'impayes' ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Mois Impayés
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative group">
          <button
            onClick={() => setShowAddPayment(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
          >
            <CreditCard className="w-5 h-5" />
            Nouveau Paiement
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Rechercher par locataire ou type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={guaranteeFilter}
            onChange={(e) => setGuaranteeFilter(e.target.value)}
            className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
          >
            <option value="">Status Garantie (Tous)</option>
            <option value="Payée">Garanties Payées</option>
            <option value="Partielle">Garanties Partielles</option>
            <option value="Non payée">Garanties Non Payées</option>
          </select>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
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
            className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
          >
            <option value="">Toutes les années</option>
            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => (
              <option key={y} value={y.toString()}>{y}</option>
            ))}
          </select>
          <select
            value={`${sortConfig.key}-${sortConfig.direction}`}
            onChange={(e) => {
              const [key, direction] = e.target.value.split('-');
              setSortConfig({ key: key as any, direction: direction as any });
            }}
            className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
          >
            <option value="date-desc">Date (Plus récent)</option>
            <option value="date-asc">Date (Plus ancien)</option>
            <option value="tenant-asc">Locataire (A-Z)</option>
            <option value="tenant-desc">Locataire (Z-A)</option>
            <option value="amount-desc">Montant (Décroissant)</option>
            <option value="amount-asc">Montant (Croissant)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
        </div>
      ) : activeTab === 'historique' ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {sortedPayments.length === 0 ? (
              <div className="p-12 text-center">
                <CreditCard className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">Aucun paiement trouvé.</p>
              </div>
            ) : (
              Object.entries(groupedPayments).map(([tenantId, tenantPayments]) => {
                const tenant = tenantsMap[tenantId];
                return (
                  <div key={tenantId} className="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-4">
                    <div className="bg-gray-50 dark:bg-gray-900/50 p-4 font-bold text-gray-800 dark:text-gray-200 sticky top-0 z-10 flex items-center justify-between">
                      <span>{tenant?.name || 'Locataire inconnu'}</span>
                      <span className="text-sm font-normal text-gray-500">{tenantPayments.length} paiement{tenantPayments.length > 1 ? 's' : ''}</span>
                    </div>
                    <div>
                      {tenantPayments.map(payment => (
                        <div key={payment.id} onClick={() => setViewingPayment(payment)} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0 ml-4 cursor-pointer">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                              payment.type === 'Loyer' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                            }`}>
                              <CreditCard className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {payment.type} • {payment.method}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {format(new Date(payment.date), 'dd MMM yyyy', { locale: fr })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-6 w-full sm:w-auto pl-14 sm:pl-0">
                            <p className="font-bold text-gray-900 dark:text-white text-lg mr-2">{payment.amount} $</p>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setEditingPayment(payment); }}
                              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                              title="Modifier le paiement"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); generateReceipt(payment); }}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                              title="Télécharger le reçu"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <UnpaidTab tenants={Object.values(tenantsMap)} payments={payments} />
      )}
      {showAddPayment && (
        <AddPaymentModal tenants={Object.entries(tenantsMap).map(([id, t]) => ({ id, ...(t as any) }))} onClose={() => setShowAddPayment(false)} />
      )}
      {editingPayment && (
        <EditPaymentModal payment={editingPayment} onClose={() => setEditingPayment(null)} />
      )}
      {viewingPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl max-w-md w-full p-6 sm:p-8">
             <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
               <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                 <CreditCard className="w-6 h-6 text-blue-600" />
                 Détails du paiement
               </h2>
               <button onClick={() => setViewingPayment(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                 <X className="w-6 h-6" />
               </button>
             </div>
             
             <div className="space-y-4">
               <div className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-700/50">
                 <span className="text-gray-500 dark:text-gray-400 font-medium">Locataire</span>
                 <span className="font-semibold text-gray-900 dark:text-white text-right">{tenantsMap[viewingPayment.tenantId]?.name || 'Locataire inconnu'}</span>
               </div>
               
               <div className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-700/50">
                 <span className="text-gray-500 dark:text-gray-400 font-medium">Type</span>
                 <span className="font-semibold text-gray-900 dark:text-white text-right">{viewingPayment.type}</span>
               </div>
               
               <div className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-700/50">
                 <span className="text-gray-500 dark:text-gray-400 font-medium">Méthode</span>
                 <span className="font-semibold text-gray-900 dark:text-white text-right">{viewingPayment.method}</span>
               </div>
               
               <div className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-700/50">
                 <span className="text-gray-500 dark:text-gray-400 font-medium">Date</span>
                 <span className="font-semibold text-gray-900 dark:text-white text-right">{format(new Date(viewingPayment.date), 'dd MMMM yyyy', { locale: fr })}</span>
               </div>
               
               <div className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-700/50">
                 <span className="text-gray-500 dark:text-gray-400 font-medium">Montant payé</span>
                 <span className="text-xl font-bold text-green-600 dark:text-green-400 text-right">{viewingPayment.amount} $</span>
               </div>
               
               {viewingPayment.notes && (
                 <div className="pt-2">
                   <span className="block text-gray-500 dark:text-gray-400 font-medium mb-1">Notes</span>
                   <p className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm italic text-gray-700 dark:text-gray-300">"{viewingPayment.notes}"</p>
                 </div>
               )}
               
               {viewingPayment.receiptUrl && (
                 <div className="pt-2">
                   <a
                     href={viewingPayment.receiptUrl}
                     target="_blank"
                     rel="noreferrer"
                     className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 rounded-xl font-medium transition-colors"
                   >
                     <Download className="w-5 h-5" />
                     Voir le document
                   </a>
                 </div>
               )}
             </div>
             
             <div className="mt-8 pt-4 border-t border-gray-100 dark:border-gray-700">
               <button onClick={() => setViewingPayment(null)} className="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-medium transition-colors">
                 Fermer
               </button>
             </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 flex justify-between items-center shadow-lg">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-4 text-red-700 hover:text-red-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function UnpaidTab({ tenants, payments }: { tenants: any[], payments: any[] }) {
  const arrears = tenants.map(tenant => {
    // Determine how many months have elapsed since standard entry
    const entryDate = new Date(tenant.entryDate || tenant.createdAt || new Date());
    const now = new Date();
    
    // Total months expected includes the current month
    // So if entered in Jan, and now is Jan, that is 1 month.
    let monthsElapsed = differenceInMonths(now, entryDate) + 1;
    if (monthsElapsed < 1) monthsElapsed = 1;

    const expectedRent = monthsElapsed * (tenant.monthlyRent || 0);

    // Sum all rent payments made (ignore Guarantee payments for this calculation)
    const paidRent = payments
      .filter(p => p.tenantId === tenant.id && p.type === 'Loyer')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const balance = expectedRent - paidRent;
    const unpaidMonths = tenant.monthlyRent ? (balance / tenant.monthlyRent).toFixed(1) : 0;

    return {
      ...tenant,
      expectedRent,
      paidRent,
      balance,
      unpaidMonths: Number(unpaidMonths)
    };
  }).filter(t => t.balance > 0).sort((a, b) => b.balance - a.balance);

  if (arrears.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center transition-colors">
        <CreditCard className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <p className="text-gray-900 dark:text-white font-medium text-lg">Aucun retard de paiement !</p>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Tous vos locataires sont à jour dans leurs loyers.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {arrears.map(tenant => (
          <div key={tenant.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 flex items-center justify-center shrink-0">
                <span className="font-bold">{tenant.unpaidMonths}</span>
              </div>
              <div>
                <p className="font-bold text-gray-900 dark:text-white">{tenant.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {tenant.address}
                </p>
                <p className="text-xs text-red-500 dark:text-red-400 mt-1 font-medium">
                  En retard de {tenant.unpaidMonths} mois (depuis le {format(new Date(tenant.entryDate || tenant.createdAt), 'dd MMM yyyy', { locale: fr })})
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto pl-16 sm:pl-0">
              <div className="text-right mr-4">
                <p className="font-bold text-red-600 dark:text-red-400 text-lg">{tenant.balance.toLocaleString()} $</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Restant à payer</p>
              </div>
              <a 
                href={`https://wa.me/${tenant.phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Bonjour ${tenant.name}, ceci est un rappel concernant votre solde de ${tenant.balance.toLocaleString()} $ (${tenant.unpaidMonths} mois impayés). Merci de régulariser la situation dans les plus brefs délais.`)}`}
                target="_blank"
                rel="noreferrer"
                className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/40 p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
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

function AddPaymentModal({ tenants, onClose }: { tenants: any[], onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    tenantId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'Cash',
    type: 'Loyer',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !formData.tenantId) {
      setError('Veuillez sélectionner un locataire.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const now = new Date().toISOString();
      const numAmount = Number(formData.amount);
      
      const paymentData = {
        amount: numAmount,
        date: new Date(formData.date).toISOString(),
        method: formData.method,
        type: formData.type,
        notes: formData.notes,
        tenantId: formData.tenantId,
        landlordId: auth.currentUser.uid,
        createdAt: now
      };

      if (formData.method === 'Déduction Garantie') {
        const tenantRef = doc(db, 'tenants', formData.tenantId);
        const tenantSnap = await getDoc(tenantRef);
        if (tenantSnap.exists()) {
          const currentGuarantee = tenantSnap.data().guaranteeAmount || 0;
          if (currentGuarantee < numAmount) {
            setError(`La garantie actuelle (${currentGuarantee}$) est insuffisante.`);
            setLoading(false);
            return;
          }
          const newGuarantee = currentGuarantee - numAmount;
          let status = tenantSnap.data().guaranteeStatus;
          if (newGuarantee <= 0) status = 'Non payée';
          else if (newGuarantee < (tenantSnap.data().monthlyRent * 3)) status = 'Partielle';
          else status = 'Payée';
          await updateDoc(tenantRef, { guaranteeAmount: newGuarantee, guaranteeStatus: status });
        }
      }

      const pRef = collection(db, 'payments');
      await addDoc(pRef, paymentData);
      onClose();
    } catch (e: any) {
      console.error(e);
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full transition-colors my-8">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Nouveau paiement</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Locataire</label>
            <select required value={formData.tenantId} onChange={e => setFormData({ ...formData, tenantId: e.target.value })} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">Sélectionnez un locataire</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de paiement</label>
            <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option>Loyer</option>
              <option>Garantie</option>
              <option>Eau</option>
              <option>Électricité</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Montant ($)</label>
            <input required type="number" min="1" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: 500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input required type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Méthode</label>
            <select value={formData.method} onChange={e => setFormData({ ...formData, method: e.target.value })} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option>Cash</option>
              <option>Mobile Money</option>
              <option>Banque</option>
              <option>Déduction Garantie</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optionnel)</label>
            <textarea rows={2} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="Commentaires sur le paiement..." />
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
              <option>Eau</option>
              <option>Électricité</option>
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


