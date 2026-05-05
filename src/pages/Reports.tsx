import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { FileText, Download, Calendar as CalendarIcon, Filter } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function Reports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    propertyId: 'all'
  });

  useEffect(() => {
    const fetchProperties = async () => {
      if (!auth.currentUser) return;
      const q = query(collection(db, 'properties'), where('landlordId', '==', auth.currentUser.uid));
      const snap = await getDocs(q);
      setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchProperties();
  }, []);

  const generateReport = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    try {
      const uid = auth.currentUser.uid;
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);

      // Fetch Payments
      const paymentsQuery = query(collection(db, 'payments'), where('landlordId', '==', uid));
      const paymentsSnap = await getDocs(paymentsQuery);
      let payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Filter payments by date
      payments = payments.filter(p => {
        const d = new Date(p.date);
        return d >= start && d <= end;
      });

      // Fetch Expenses
      const expensesQuery = query(collection(db, 'expenses'), where('landlordId', '==', uid));
      const expensesSnap = await getDocs(expensesQuery);
      let expenses = expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      // Filter expenses by date
      expenses = expenses.filter(e => {
        const d = new Date(e.date);
        return d >= start && d <= end;
      });

      // Filter by property if selected
      if (filters.propertyId !== 'all') {
        const tenantsQuery = query(collection(db, 'tenants'), where('landlordId', '==', uid), where('propertyId', '==', filters.propertyId));
        const tenantsSnap = await getDocs(tenantsQuery);
        const tenantIds = tenantsSnap.docs.map(doc => doc.id);
        
        payments = payments.filter(p => tenantIds.includes(p.tenantId));
        expenses = expenses.filter(e => e.propertyId === filters.propertyId);
      }

      // Fetch tenants for names
      const allTenantsQuery = query(collection(db, 'tenants'), where('landlordId', '==', uid));
      const allTenantsSnap = await getDocs(allTenantsQuery);
      const tenantsMap = new Map();
      allTenantsSnap.docs.forEach(doc => {
        tenantsMap.set(doc.id, doc.data().name);
      });

      const doc = new jsPDF();
      const propertyName = filters.propertyId === 'all' ? 'Toutes les propriétés' : properties.find(p => p.id === filters.propertyId)?.name || '';
      
      doc.setFontSize(20);
      doc.text('Rapport Financier', 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Période : Du ${format(start, 'dd/MM/yyyy')} au ${format(end, 'dd/MM/yyyy')}`, 14, 30);
      doc.text(`Propriété : ${propertyName}`, 14, 36);

      const totalIncome = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const netIncome = totalIncome - totalExpense;

      // Summary Table
      autoTable(doc, {
        startY: 45,
        head: [['Résumé', 'Montant']],
        body: [
          ['Total des revenus (Loyers & Garanties)', `${totalIncome.toLocaleString()} $`],
          ['Total des dépenses', `${totalExpense.toLocaleString()} $`],
          ['Bénéfice Net', `${netIncome.toLocaleString()} $`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 12, cellPadding: 5 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
      });

      // Payments Table
      let finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text('Détail des Revenus', 14, finalY);

      const paymentsData = payments.map(p => [
        format(new Date(p.date), 'dd/MM/yyyy'),
        tenantsMap.get(p.tenantId) || 'Locataire inconnu',
        p.type,
        p.method,
        `${p.amount.toLocaleString()} $`
      ]);

      autoTable(doc, {
        startY: finalY + 5,
        head: [['Date', 'Locataire', 'Type', 'Méthode', 'Montant']],
        body: paymentsData.length > 0 ? paymentsData : [['-', 'Aucun revenu', '-', '-', '-']],
        theme: 'striped',
        headStyles: { fillColor: [46, 204, 113] },
        styles: { fontSize: 10 },
        columnStyles: { 4: { halign: 'right' } }
      });

      // Expenses Table
      finalY = (doc as any).lastAutoTable.finalY + 15;
      if (finalY > 250) {
        doc.addPage();
        finalY = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text('Détail des Dépenses', 14, finalY);

      const expensesData = expenses.map(e => [
        format(new Date(e.date), 'dd/MM/yyyy'),
        e.category,
        e.tenantId ? (tenantsMap.get(e.tenantId) || 'Locataire inconnu') : '-',
        e.description || '-',
        `${e.amount.toLocaleString()} $`
      ]);

      autoTable(doc, {
        startY: finalY + 5,
        head: [['Date', 'Catégorie', 'Locataire', 'Description', 'Montant']],
        body: expensesData.length > 0 ? expensesData : [['-', 'Aucune dépense', '-', '-', '-']],
        theme: 'striped',
        headStyles: { fillColor: [231, 76, 60] },
        styles: { fontSize: 10 },
        columnStyles: { 4: { halign: 'right' } }
      });

      const pdfBlob = doc.output('blob');
      const fileName = `Rapport_${format(start, 'yyyyMMdd')}_${format(end, 'yyyyMMdd')}.pdf`;
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

      downloadPDF();
      
    } catch (error) {
      console.error("Error generating report", error);
      setError("Erreur lors de la génération du rapport.");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">Rapports Financiers</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">Générez des rapports PDF détaillés de vos revenus et dépenses.</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8 transition-colors">
        {error && (
          <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-xl text-sm">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" /> Date de début
            </label>
            <input 
              type="date" 
              value={filters.startDate}
              onChange={e => setFilters({...filters, startDate: e.target.value})}
              className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" /> Date de fin
            </label>
            <input 
              type="date" 
              value={filters.endDate}
              onChange={e => setFilters({...filters, endDate: e.target.value})}
              className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filtrer par bien immobilier
            </label>
            <select 
              value={filters.propertyId}
              onChange={e => setFilters({...filters, propertyId: e.target.value})}
              className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
            >
              <option value="all">Toutes les propriétés</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            onClick={generateReport}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Download className="w-5 h-5" />
            )}
            Générer le rapport PDF
          </button>
        </div>
      </div>
    </div>
  );
}
