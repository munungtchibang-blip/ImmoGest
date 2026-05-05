import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, addDoc, collection, query, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { CreditCard, CheckCircle2, ChevronRight, Smartphone, Building2, Droplets, Zap, Wrench, Menu, X, Receipt, History, Trash2, ShieldCheck, User, MessageSquare, Lock } from 'lucide-react';
import { InstallPrompt } from '../components/InstallPrompt';
import { PhotoModal } from '../components/PhotoModal';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function HistoryTab({ items, tenant }: { items: any[], tenant: any }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Historique des paiements et dépenses", 105, 20, { align: "center" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Locataire: ${tenant?.name || 'Inconnu'}`, 14, 30);
    
    items.forEach(p => {
       if (p.isExpense) { /* do nothing for now */ }
    });

    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Type', 'Méthode', 'Montant', 'Détails']],
      body: items.map(p => [
        new Date(p.date).toLocaleDateString('fr-FR'),
        p.type,
        p.method,
        `${p.isExpense ? '-' : '+'}${Math.abs(Number(p.amount))} $`,
        p.notes || ''
      ]),
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`historique_${tenant?.name || 'locataire'}.pdf`);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <h2 className="text-xl font-bold text-gray-900">Historique</h2>
        {items.length > 0 && (
          <button 
            onClick={downloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors text-sm font-medium"
          >
            Télécharger PDF
          </button>
        )}
      </div>
      
      {items.map((p: any) => {
        const isExpanded = expandedId === p.id;
        return (
          <div key={p.id} className="flex flex-col p-4 bg-gray-50 rounded-2xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
            <div className="flex justify-between items-center mb-1">
               <div>
                 <p className="font-bold text-gray-900 flex items-center gap-2">
                   {p.type}
                   <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                 </p>
                 <p className="text-xs text-gray-500">{new Date(p.date).toLocaleDateString('fr-FR')} • {p.method}</p>
               </div>
               <div className="flex items-center gap-4 text-right">
                 <p className={`font-bold ${Number(p.amount) < 0 || p.isExpense ? 'text-red-600' : 'text-green-600'}`}>
                   {Number(p.amount) > 0 && !p.isExpense ? '+' : ''}
                   {p.isExpense ? '-' : ''}
                   {Math.abs(Number(p.amount))} $
                 </p>
               </div>
            </div>
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-700 space-y-2">
                <p><strong>Date:</strong> {new Date(p.date).toLocaleDateString('fr-FR')}</p>
                <p><strong>Montant:</strong> {Math.abs(Number(p.amount))} $</p>
                <p><strong>Méthode:</strong> {p.method}</p>
                <p><strong>Type:</strong> {p.type}</p>
                {p.notes && <p><strong>Détails:</strong> {p.notes}</p>}
                {p.isExpense && <p className="text-xs italic mt-2 text-gray-500">* Cette dépense a été déduite de votre garantie locative.</p>}
              </div>
            )}
          </div>
        );
      })}
      {items.length === 0 && <p className="text-center text-gray-500 py-4">Historique vide.</p>}
    </div>
  );
}

