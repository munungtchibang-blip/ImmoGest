import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Download, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ChevronRight
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { useSubscription } from '../context/SubscriptionContext';
import toast from 'react-hot-toast';

export function Reports() {
  const { subscription, openSubscriptionModal } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);

  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    propertyId: 'all'
  });

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    // Fetch properties
    const qProps = query(collection(db, 'properties'), where('landlordId', '==', uid));
    getDocs(qProps).then(snap => {
      setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch tenants
    const qTenants = query(collection(db, 'tenants'), where('landlordId', '==', uid));
    getDocs(qTenants).then(snap => {
      setTenants(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Realtime Payments
    const qPays = query(collection(db, 'payments'), where('landlordId', '==', uid));
    const unsubPays = onSnapshot(qPays, snap => {
      setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Realtime Expenses
    const qExp = query(collection(db, 'expenses'), where('landlordId', '==', uid));
    const unsubExp = onSnapshot(qExp, snap => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubPays();
      unsubExp();
    };
  }, []);

  // Set quick date ranges
  const setQuickRange = (range: 'this_month' | 'last_month' | 'this_year' | 'all') => {
    const today = new Date();
    if (range === 'this_month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setFilters(prev => ({
        ...prev,
        startDate: start.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      }));
    } else if (range === 'last_month') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      setFilters(prev => ({
        ...prev,
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      }));
    } else if (range === 'this_year') {
      const start = new Date(today.getFullYear(), 0, 1);
      setFilters(prev => ({
        ...prev,
        startDate: start.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        startDate: '2024-01-01',
        endDate: today.toISOString().split('T')[0]
      }));
    }
  };

  // Filtered payments and expenses for selected criteria
  const { filteredPayments, filteredExpenses, totalIncome, totalExpense, netProfit } = useMemo(() => {
    const start = new Date(filters.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);

    let pList = payments.filter(p => {
      if (p.status === 'Rejeté') return false;
      const d = new Date(p.date || p.createdAt);
      return d >= start && d <= end;
    });

    let eList = expenses.filter(e => {
      const d = new Date(e.date || e.createdAt);
      return d >= start && d <= end;
    });

    if (filters.propertyId !== 'all') {
      const propTenantIds = tenants.filter(t => t.propertyId === filters.propertyId).map(t => t.id);
      pList = pList.filter(p => propTenantIds.includes(p.tenantId));
      eList = eList.filter(e => e.propertyId === filters.propertyId);
    }

    const inc = pList.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const exp = eList.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return {
      filteredPayments: pList,
      filteredExpenses: eList,
      totalIncome: inc,
      totalExpense: exp,
      netProfit: inc - exp
    };
  }, [payments, expenses, tenants, filters]);

  const tenantsMap = useMemo(() => {
    const map = new Map<string, string>();
    tenants.forEach(t => map.set(t.id, t.name));
    return map;
  }, [tenants]);

  const generateReport = async () => {
    setLoading(true);
    setError('');
    try {
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      const doc = new jsPDF();
      const propertyName = filters.propertyId === 'all' 
        ? 'Toutes les propriétés gérées' 
        : properties.find(p => p.id === filters.propertyId)?.name || 'Propriété';
      
      // Header
      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, 210, 45, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("RAPPORT FINANCIER & COMPTABLE", 105, 25, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`ImmoGest Kinshasa • Gestion Locative Sécurisée`, 105, 33, { align: "center" });

      doc.setTextColor(31, 41, 55);
      doc.setFontSize(10);
      doc.text(`Date d'émission : ${new Date().toLocaleDateString('fr-FR')}`, 145, 54);
      doc.text(`Période : Du ${format(start, 'dd/MM/yyyy')} au ${format(end, 'dd/MM/yyyy')}`, 14, 54);
      doc.text(`Périmètre : ${propertyName}`, 14, 60);

      // Summary Table
      autoTable(doc, {
        startY: 68,
        head: [['Indicateur Financier', 'Total Constaté']],
        body: [
          ['Total des revenus encaissés (Loyers & Charges)', `+ ${totalIncome.toLocaleString()} $`],
          ['Total des charges et dépenses d\'entretien', `- ${totalExpense.toLocaleString()} $`],
          ['Résultat Net d\'Exploitation', `${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()} $`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138] },
        styles: { fontSize: 11, cellPadding: 4 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
      });

      // Payments Table
      let finalY = (doc as any).lastAutoTable?.finalY + 12 || 110;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text('Détail des Encaissements Reçus', 14, finalY);

      const paymentsData = filteredPayments.map(p => [
        format(new Date(p.date || p.createdAt), 'dd/MM/yyyy'),
        tenantsMap.get(p.tenantId) || 'Locataire',
        p.type || 'Loyer',
        p.method || 'Mobile Money',
        `${Number(p.amount).toLocaleString()} $`
      ]);

      autoTable(doc, {
        startY: finalY + 4,
        head: [['Date', 'Locataire', 'Nature', 'Moyen', 'Montant']],
        body: paymentsData.length > 0 ? paymentsData : [['-', 'Aucun encaissement sur la période', '-', '-', '-']],
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } }
      });

      // Expenses Table
      finalY = (doc as any).lastAutoTable?.finalY + 12 || 170;
      if (finalY > 240) {
        doc.addPage();
        finalY = 20;
      }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text('Détail des Dépenses & Travaux', 14, finalY);

      const expensesData = filteredExpenses.map(e => [
        format(new Date(e.date || e.createdAt), 'dd/MM/yyyy'),
        e.category || 'Entretien',
        e.tenantId ? (tenantsMap.get(e.tenantId) || 'Logement') : 'Immeuble',
        e.description || '-',
        `${Number(e.amount).toLocaleString()} $`
      ]);

      autoTable(doc, {
        startY: finalY + 4,
        head: [['Date', 'Poste', 'Cible', 'Détails', 'Montant']],
        body: expensesData.length > 0 ? expensesData : [['-', 'Aucune dépense sur la période', '-', '-', '-']],
        theme: 'striped',
        headStyles: { fillColor: [239, 68, 68] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } }
      });

      const fileName = `Rapport_Financier_${format(start, 'yyyyMMdd')}_${format(end, 'yyyyMMdd')}.pdf`;
      doc.save(fileName);
      toast.success("Rapport financier PDF téléchargé avec succès !");

    } catch (err) {
      console.error(err);
      setError("Erreur lors de la génération du rapport PDF.");
      toast.error("Échec de la génération du PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Rapports & Bilan Financier</h1>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5">
            Analysez votre rentabilité locative, vos charges et générez des rapports PDF certifiés.
          </p>
        </div>

        <button
          onClick={generateReport}
          disabled={loading}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-50 cursor-pointer self-start sm:self-auto"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <Download className="w-4 h-4" />
          )}
          Télécharger Rapport PDF
        </button>
      </div>

      {/* PRO SUBSCRIPTION RECOMMENDATION BANNER (Requested by User) */}
      {subscription.tierId !== 'pro' && subscription.tierId !== 'vip' && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-md relative overflow-hidden border border-blue-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 z-10">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-400/30">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400 text-gray-950">
                  Recommandation Forfait Pro
                </span>
                <span className="text-xs text-blue-200">Déclarations Fiscales & Comptabilité</span>
              </div>
              <p className="text-sm font-bold text-white">
                Automatisez vos Bilans et Déclarations Fiscales avec le Forfait Pro
              </p>
              <p className="text-xs text-blue-100/90 max-w-xl leading-relaxed">
                Le forfait Pro (25 $/mois) génère automatiquement vos déclarations d'impôts sur les revenus locatifs (IRPB / IPR), les bilans comptables annuels consolidés multi-devises (USD / CDF) et l'export direct vers Excel.
              </p>
            </div>
          </div>

          <button
            onClick={() => openSubscriptionModal('pro')}
            className="py-2.5 px-4 bg-white hover:bg-amber-50 text-indigo-950 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer shrink-0 flex items-center justify-center gap-2"
          >
            <span>Activer Forfait Pro (25 $/mois)</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Live Financial Metrics for Selected Period */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Revenus Période</span>
            <p className="text-2xl font-black text-emerald-600 mt-1">
              + {totalIncome.toLocaleString()} $
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">{filteredPayments.length} versement(s)</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Dépenses & Travaux</span>
            <p className="text-2xl font-black text-rose-600 mt-1">
              - {totalExpense.toLocaleString()} $
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">{filteredExpenses.length} charge(s)</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Résultat Net</span>
            <p className={`text-2xl font-black mt-1 ${netProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600'}`}>
              {netProfit >= 0 ? '+' : ''}{netProfit.toLocaleString()} $
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">Marge nette d'exploitation</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 p-5 space-y-4">
        
        {/* Quick Range Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/80 pb-3">
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Périodes prédéfinies :</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setQuickRange('this_month')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
            >
              Ce mois
            </button>
            <button
              type="button"
              onClick={() => setQuickRange('last_month')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
            >
              Mois dernier
            </button>
            <button
              type="button"
              onClick={() => setQuickRange('this_year')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
            >
              Cette année ({new Date().getFullYear()})
            </button>
            <button
              type="button"
              onClick={() => setQuickRange('all')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors cursor-pointer"
            >
              Tout
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-1">
              Date de début
            </label>
            <input 
              type="date" 
              value={filters.startDate}
              onChange={e => setFilters({...filters, startDate: e.target.value})}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs sm:text-sm font-medium outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-1">
              Date de fin
            </label>
            <input 
              type="date" 
              value={filters.endDate}
              onChange={e => setFilters({...filters, endDate: e.target.value})}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs sm:text-sm font-medium outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-1">
              Propriété ciblée
            </label>
            <select 
              value={filters.propertyId}
              onChange={e => setFilters({...filters, propertyId: e.target.value})}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs sm:text-sm font-semibold outline-none focus:border-blue-500"
            >
              <option value="all">Toutes les propriétés ({properties.length})</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-600 font-bold">{error}</p>
        )}
      </div>

      {/* Summary preview table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700/80 flex justify-between items-center">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white">Aperçu des Encaissements Récents ({filteredPayments.length})</h3>
          <span className="text-xs font-semibold text-gray-400">Période sélectionnée</span>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-700/80 max-h-72 overflow-y-auto">
          {filteredPayments.slice(0, 10).map(p => (
            <div key={p.id} className="p-3 sm:px-4 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                  ✓
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white truncate">{tenantsMap.get(p.tenantId) || 'Locataire'}</p>
                  <p className="text-[11px] text-gray-400">{p.type || 'Loyer'} • {format(new Date(p.date || p.createdAt), 'dd/MM/yyyy')}</p>
                </div>
              </div>
              <span className="font-black text-emerald-600 text-sm">+{p.amount} $</span>
            </div>
          ))}

          {filteredPayments.length === 0 && (
            <div className="p-6 text-center text-xs text-gray-400">
              Aucun paiement enregistré pour cette période.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
