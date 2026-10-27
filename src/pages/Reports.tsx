import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, onSnapshot, addDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Download, 
  TrendingUp, 
  TrendingDown, 
  FileSpreadsheet,
  History,
  Sparkles
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, subMonths, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { calculateTenantFinancials } from '../services/financialEngine';
import { useSubscription } from '../context/SubscriptionContext';

export function Reports() {
  const { subscription, openSubscriptionModal } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [savedReports, setSavedReports] = useState<any[]>([]);

  // Period mode: 'monthly' | 'quarterly' | 'annual' | 'custom'
  const [periodType, setPeriodType] = useState<'monthly' | 'quarterly' | 'annual' | 'custom'>('monthly');

  const [filters, setFilters] = useState({
    startDate: startOfMonth(new Date()).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    propertyId: 'all'
  });

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const qProps = query(collection(db, 'properties'), where('landlordId', '==', uid));
    getDocs(qProps).then(snap => setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qTenants = query(collection(db, 'tenants'), where('landlordId', '==', uid));
    getDocs(qTenants).then(snap => setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qContracts = query(collection(db, 'contracts'), where('landlordId', '==', uid));
    getDocs(qContracts).then(snap => setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const unsubPays = onSnapshot(query(collection(db, 'payments'), where('landlordId', '==', uid)), snap => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubExp = onSnapshot(query(collection(db, 'expenses'), where('landlordId', '==', uid)), snap => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubReports = onSnapshot(query(collection(db, 'financial_reports'), where('landlordId', '==', uid)), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setSavedReports(data);
    });

    return () => {
      unsubPays();
      unsubExp();
      unsubReports();
    };
  }, []);

  // Quick preset ranges
  const handlePeriodChange = (type: 'monthly' | 'quarterly' | 'annual' | 'custom') => {
    setPeriodType(type);
    const now = new Date();
    if (type === 'monthly') {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      setFilters(prev => ({
        ...prev,
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
      }));
    } else if (type === 'quarterly') {
      const start = subMonths(now, 3);
      setFilters(prev => ({
        ...prev,
        startDate: start.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0]
      }));
    } else if (type === 'annual') {
      const start = new Date(now.getFullYear(), 0, 1);
      setFilters(prev => ({
        ...prev,
        startDate: start.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0]
      }));
    }
  };

  const tenantsMap = useMemo(() => {
    const map = new Map<string, any>();
    tenants.forEach(t => map.set(t.id, t));
    return map;
  }, [tenants]);

  // Current period metrics
  const currentMetrics = useMemo(() => {
    const start = new Date(filters.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);

    let pList = payments.filter(p => {
      if (p.status === 'Annulé' || p.status === 'Échoué') return false;
      const d = new Date(p.date || p.createdAt);
      return d >= start && d <= end;
    });

    let eList = expenses.filter(e => {
      const d = new Date(e.date || e.createdAt);
      return d >= start && d <= end;
    });

    let tList = tenants;
    if (filters.propertyId !== 'all') {
      tList = tenants.filter(t => t.propertyId === filters.propertyId);
      const allowedTenantIds = tList.map(t => t.id);
      pList = pList.filter(p => allowedTenantIds.includes(p.tenantId));
      eList = eList.filter(e => e.propertyId === filters.propertyId);
    }

    const totalIncome = pList.reduce((sum, p) => sum + Number(p.amountUSD || p.amount || 0), 0);
    const totalExpense = eList.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const netProfit = totalIncome - totalExpense;

    // Expected monthly rent for active tenants in scope
    const monthlyExpected = tList.reduce((sum, t) => sum + Number(t.monthlyRent || 0), 0);

    // Arrears across tenants in scope
    let totalArrears = 0;
    tList.forEach(t => {
      const fin = calculateTenantFinancials(t, payments);
      if (!fin.isUpToDate) {
        totalArrears += fin.netRentBalanceUSD;
      }
    });

    // Occupancy calculation
    const totalApartments = properties
      .filter(p => filters.propertyId === 'all' || p.id === filters.propertyId)
      .reduce((s, p) => s + (Number(p.apartmentsCount) || 1), 0);
    const occupiedCount = tList.length;
    const occupancyRate = totalApartments > 0 ? Math.min(100, Math.round((occupiedCount / totalApartments) * 100)) : 100;

    // Leases expiring in < 60 days
    const expiringLeases = contracts.filter(c => {
      if (!c.endDate || c.status !== 'Actif') return false;
      const diff = differenceInDays(new Date(c.endDate), new Date());
      return diff >= 0 && diff <= 60;
    });

    return {
      filteredPayments: pList,
      filteredExpenses: eList,
      totalIncome,
      totalExpense,
      netProfit,
      monthlyExpected,
      totalArrears,
      occupancyRate,
      expiringLeasesCount: expiringLeases.length
    };
  }, [payments, expenses, tenants, properties, contracts, filters]);

  // Prior period metrics for comparison
  const priorMetrics = useMemo(() => {
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    const durationMs = end.getTime() - start.getTime();

    const priorEnd = new Date(start.getTime() - 1);
    const priorStart = new Date(priorEnd.getTime() - durationMs);

    let pList = payments.filter(p => {
      if (p.status === 'Annulé' || p.status === 'Échoué') return false;
      const d = new Date(p.date || p.createdAt);
      return d >= priorStart && d <= priorEnd;
    });

    let eList = expenses.filter(e => {
      const d = new Date(e.date || e.createdAt);
      return d >= priorStart && d <= priorEnd;
    });

    if (filters.propertyId !== 'all') {
      const allowedTenantIds = tenants.filter(t => t.propertyId === filters.propertyId).map(t => t.id);
      pList = pList.filter(p => allowedTenantIds.includes(p.tenantId));
      eList = eList.filter(e => e.propertyId === filters.propertyId);
    }

    const priorIncome = pList.reduce((sum, p) => sum + Number(p.amountUSD || p.amount || 0), 0);
    const priorExpense = eList.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const priorNet = priorIncome - priorExpense;

    const incomeGrowth = priorIncome > 0 ? Math.round(((currentMetrics.totalIncome - priorIncome) / priorIncome) * 100) : 0;
    const netGrowth = priorNet !== 0 ? Math.round(((currentMetrics.netProfit - priorNet) / Math.abs(priorNet)) * 100) : 0;

    return {
      priorIncome,
      priorExpense,
      priorNet,
      incomeGrowth,
      netGrowth
    };
  }, [payments, expenses, tenants, filters, currentMetrics]);

  // Save report snapshot to Firestore
  const saveReportRecord = async () => {
    if (!auth.currentUser) return;
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'financial_reports'), {
        landlordId: auth.currentUser.uid,
        periodType,
        startDate: filters.startDate,
        endDate: filters.endDate,
        propertyId: filters.propertyId,
        totalExpected: currentMetrics.monthlyExpected,
        totalCollected: currentMetrics.totalIncome,
        totalArrears: currentMetrics.totalArrears,
        totalExpenses: currentMetrics.totalExpense,
        netIncome: currentMetrics.netProfit,
        occupancyRate: currentMetrics.occupancyRate,
        comparison: {
          priorIncome: priorMetrics.priorIncome,
          priorExpense: priorMetrics.priorExpense,
          incomeGrowth: priorMetrics.incomeGrowth
        },
        createdAt: now
      });
    } catch (e) {
      console.error("Erreur enregistrement rapport:", e);
    }
  };

  // Export to Excel (CSV with UTF-8 BOM so it opens natively in Excel without garbled characters)
  const exportToExcel = () => {
    try {
      const propertyName = filters.propertyId === 'all' 
        ? 'Toutes les propriétés' 
        : properties.find(p => p.id === filters.propertyId)?.name || 'Propriété';

      let csv = '\uFEFF'; // UTF-8 BOM for Microsoft Excel compatibility

      csv += `RAPPORT FINANCIER & COMPTABLE IMMOGEST;;;\n`;
      csv += `Périmètre :;${propertyName};;\n`;
      csv += `Période :;Du ${filters.startDate} au ${filters.endDate};;\n`;
      csv += `Date d'export :;${new Date().toLocaleDateString('fr-FR')};;\n\n`;

      csv += `1. SYNTHÈSE COMPTABLE & RATIOS;;;\n`;
      csv += `Indicateur;Montant USD;Évolution vs Période N-1;\n`;
      csv += `Revenus locatifs encaissés;${currentMetrics.totalIncome.toLocaleString()} $;${priorMetrics.incomeGrowth >= 0 ? '+' : ''}${priorMetrics.incomeGrowth}%;\n`;
      csv += `Dépenses d'exploitation;- ${currentMetrics.totalExpense.toLocaleString()} $;;\n`;
      csv += `Résultat Net d'Exploitation;${currentMetrics.netProfit.toLocaleString()} $;${priorMetrics.netGrowth >= 0 ? '+' : ''}${priorMetrics.netGrowth}%;\n`;
      csv += `Total des arriérés locatifs constatés;${currentMetrics.totalArrears.toLocaleString()} $;;\n`;
      csv += `Taux d'occupation global;${currentMetrics.occupancyRate} %;;\n\n`;

      csv += `2. DÉTAIL DES ENCAISSEMENTS VALIDÉS;;;;\n`;
      csv += `Date;Locataire;Nature;Mode de règlement;Montant USD;\n`;
      currentMetrics.filteredPayments.forEach(p => {
        const t = tenantsMap.get(p.tenantId);
        csv += `${format(new Date(p.date || p.createdAt), 'dd/MM/yyyy')};${t?.name || 'Locataire'};${p.type || 'Loyer'};${p.method || 'Cash'};${p.amountUSD || p.amount};\n`;
      });
      csv += `\n`;

      csv += `3. DÉTAIL DES DÉPENSES & CHARGES;;;;\n`;
      csv += `Date;Poste de dépense;Bien / Immeuble;Description;Montant USD;\n`;
      currentMetrics.filteredExpenses.forEach(e => {
        const propName = properties.find(p => p.id === e.propertyId)?.name || 'Immeuble';
        csv += `${format(new Date(e.date || e.createdAt), 'dd/MM/yyyy')};${e.category};${propName};"${(e.description || '').replace(/"/g, '""')}";${e.amount};\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Rapport_Comptable_${filters.startDate}_au_${filters.endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      saveReportRecord();
      toast.success("Export Excel (CSV UTF-8) téléchargé avec succès !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'export Excel.");
    }
  };

  // Export to PDF
  const exportToPDF = async () => {
    setLoading(true);
    try {
      const doc = new jsPDF();
      const propertyName = filters.propertyId === 'all' 
        ? 'Toutes les propriétés gérées' 
        : properties.find(p => p.id === filters.propertyId)?.name || 'Propriété';

      // Header
      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, 210, 44, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("RAPPORT FINANCIER & COMPTABLE", 105, 22, { align: "center" });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("ImmoGest Kinshasa • Gestion Locative & Audit Périodique", 105, 31, { align: "center" });

      doc.setTextColor(31, 41, 55);
      doc.setFontSize(9);
      doc.text(`Date d'émission : ${new Date().toLocaleDateString('fr-FR')}`, 145, 52);
      doc.text(`Période : Du ${filters.startDate} au ${filters.endDate}`, 14, 52);
      doc.text(`Périmètre : ${propertyName}`, 14, 58);

      // Summary Table with comparison
      autoTable(doc, {
        startY: 65,
        head: [['Indicateur Clé', 'Période Actuelle', 'Période N-1', 'Variation']],
        body: [
          [
            'Revenus Locatifs Encaissés',
            `+ ${currentMetrics.totalIncome.toLocaleString()} $`,
            `${priorMetrics.priorIncome.toLocaleString()} $`,
            `${priorMetrics.incomeGrowth >= 0 ? '+' : ''}${priorMetrics.incomeGrowth}%`
          ],
          [
            'Dépenses d\'Exploitation & Entretien',
            `- ${currentMetrics.totalExpense.toLocaleString()} $`,
            `${priorMetrics.priorExpense.toLocaleString()} $`,
            '-'
          ],
          [
            'Résultat Net d\'Exploitation',
            `${currentMetrics.netProfit >= 0 ? '+' : ''}${currentMetrics.netProfit.toLocaleString()} $`,
            `${priorMetrics.priorNet.toLocaleString()} $`,
            `${priorMetrics.netGrowth >= 0 ? '+' : ''}${priorMetrics.netGrowth}%`
          ],
          [
            'Total des Arriérés Locatifs',
            `${currentMetrics.totalArrears.toLocaleString()} $`,
            '-',
            '-'
          ],
          [
            'Taux d\'Occupation',
            `${currentMetrics.occupancyRate} %`,
            '-',
            '-'
          ]
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138] },
        styles: { fontSize: 9.5, cellPadding: 3.5 },
        columnStyles: {
          1: { halign: 'right', fontStyle: 'bold' },
          2: { halign: 'right' },
          3: { halign: 'right', fontStyle: 'bold' }
        }
      });

      // Payments Table
      let finalY = (doc as any).lastAutoTable?.finalY + 10 || 115;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text('Détail des Encaissements Reçus', 14, finalY);

      const paymentsData = currentMetrics.filteredPayments.map(p => [
        format(new Date(p.date || p.createdAt), 'dd/MM/yyyy'),
        tenantsMap.get(p.tenantId)?.name || 'Locataire',
        p.type || 'Loyer',
        p.method || 'Cash',
        `${Number(p.amountUSD || p.amount).toLocaleString()} $`
      ]);

      autoTable(doc, {
        startY: finalY + 4,
        head: [['Date', 'Locataire', 'Nature', 'Moyen', 'Montant USD']],
        body: paymentsData.length > 0 ? paymentsData : [['-', 'Aucun encaissement sur la période', '-', '-', '-']],
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } }
      });

      // Expenses Table
      finalY = (doc as any).lastAutoTable?.finalY + 10 || 170;
      if (finalY > 230) {
        doc.addPage();
        finalY = 20;
      }

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text('Détail des Dépenses & Travaux', 14, finalY);

      const expensesData = currentMetrics.filteredExpenses.map(e => [
        format(new Date(e.date || e.createdAt), 'dd/MM/yyyy'),
        e.category || 'Entretien',
        properties.find(p => p.id === e.propertyId)?.name || 'Immeuble',
        e.description || '-',
        `${Number(e.amount).toLocaleString()} $`
      ]);

      autoTable(doc, {
        startY: finalY + 4,
        head: [['Date', 'Poste', 'Immeuble', 'Description', 'Montant USD']],
        body: expensesData.length > 0 ? expensesData : [['-', 'Aucune dépense sur la période', '-', '-', '-']],
        theme: 'striped',
        headStyles: { fillColor: [239, 68, 68] },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } }
      });

      const fileName = `Rapport_Financier_${filters.startDate}_au_${filters.endDate}.pdf`;
      doc.save(fileName);

      await saveReportRecord();
      toast.success("Rapport PDF généré et téléchargé !");
    } catch (err) {
      console.error(err);
      toast.error("Échec de la génération du PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 page-enter">
      {/* Top Title & Period Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Rapports & Audit Financier</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              Périodique & Automatique
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5">
            États financiers comparatifs, ratios d'occupation, arriérés et exports professionnels PDF / Excel.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Exporter vers Microsoft Excel (format CSV UTF-8 sécurisé)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={exportToPDF}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            title="Générer le rapport PDF avec graphiques et tableaux"
          >
            <Download className="w-4 h-4" />
            <span>{loading ? 'Génération...' : 'Export PDF'}</span>
          </button>
        </div>
      </div>

      {/* PRO RECOMMENDATION BANNER FOR REPORTS */}
      {subscription.tierId !== 'pro' && subscription.tierId !== 'vip' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white shadow-md border border-indigo-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-400/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400 text-gray-950">
                  Recommandation Forfait Pro
                </span>
                <span className="text-xs text-indigo-200">Audit & Grand Livre Comptable</span>
              </div>
              <p className="text-sm font-bold text-white">
                Rapports Financiers & Fiscaux Certifiés avec le Forfait Pro
              </p>
              <p className="text-xs text-indigo-100/80 max-w-xl">
                Accédez à l'historique complet sans limite, aux ventilations multi-devises (USD / CDF) certifiées et au grand livre téléchargeable pour votre déclaration fiscale.
              </p>
            </div>
          </div>

          <button
            onClick={() => openSubscriptionModal('pro')}
            className="py-2.5 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer shrink-0"
          >
            Débloquer Forfait Pro (25 $/mois)
          </button>
        </div>
      )}

      {/* Period frequency buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
        <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
          {[
            { id: 'monthly', label: 'Mensuel' },
            { id: 'quarterly', label: 'Trimestriel' },
            { id: 'annual', label: 'Annuel' },
            { id: 'custom', label: 'Personnalisé' }
          ].map((item: any) => (
            <button
              key={item.id}
              onClick={() => handlePeriodChange(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                periodType === item.id
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-[11px]">Du :</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={e => setFilters({ ...filters, startDate: e.target.value })}
              className="p-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-[11px]">Au :</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={e => setFilters({ ...filters, endDate: e.target.value })}
              className="p-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
            />
          </div>
          <select
            value={filters.propertyId}
            onChange={e => setFilters({ ...filters, propertyId: e.target.value })}
            className="p-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
          >
            <option value="all">Toutes les propriétés</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Comparative Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Collected */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Revenus Encaissés</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-emerald-600">
              {currentMetrics.totalIncome.toLocaleString()} $
            </span>
            <div className={`flex items-center text-xs font-bold ${
              priorMetrics.incomeGrowth >= 0 ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {priorMetrics.incomeGrowth >= 0 ? <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> : <TrendingDown className="w-3.5 h-3.5 mr-0.5" />}
              {priorMetrics.incomeGrowth >= 0 ? `+${priorMetrics.incomeGrowth}%` : `${priorMetrics.incomeGrowth}%`}
            </div>
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">
            Période préc. : {priorMetrics.priorIncome.toLocaleString()} $
          </span>
        </div>

        {/* Expenses */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Dépenses d'Exploitation</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-red-600">
              {currentMetrics.totalExpense.toLocaleString()} $
            </span>
            <span className="text-xs text-gray-400 font-semibold">
              {currentMetrics.filteredExpenses.length} dépense{currentMetrics.filteredExpenses.length > 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">
            Période préc. : {priorMetrics.priorExpense.toLocaleString()} $
          </span>
        </div>

        {/* Net Profit */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Résultat Net d'Exploitation</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className={`text-2xl font-bold ${
              currentMetrics.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'
            }`}>
              {currentMetrics.netProfit.toLocaleString()} $
            </span>
            <div className={`flex items-center text-xs font-bold ${
              priorMetrics.netGrowth >= 0 ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {priorMetrics.netGrowth >= 0 ? `+${priorMetrics.netGrowth}%` : `${priorMetrics.netGrowth}%`}
            </div>
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">
            Marge opérationnelle nette
          </span>
        </div>

        {/* Arrears & Occupancy */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Arriérés & Taux d'Occupation</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-amber-600">
              {currentMetrics.totalArrears.toLocaleString()} $
            </span>
            <span className="text-xs font-bold text-emerald-600">
              {currentMetrics.occupancyRate}% occupé
            </span>
          </div>
          <span className="text-[10px] text-gray-400 mt-1 block">
            {currentMetrics.expiringLeasesCount} bail(aux) à échéance dans les 60j
          </span>
        </div>
      </div>

      {/* History of Saved Reports */}
      {savedReports.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-blue-600" />
            Historique des Rapports Financiers Émis
          </h3>
          <div className="divide-y divide-gray-100 dark:divide-gray-750 max-h-48 overflow-y-auto">
            {savedReports.map(rep => (
              <div key={rep.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-gray-900 dark:text-white">
                    Rapport {rep.periodType || 'Périodique'} • {rep.startDate} au {rep.endDate}
                  </span>
                  <p className="text-[11px] text-gray-400">
                    Généré le {format(new Date(rep.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })} • Résultat Net : {rep.netIncome?.toLocaleString()}$
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Enregistré
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