export function PublicPay({ tenantId: propTenantId }: { tenantId?: string }) {
  const params = useParams();
  const tenantId = propTenantId || params.id;
  const [tenant, setTenant] = useState<any>(null);
  const [isTenantAuthed, setIsTenantAuthed] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [maintenances, setMaintenances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPhoto, setShowPhoto] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pay' | 'history' | 'maintenance' | 'report' | 'responses' | 'account' | 'contract'>('dashboard');
  const [paymentType, setPaymentType] = useState<string>('Loyer');
  const [paymentAmount, setPaymentAmount] = useState('');
  
  const [respondingIssueId, setRespondingIssueId] = useState<string | null>(null);
  const [tenantResponseTargetStatus, setTenantResponseTargetStatus] = useState<string>('');
  const [tenantResponseText, setTenantResponseText] = useState<string>('');
  
  const [paymentStep, setPaymentStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('');
  const getLocalItem = (key: string) => {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  };
  const setLocalItem = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch (e) {}
  };

  const [savedAccount, setSavedAccount] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState(getLocalItem('tenant_paymentProvider') || 'M-Pesa');
  const [accountNumber, setAccountNumber] = useState(getLocalItem('tenant_accountNumber') || '');
  const [paymentResult, setPaymentResult] = useState('');
  const handleSaveAccount = () => {
    setLocalItem('tenant_paymentProvider', paymentProvider);
    setLocalItem('tenant_accountNumber', accountNumber);
    setSavedAccount(true);
    setTimeout(() => setSavedAccount(false), 3000);
  };
  const [failReason, setFailReason] = useState('');

  const [issueTitle, setIssueTitle] = useState('Eau');
  const [issueDesc, setIssueDesc] = useState('');
  const [issuePhotoUrl, setIssuePhotoUrl] = useState('');

  const [adminPaymentConfig, setAdminPaymentConfig] = useState<any>(null);
  const [manualCode, setManualCode] = useState('');

  const [contract, setContract] = useState<any>(null);
  
  useEffect(() => {
    const fetchTenantData = async () => {
      if (!tenantId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const docRef = doc(db, 'tenants', tenantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const tData: any = { id: docSnap.id, ...docSnap.data() };
          
          // Verify ownership
          if (auth.currentUser) {
            const { getDoc, doc: fDoc } = await import('firebase/firestore');
            const currentUserDoc = await getDoc(fDoc(db, 'users', auth.currentUser.uid));
            if (currentUserDoc.exists()) {
               const uData = currentUserDoc.data();
               // If this user is a tenant, they MUST only access their own tenantId.
               if (uData.role === 'tenant' && uData.tenantId !== tenantId) {
                 setError('Accès non autorisé.');
                 setLoading(false);
                 return;
               }
            }
          }

          setTenant(tData);
          setPaymentAmount(tData.monthlyRent);
          
          setIsTenantAuthed(true);
          
          if (tData.landlordId) {
            const adminDoc = await getDoc(doc(db, 'users', tData.landlordId));
            if(adminDoc.exists()) {
              setAdminPaymentConfig(adminDoc.data());
            }
          }
          
          // Fetch Payments
          const qPays = query(collection(db, 'payments'), where('tenantId', '==', tenantId));
          const pSnap = await getDocs(qPays);
          const pData = pSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setPayments(pData);
          
          // Fetch Maintenances
          const qMaint = query(collection(db, 'maintenance'), where('tenantId', '==', tenantId));
          const mSnap = await getDocs(qMaint);
          const mData = mSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setMaintenances(mData);
          
          // Fetch Contract
          const qContract = query(collection(db, 'contracts'), where('tenantId', '==', tenantId));
          const cSnap = await getDocs(qContract);
          if (!cSnap.empty) {
            // we just take the first contract matching
            const contractData = cSnap.docs[0].data();
            setContract({ id: cSnap.docs[0].id, ...contractData });
          }
           
          // Fetch Expenses
          const qExp = query(collection(db, 'expenses'), where('tenantId', '==', tenantId));
          const expSnap = await getDocs(qExp);
          const expData = expSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setExpenses(expData);
           
        } else {
          setError('Locataire introuvable.');
        }
      } catch (err: any) {
        console.error("Error fetching tenant", err);
        setError('Erreur de connexion. Veuillez réessayer plus tard.');
      } finally {
        setLoading(false);
      }
    };
    fetchTenantData();
  }, [tenantId]);

  const processPayment = async () => {
    try {
      const now = new Date().toISOString();
      const paymentData = {
        amount: Number(paymentAmount),
        date: now,
        method: `${paymentMethod} ${paymentProvider ? `(${paymentProvider})` : ''}`.trim(),
        type: paymentType,
        notes: `Paiement automatique via portail locataire. Compte: ***${accountNumber ? accountNumber.slice(-4) : ''}`,
        tenantId: tenant.id,
        landlordId: tenant.landlordId,
        createdAt: now
      };

      // Optimistic update for instant mobile response
      const tempId = `temp_${Date.now()}`;
      setPayments(prev => [{id: tempId, ...paymentData}, ...prev]);
      
      setPaymentResult('success');
      setPaymentStep(4);
      
      // Fire and forget to avoid 10s timeout on poor connections blocking UI
      addDoc(collection(db, 'payments'), paymentData).catch(err => {
        console.error("Erreur de synchro en arrière-plan:", err);
      });
      
    } catch (err: any) {
      console.error(err);
      setFailReason('Erreur lors du traitement. Veuillez réessayer.');
      setPaymentResult('error');
      setPaymentStep(4);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!tenant) return;
    setLoading(true);
    setPaymentResult('');
    setFailReason('');

    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await processPayment();
  };

  const handleTenantActionOnMaintenance = async (issue: any, action: string, responseDesc?: string) => {
    if (!tenant) return;
    setLoading(true);
    
    try {
      const issueRef = doc(db, 'maintenance', issue.id);
      
      const updates: any = {
        status: action,
        updatedAt: new Date().toISOString()
      };
      
      if (responseDesc) {
        updates.tenantResponse = responseDesc;
      }

      // If resolved, deduct from guarantee
      if (action === 'Résolu') {
        const cost = Number(issue.cost || 0);
        if (cost > 0) {
          const tenantRef = doc(db, 'tenants', tenant.id);
          const newGuarantee = Number(tenant.guaranteeAmount || 0) - cost;
          await updateDoc(tenantRef, { guaranteeAmount: newGuarantee });
          
          const now = new Date().toISOString();
          await addDoc(collection(db, 'payments'), {
            amount: -cost,
            date: now,
            method: 'Déduction Garantie',
            type: 'Frais de travaux',
            notes: `Frais pour la résolution du problème : ${issue.title}`,
            tenantId: tenant.id,
            landlordId: tenant.landlordId,
            createdAt: now
          });
          
          await addDoc(collection(db, 'expenses'), {
             amount: cost,
             category: 'Entretien',
             date: now,
             description: `Frais de travaux déduits de la garantie (Problème : ${issue.title})`,
             landlordId: tenant.landlordId,
             tenantId: tenant.id,
             propertyId: tenant.propertyId || '',
             createdAt: now
          });
          
          setTenant({ ...tenant, guaranteeAmount: newGuarantee });
        }
      }

      await updateDoc(issueRef, updates);
      setMaintenances(prev => prev.map(m => m.id === issue.id ? { ...m, ...updates } : m));
      
      setRespondingIssueId(null);
      setTenantResponseTargetStatus('');
      setTenantResponseText('');
      alert(action === 'Résolu' ? "Problème marqué comme résolu." : "Statut mis à jour.");
      
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la mise à jour");
    } finally {
      setLoading(false);
    }
  };

  const updateIssueStatus = async (issueId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'maintenance', issueId), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      setMaintenances(prev => prev.map(m => m.id === issueId ? { ...m, status: newStatus } : m));
    } catch (e) {
      console.error(e);
    }
  };

  const handleReportIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !issueTitle || !issueDesc) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const newIssue: any = {
        title: issueTitle,
        description: issueDesc,
        propertyName: tenant.propertyName || 'Inconnu',
        propertyId: tenant.propertyId || '',
        tenantName: tenant.name,
        tenantId: tenant.id,
        landlordId: tenant.landlordId,
        status: 'En attente',
        priority: 'Normale',
        createdAt: now,
        updatedAt: now
      };
      if (issuePhotoUrl) newIssue.photoUrl = issuePhotoUrl;
      const mRef = await addDoc(collection(db, 'maintenance'), newIssue);
      setMaintenances(prev => [{id: mRef.id, ...newIssue}, ...prev]);
      setIssueTitle('');
      setIssueDesc('');
      setIssuePhotoUrl('');
      alert("Votre problème a été signalé avec succès au propriétaire.");
      setActiveTab('dashboard');
    } catch (e) {
      alert("Erreur lors de l'envoi");
    } finally {
      setLoading(false);
    }
  };

  const updateMaintenanceStatus = async (issueId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'maintenance', issueId), { status, updatedAt: new Date().toISOString() });
      setMaintenances(prev => prev.map(m => m.id === issueId ? { ...m, status } : m));
    } catch (error) {
      alert("Erreur lors de la mise à jour");
    }
  };

  if (!tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 font-sans text-gray-900">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3">
             <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">Espace Locataire</h1>
          <p className="text-sm text-gray-500 mb-8">Veuillez entrer votre code d'accès pour vous connecter à votre portail.</p>
          <input 
            type="text" 
            value={manualCode} 
            onChange={e => setManualCode(e.target.value)} 
            placeholder="Code locataire..." 
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none mb-4 text-center font-bold tracking-widest text-lg"
          />
          <button 
            onClick={() => { if(manualCode.trim()){ window.location.href=`/pay/${manualCode.trim()}`; } }}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
          >
            Se Connecter
          </button>
        </div>
      </div>
    );
  }

  if (loading && !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-lg max-w-sm w-full space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 text-2xl font-bold">!</div>
          <h2 className="text-2xl font-bold text-gray-900">Oups</h2>
          <p className="text-gray-500">{error || 'Locataire introuvable.'}</p>
        </div>
      </div>
    );
  }

  const rentPayments = payments.filter((p: any) => p.type === 'Loyer');
  const paidRent = rentPayments.reduce((acc, p) => acc + Number(p.amount), 0);
  const dToday = new Date();
  const dateEntry = new Date(tenant.entryDate || dToday);
  const diffMonths = (dToday.getFullYear() - dateEntry.getFullYear()) * 12 + (dToday.getMonth() - dateEntry.getMonth() + 1);
  const expectedRent = Math.max(1, diffMonths) * (Number(tenant.monthlyRent) || 0);
  const balance = expectedRent - paidRent;
  const unpaidMonths = Math.max(0, Math.ceil(balance / (Number(tenant.monthlyRent) || 1)));

  const waterAmount = Number(tenant.waterAmount) || 0;
  const electAmount = Number(tenant.electricityAmount) || 0;
  const syndicAmount = Number(tenant.syndicAmount) || 0;
  
  const totalExpenses = waterAmount + electAmount + syndicAmount;
  const totalAmountDuePerMonth = (Number(tenant.monthlyRent) || 0) + totalExpenses;

  const currentMonthStart = new Date(dToday.getFullYear(), dToday.getMonth(), 1);
  const paidThisMonth = payments.filter(p => new Date(p.date) >= currentMonthStart).reduce((acc, p) => acc + Number(p.amount), 0);
  const remainingThisMonth = Math.max(0, totalAmountDuePerMonth - paidThisMonth);
  const isLate = dToday.getDate() >= 25 && remainingThisMonth > 0;

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-40">
      <InstallPrompt />
      {tenant.hasNewUpdates && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3 flex items-center justify-between z-10 relative">
          <p className="text-sm text-yellow-800 flex-1 pr-4">Votre propriétaire a récemment mis à jour vos informations ou votre contrat.</p>
          <button 
            onClick={() => updateDoc(doc(db, 'tenants', tenant.id), { hasNewUpdates: false })}
            className="text-yellow-800 text-sm font-semibold underline whitespace-nowrap"
          >
            Masquer
          </button>
        </div>
      )}
      <div className="bg-indigo-600 text-white px-6 pt-8 pb-24 relative rounded-b-[40px] shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-indigo-100 text-sm mb-1">Espace Locataire</p>
            <h1 className="text-2xl font-bold tracking-tight leading-none">{tenant.name}</h1>
          </div>
          <div className="flex items-center gap-3">
             <Building2 className="w-8 h-8 opacity-90 text-indigo-100" />
          </div>
        </div>
        <p className="opacity-90 flex items-center gap-2 text-sm"><span className="w-2 h-2 rounded-full bg-green-400"></span> {tenant.address}</p>
      </div>

      <div className="max-w-md mx-auto px-4 -mt-16 relative z-10">
        
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex gap-4">
                <div className="flex-1 bg-red-50 p-4 rounded-2xl border border-red-100 flex flex-col justify-between">
                   <p className="text-xs text-red-600 font-bold uppercase tracking-wider mb-1">Mois impayés</p>
                   <div>
                     <p className="text-2xl font-black text-red-700">{unpaidMonths}</p>
                     {balance > 0 && <p className="text-xs text-red-600 mt-1 font-bold">Dette: {balance} $</p>}
                   </div>
                </div>
                <div className="flex-1 bg-green-50 p-4 rounded-2xl border border-green-100">
                   <p className="text-xs text-green-600 font-bold uppercase tracking-wider mb-1">Garantie</p>
                   <p className="text-lg font-black text-green-700">{tenant.guaranteeAmount} $</p>
                   <p className="text-xs text-green-600 mt-1">{tenant.guaranteeStatus}</p>
                </div>
              </div>
              <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Montant Loyer</p>
                  <h3 className="text-2xl font-bold text-gray-900">{tenant.monthlyRent || 0} $</h3>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-0.5">Eau: {waterAmount} $</p>
                  <p className="text-xs text-gray-500 mb-0.5">Électricité: {electAmount} $</p>
                  <p className="text-xs text-gray-500 font-bold border-t border-gray-200 mt-1 pt-1">Dépenses: {totalExpenses} $</p>
                </div>
              </div>
              <div className="mt-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex justify-between items-center">
                <span className="text-sm font-semibold text-indigo-900">Total Mensuel</span>
                <span className="font-black text-indigo-700">{totalAmountDuePerMonth} $</span>
              </div>
              
              {unpaidMonths > 0 && (
                <div className="mt-4 p-4 bg-red-50 rounded-2xl border border-red-100">
                  <h4 className="font-bold text-red-800 flex items-center gap-2 mb-2">
                     <span className="w-2 h-2 rounded-full bg-red-600"></span> 
                     Informations sur les impayés
                  </h4>
                  <p className="text-sm text-red-700">Vous avez un retard de <strong>{unpaidMonths} mois</strong> de loyer.</p>
                  <p className="text-sm text-red-700 mt-1">Dette cumulée restante (Loyer uniquement) : <strong>{balance} $</strong></p>
                  <p className="text-xs text-red-600 font-medium mt-2 italic">*Pensez à régulariser vos retards de paiement (un mois ou partiel) pour éviter toute procédure.</p>
                </div>
              )}
              
              {remainingThisMonth > 0 && (
                <div className="mt-2 p-3 bg-blue-50 rounded-xl border border-blue-100 flex justify-between items-center">
                  <span className="text-sm font-semibold text-blue-900">Reste à payer ce mois</span>
                  <span className="font-black text-blue-700">{remainingThisMonth} $</span>
                </div>
              )}
              
              {isLate && (
                <div className="mt-2 p-3 bg-red-100 rounded-xl border border-red-200">
                  <p className="text-sm font-bold text-red-800">Retard de Paiement ⚠️</p>
                  <p className="text-xs text-red-700 mt-1">Vous n'avez pas encore réglé la totalité des frais pour ce mois. Veuillez régulariser votre situation avant la fin du mois.</p>
                </div>
              )}

            </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => { setPaymentType('Loyer'); setPaymentAmount(tenant.monthlyRent); setPaymentStep(1); setActiveTab('pay'); }} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 text-center hover:bg-gray-50 outline-none">
                   <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                     <Building2 className="w-5 h-5" />
                   </div>
                   <p className="font-semibold text-gray-900 text-sm">Loyer</p>
                </button>
                <button onClick={() => { setPaymentType('Eau'); setPaymentAmount(tenant.waterAmount ? String(tenant.waterAmount) : ''); setPaymentStep(1); setActiveTab('pay'); }} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 text-center hover:bg-gray-50 outline-none">
                   <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                     <Droplets className="w-5 h-5" />
                   </div>
                   <p className="font-semibold text-gray-900 text-sm">Eau</p>
                </button>
                <button onClick={() => { setPaymentType('Électricité'); setPaymentAmount(tenant.electricityAmount ? String(tenant.electricityAmount) : ''); setPaymentStep(1); setActiveTab('pay'); }} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 text-center hover:bg-gray-50 outline-none">
                   <div className="w-10 h-10 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-3">
                     <Zap className="w-5 h-5" />
                   </div>
                   <p className="font-semibold text-gray-900 text-sm">Électricité</p>
                </button>
                <button onClick={() => { setPaymentType('Frais syndics'); setPaymentAmount(tenant.syndicAmount ? String(tenant.syndicAmount) : ''); setPaymentStep(1); setActiveTab('pay'); }} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 text-center hover:bg-gray-50 outline-none">
                   <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
                     <ShieldCheck className="w-5 h-5" />
                   </div>
                   <p className="font-semibold text-gray-900 text-sm">Syndic</p>
                </button>
                <button onClick={() => { setPaymentType('Autre'); setPaymentAmount(tenant.otherAmount ? String(tenant.otherAmount) : ''); setPaymentStep(1); setActiveTab('pay'); }} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 text-center hover:bg-gray-50 outline-none">
                   <div className="w-10 h-10 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center mx-auto mb-3">
                     <CreditCard className="w-5 h-5" />
                   </div>
                   <p className="font-semibold text-gray-900 text-sm">Autres Frais</p>
                </button>
                <button onClick={() => setActiveTab('report')} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 text-center hover:bg-gray-50 outline-none">
                   <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-3">
                     <Wrench className="w-5 h-5" />
                   </div>
                   <p className="font-semibold text-gray-900 text-sm">Signaler</p>
                </button>
                <button onClick={() => setActiveTab('contract')} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 text-center hover:bg-gray-50 outline-none">
                   <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                     <Receipt className="w-5 h-5" />
                   </div>
                   <p className="font-semibold text-gray-900 text-sm">Contrat</p>
                </button>
              </div>
            
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold text-gray-900">Paiements Récents</h3>
                 <button onClick={() => setActiveTab('history')} className="text-indigo-600 text-sm font-medium">Voir tout</button>
               </div>
               <div className="space-y-3">
                 {payments.slice(0,3).map((p: any) => (
                   <div key={p.id} className="flex justify-between items-center border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                     <div className="flex items-center gap-3">
                       <div className={`p-2 rounded-full ${p.type === 'Loyer' ? 'bg-indigo-100 text-indigo-600' : p.type === 'Eau' ? 'bg-blue-100 text-blue-600' : p.type === 'Électricité' ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-600'}`}>
                         <Receipt className="w-4 h-4" />
                       </div>
                       <div>
                         <p className="font-semibold text-gray-900 text-sm">{p.type}</p>
                         <p className="text-xs text-gray-500">{new Date(p.date).toLocaleDateString()}</p>
                       </div>
                     </div>
                     <span className="font-bold text-gray-900">{p.amount} $</span>
                   </div>
                 ))}
                 {payments.length === 0 && <p className="text-sm text-gray-500 text-center py-2">Aucun paiement récent.</p>}
               </div>
            </div>
          </div>
        )}

        {activeTab === 'pay' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => { if(paymentStep > 1) setPaymentStep(paymentStep - 1); else setActiveTab('dashboard'); }} className="p-2 hover:bg-gray-100 rounded-full">
                <ChevronRight className="w-5 h-5 rotate-180 text-gray-500" />
              </button>
              <h2 className="text-xl font-bold text-gray-900">Paiement</h2>
            </div>

            {paymentStep === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de paiement</label>
                <select value={paymentType} onChange={e => { 
                  const v = e.target.value;
                  setPaymentType(v); 
                  if(v === 'Loyer') setPaymentAmount(tenant.monthlyRent); 
                  else if(v === 'Tous les frais du mois') setPaymentAmount(String(remainingThisMonth));
                  else if(v === 'Eau') setPaymentAmount(tenant.waterAmount ? String(tenant.waterAmount) : ''); 
                  else if(v === 'Électricité') setPaymentAmount(tenant.electricityAmount ? String(tenant.electricityAmount) : ''); 
                  else if(v === 'Frais syndics') setPaymentAmount(tenant.syndicAmount ? String(tenant.syndicAmount) : '');
                  else if(v === 'Internet / Networks') setPaymentAmount(tenant.networkAmount ? String(tenant.networkAmount) : '');
                  else if(v === 'Entretien') setPaymentAmount(tenant.cleaningAmount ? String(tenant.cleaningAmount) : '');
                  else if(v === 'Autre') setPaymentAmount(tenant.otherAmount ? String(tenant.otherAmount) : '');
                  else setPaymentAmount(''); 
                }} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none">
                  <option>Loyer</option>
                  <option>Tous les frais du mois</option>
                  <option>Eau</option>
                  <option>Électricité</option>
                  <option>Frais syndics</option>
                  <option>Internet / Networks</option>
                  <option>Entretien</option>
                  <option>Autre</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant ($)</label>
                {(unpaidMonths > 0 && paymentType === 'Loyer') && (
                  <div className="mb-2 p-3 border-l-4 border-orange-500 bg-orange-50 text-orange-800 text-sm rounded-lg">
                    <strong>Attention :</strong> Ce paiement couvrira d'abord vos retards ({unpaidMonths} mois impayés).
                  </div>
                )}
                {paymentType === 'Tous les frais du mois' && (
                  <div className="mb-2 p-3 border-l-4 border-blue-500 bg-blue-50 text-blue-800 text-sm rounded-lg">
                    Comprend le loyer, l'eau, l'électricité et tous les frais associés pour ce mois.
                  </div>
                )}
                <input type="number" readOnly={paymentType === 'Loyer' || paymentType === 'Eau' || paymentType === 'Électricité' || paymentType === 'Tous les frais du mois'} value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xl font-bold" />
              </div>

              <button disabled={!paymentAmount || Number(paymentAmount) <= 0} onClick={() => setPaymentStep(2)} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-4 px-4 rounded-xl font-bold transition-colors disabled:opacity-50">
                Payer {paymentAmount || '0'} $
              </button>
            </div>
            )}

            {paymentStep === 2 && (
            <div className="space-y-5">
              <h3 className="font-bold text-gray-900">Mode de paiement</h3>
              <button onClick={() => setPaymentMethod('Mobile Money')} className={`w-full flex items-center gap-4 p-4 rounded-2xl border ${paymentMethod === 'Mobile Money' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'} transition-all`}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-indigo-100 text-indigo-600">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="text-left font-medium">
                    <p className="text-gray-900">Mobile Money</p>
                    <p className="text-xs text-gray-500">M-Pesa, Orange, Airtel</p>
                  </div>
              </button>
              <button onClick={() => setPaymentMethod('Banque')} className={`w-full flex items-center gap-4 p-4 rounded-2xl border ${paymentMethod === 'Banque' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'} transition-all`}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-indigo-100 text-indigo-600">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div className="text-left font-medium">
                    <p className="text-gray-900">Carte Bancaire / Virement</p>
                  </div>
              </button>
              <button disabled={!paymentMethod} onClick={() => setPaymentStep(3)} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50">Continuer</button>
            </div>
            )}

            {paymentStep === 3 && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-sm text-indigo-800">
                <p className="font-medium mb-1">Destinataire final:</p>
                {paymentMethod === 'Mobile Money' ? (
                  adminPaymentConfig?.mobileMoneyProvider ? (
                    <p className="font-bold">✅ Compte propriétaire: {adminPaymentConfig.mobileMoneyProvider} ({'**' + (adminPaymentConfig.mobileMoneyPhone?.slice(-4) || '****')})</p>
                  ) : (
                    <p className="text-orange-600 font-bold">⚠️ Attention: Le propriétaire n'a pas configuré de compte Mobile Money.</p>
                  )
                ) : (
                  adminPaymentConfig?.bankProvider ? (
                    <p className="font-bold">✅ Compte propriétaire: {adminPaymentConfig.bankProvider} ({'**' + (adminPaymentConfig.bankAccountNumber?.slice(-4) || '****')})</p>
                  ) : (
                    <p className="text-orange-600 font-bold">⚠️ Attention: Le propriétaire n'a pas configuré de compte bancaire.</p>
                  )
                )}
              </div>

              <h3 className="font-bold text-gray-900 mt-2">Votre {paymentMethod === 'Mobile Money' ? 'numéro de téléphone' : 'numéro de compte'}</h3>
              <p className="text-xs text-gray-500 -mt-3 mb-2">Configurez votre moyen de paiement pour ce transfert. (ex: tapez 0000 pour simuler un solde insuffisant)</p>
              
              <select value={paymentProvider} onChange={(e) => setPaymentProvider(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none">
                <option value="">Sélectionner votre fournisseur...</option>
                {paymentMethod === 'Mobile Money' ? (
                  <>
                    <option value="M-Pesa">M-Pesa</option>
                    <option value="Airtel Money">Airtel Money</option>
                    <option value="Orange Money">Orange Money</option>
                  </>
                ) : (
                  <>
                    <option value="Carte Bancaire">Carte Visa / Mastercard</option>
                    <option value="Virement">Virement Bancaire</option>
                  </>
                )}
              </select>
              <input type="text" value={accountNumber} onChange={(e) => {
                setAccountNumber(e.target.value);
                setLocalItem('tenant_accountNumber', e.target.value);
              }} placeholder={paymentMethod === 'Mobile Money' ? 'Votre Numéro de téléphone' : 'Votre Numéro de compte'} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none" />
              
              <button onClick={handleSimulatePayment} disabled={loading} className="w-full py-4 bg-green-600 text-white rounded-xl font-bold disabled:opacity-50 flex justify-center items-center gap-2">
                {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>} Confirmer {paymentAmount} $
              </button>
            </div>
            )}

            {paymentStep === 4 && (
            <div className="text-center py-6 space-y-4">
              {paymentResult === 'success' ? (
                <>
                  <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto" />
                  <h2 className="text-2xl font-bold">Paiement Réussi !</h2>
                  <p className="text-gray-500">Votre reçu a été enregistré.</p>
                  <p className="text-sm font-medium text-gray-900 mt-2">{tenant.name} {tenant.phone ? `(${tenant.phone})` : ''}</p>
                  <button onClick={() => { setActiveTab('dashboard'); setPaymentStep(1); }} className="mt-4 w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold transition-colors">Retour</button>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 text-4xl font-bold">!</div>
                  <h2 className="text-2xl font-bold">Échec</h2>
                  <p className="text-red-500">{failReason}</p>
                  <button onClick={() => { setPaymentStep(3); setPaymentResult(''); }} className="mt-4 w-full py-4 bg-indigo-600 text-white rounded-xl font-bold transition-colors">Réessayer</button>
                </>
              )}
            </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryTab tenant={tenant} items={[...payments, ...expenses.map(e => ({ ...e, isExpense: true, method: 'Déduit sur la garantie', type: e.category, notes: e.description }))]
             .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())} />
        )}

        {activeTab === 'report' && (
          <form onSubmit={handleReportIssue} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Signaler un problème</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
              <select required value={issueTitle} onChange={e => setIssueTitle(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none">
                <option value="Eau">Eau</option>
                <option value="Électricité">Électricité</option>
                <option value="Ventilation">Ventilation</option>
                <option value="Nuisance sonore">Nuisance sonore</option>
                <option value="Insécurité">Insécurité</option>
                <option value="Canalisation">Canalisation</option>
                <option value="Lumière">Lumière</option>
                <option value="Climatisation">Climatisation</option>
                <option value="Plomberie">Plomberie</option>
                <option value="Toiture">Toiture</option>
                <option value="Entretien / Propreté">Entretien / Propreté</option>
                <option value="Autre">Autre...</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea required rows={4} value={issueDesc} onChange={e => setIssueDesc(e.target.value)} placeholder="Détaillez votre demande..." className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Photo (optionnelle)</label>
              <input type="file" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement('canvas');
                      let width = img.width;
                      let height = img.height;
                      const MAX_SIZE = 800;
                      if (width > height && width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                      } else if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                      }
                      canvas.width = width;
                      canvas.height = height;
                      const ctx = canvas.getContext('2d');
                      ctx?.drawImage(img, 0, 0, width, height);
                      setIssuePhotoUrl(canvas.toDataURL('image/jpeg', 0.6));
                    };
                    img.src = reader.result as string;
                  };
                  reader.readAsDataURL(file);
                } else {
                  setIssuePhotoUrl('');
                }
              }} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none" />
            </div>
            <button disabled={loading} type="submit" className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold disabled:opacity-50">
              {loading ? 'Envoi...' : 'Envoyer au propriétaire'}
            </button>
            <div className="mt-8">
              <h3 className="font-bold text-gray-900 mb-3">Historique de vos signalements</h3>
              <div className="space-y-3">
               {maintenances.map((m: any) => (
                 <div key={m.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2 mb-2">
                      <span className="font-bold text-gray-900">{m.title}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                          m.status === 'Résolu' ? 'bg-green-100 text-green-700' :
                          m.status === 'En cours' ? 'bg-blue-100 text-blue-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {m.status}
                        </span>
                        <button type="button" onClick={async (e) => {
                          e.preventDefault();
                          if (window.confirm('Voulez-vous supprimer ce signalement ? Cette action est irréversible.')) {
                            try {
                              await deleteDoc(doc(db, 'maintenance', m.id));
                            } catch (error) {
                              console.error('Error deleting issue', error);
                            }
                          }
                        }} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors" title="Supprimer ce signalement">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-gray-700 mb-2 whitespace-pre-wrap leading-relaxed">{m.description}</p>
                    {m.photoUrl && (
                      <div className="block mt-2 cursor-pointer" onClick={() => setShowPhoto(m.photoUrl)}>
                        <img src={m.photoUrl} alt="Problème" className="w-full h-40 object-cover rounded-xl border border-gray-200" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    
                    {(m.notes || m.cost !== undefined || m.duration) && (
                      <div className="mt-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-2">
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3" />
                          Réponse du propriétaire
                        </p>
                        {m.notes && <p className="text-sm text-gray-700 whitespace-pre-wrap">{m.notes}</p>}
                        {(m.cost !== undefined || m.duration) && (
                           <div className="flex flex-wrap gap-2 mt-2">
                             {m.cost !== undefined && <span className="text-xs font-medium bg-red-50 text-red-700 px-2 py-1 rounded border border-red-100">Coût approx: {m.cost} $</span>}
                             {m.duration && <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">Durée estimée: {m.duration}</span>}
                           </div>
                        )}
                      </div>
                    )}
                    
                    {/* Tenant Status Action UI */}
                    {m.status !== 'Résolu' && (
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        {respondingIssueId === m.id ? (
                          <div className="space-y-3">
                            <p className="text-sm font-medium text-gray-900">
                              Marquer comme : {tenantResponseTargetStatus}
                            </p>
                            <textarea
                              className="w-full p-2 border border-gray-200 rounded-lg outline-none text-sm resize-none focus:border-indigo-500"
                              rows={3}
                              placeholder="Expliquez pourquoi..."
                              value={tenantResponseText}
                              onChange={e => setTenantResponseText(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                                onClick={() => {
                                  setRespondingIssueId(null);
                                  setTenantResponseTargetStatus('');
                                  setTenantResponseText('');
                                }}
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                onClick={() => handleTenantActionOnMaintenance(m, tenantResponseTargetStatus, tenantResponseText)}
                                disabled={!tenantResponseText.trim() || loading}
                              >
                                Confirmer
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mettre à jour le statut</p>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleTenantActionOnMaintenance(m, 'Résolu')}
                                className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 font-medium text-xs rounded-lg transition-colors"
                              >
                                Résolu
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRespondingIssueId(m.id);
                                  setTenantResponseTargetStatus('Non résolu');
                                }}
                                className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-medium text-xs rounded-lg transition-colors"
                              >
                                Non résolu
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRespondingIssueId(m.id);
                                  setTenantResponseTargetStatus('Résolu mais pas bien fait');
                                }}
                                className="px-3 py-1.5 bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 font-medium text-xs rounded-lg transition-colors"
                              >
                                Mal fait
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {m.tenantResponse && (
                       <div className="mt-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                         <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Votre réponse ({m.status})</p>
                         <p className="text-sm text-gray-700 mt-1">{m.tenantResponse}</p>
                       </div>
                    )}
                 </div>
               ))}
               {maintenances.length === 0 && <p className="text-xs text-gray-400">Aucun signalement.</p>}
              </div>
            </div>
          </form>
        )}

        {activeTab === 'contract' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Détails du contrat</h2>
            {contract ? (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Status</p>
                      <span className={`px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg`}>{contract.status}</span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Loyer Mensuel</p>
                      <p className="font-bold text-gray-900">{contract.rentAmount} $</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Date de début</p>
                      <p className="font-medium text-gray-900">{contract.startDate ? new Date(contract.startDate).toLocaleDateString() : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Date de fin</p>
                      <p className="font-medium text-gray-900">{contract.endDate ? new Date(contract.endDate).toLocaleDateString() : 'Indéterminée'}</p>
                    </div>
                    <div className="col-span-2">
                       <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Garantie payée</p>
                       <p className="font-medium text-gray-900">{contract.depositAmount} $</p>
                    </div>
                  </div>
                </div>
                {contract.clauses && (
                  <div className="border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Clauses & Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{contract.clauses}</p>
                  </div>
                )}
                {contract.attachmentUrl && (
                  <a href={contract.attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full mt-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium py-3 rounded-xl transition-colors">
                    Télécharger le contrat original
                  </a>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">Aucun contrat électronique associé.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'account' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Compte Sécurisé</h2>
            <p className="text-sm text-gray-500 mb-4">Enregistrez vos informations de paiement pour vos futurs transferts.</p>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur / Banque</label>
              <select 
                value={paymentProvider} 
                onChange={e => setPaymentProvider(e.target.value)} 
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-gray-900" 
              >
                <option value="M-Pesa">M-Pesa</option>
                <option value="Orange Money">Orange Money</option>
                <option value="Airtel Money">Airtel Money</option>
                <option value="Equity Bank">Equity Bank</option>
                <option value="Rawbank">Rawbank</option>
                <option value="Afriland">Afriland First Bank</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de Téléphone / Compte</label>
              <input 
                type="text" 
                value={accountNumber} 
                onChange={e => setAccountNumber(e.target.value)} 
                placeholder="Ex: 0812345678" 
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-gray-900" 
              />
            </div>
            
            <button onClick={handleSaveAccount} disabled={loading} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors">
              Sauvegarder mes infos
            </button>
            {savedAccount && <p className="text-green-600 text-center font-medium mt-2">Informations enregistrées !</p>}
            
            <div className="pt-6 mt-6 border-t border-gray-100">
               <h3 className="font-bold text-gray-900 mb-3">Se déconnecter de l'Espace Locataire</h3>
               <button 
                 onClick={() => auth.signOut()} 
                 className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold transition-colors"
               >
                 Se Déconnecter
               </button>
            </div>
          </div>
        )}

      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 flex justify-around p-3 pb-6 z-50 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'dashboard' ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>
          <Building2 className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-wider">Accueil</span>
        </button>
        <button onClick={() => { if(tenant) { setPaymentType('Loyer'); setPaymentAmount(tenant.monthlyRent); } setActiveTab('pay'); setPaymentStep(1); }} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'pay' ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>
          <CreditCard className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-wider">Payer</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'history' ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>
          <History className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-wider">Historique</span>
        </button>
        <button onClick={() => setActiveTab('report')} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'report' ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>
          <MessageSquare className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-wider">Signalements</span>
        </button>
        <button onClick={() => setActiveTab('account')} className={`flex flex-col items-center gap-1 p-2 ${activeTab === 'account' ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>
          <User className="w-6 h-6" />
          <span className="text-[10px] uppercase tracking-wider">Compte</span>
        </button>
      </div>
      {showPhoto && <PhotoModal url={showPhoto} onClose={() => setShowPhoto(null)} />}
    </div>
  );
}
