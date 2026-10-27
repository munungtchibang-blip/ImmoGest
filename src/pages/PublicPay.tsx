import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, addDoc, collection, query, where, onSnapshot, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  CreditCard, 
  CheckCircle2, 
  ChevronRight, 
  Smartphone, 
  Building2, 
  Droplets, 
  Zap, 
  Wrench, 
  History, 
  Trash2, 
  ShieldCheck, 
  ShieldAlert,
  User, 
  MessageSquare, 
  Lock, 
  Download, 
  Camera, 
  AlertTriangle, 
  Calendar, 
  Phone, 
  Mail, 
  LogOut, 
  DollarSign, 
  Check, 
  Clock,
  Layers,
  Bell,
  FileSignature,
  ExternalLink,
  FileCheck2
} from 'lucide-react';
import { InstallPrompt } from '../components/InstallPrompt';
import { PhotoModal } from '../components/PhotoModal';
import { 
  generateNoticeLetterPDF, 
  generateClosureInventoryPDF, 
  calculateNoticeEndDate,
  TerminationProcedure 
} from '../services/terminationEngine';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';

function downloadContractPDF(contract: any, tenant: any) {
  const docPdf = new jsPDF();
  docPdf.setFillColor(30, 58, 138);
  docPdf.rect(0, 0, 210, 40, 'F');
  
  docPdf.setTextColor(255, 255, 255);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(20);
  docPdf.text("CONTRAT DE BAIL À USAGE D'HABITATION", 105, 25, { align: "center" });

  docPdf.setTextColor(31, 41, 55);
  docPdf.setFontSize(10);
  docPdf.setFont("helvetica", "normal");
  docPdf.text(`Réf: BAIL-${(contract?.id || tenant.id).substring(0, 8).toUpperCase()}`, 14, 50);
  docPdf.text(`Émis à Kinshasa le : ${new Date().toLocaleDateString('fr-FR')}`, 135, 50);

  docPdf.setDrawColor(229, 231, 235);
  docPdf.line(14, 55, 196, 55);

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(11);
  docPdf.text("ARTICLE 1 : DÉSIGNATION DU LOCATAIRE & DU LOGEMENT", 14, 65);
  docPdf.setFont("helvetica", "normal");
  docPdf.text(`Locataire bénéficiaire : ${tenant.name}`, 14, 73);
  docPdf.text(`Téléphone : ${tenant.phone || 'N/A'}`, 14, 80);
  docPdf.text(`Adresse du bien loué : ${tenant.address || 'Logement conventionné'}`, 14, 87);
  docPdf.text(`Type d'habitation : ${tenant.housingType || 'Appartement'}`, 14, 94);

  docPdf.setFont("helvetica", "bold");
  docPdf.text("ARTICLE 2 : DURÉE DU CONTRAT", 14, 106);
  docPdf.setFont("helvetica", "normal");
  const startDateStr = contract?.startDate ? new Date(contract.startDate).toLocaleDateString('fr-FR') : new Date(tenant.entryDate || Date.now()).toLocaleDateString('fr-FR');
  const endDateStr = contract?.endDate ? new Date(contract.endDate).toLocaleDateString('fr-FR') : 'Durée indéterminée (tacite reconduction)';
  docPdf.text(`Date de prise d'effet : ${startDateStr}`, 14, 114);
  docPdf.text(`Échéance prévue : ${endDateStr}`, 14, 121);

  docPdf.setFont("helvetica", "bold");
  docPdf.text("ARTICLE 3 : LOYER, CAUTION ET PROVISIONS SUR CHARGES", 14, 133);
  docPdf.setFont("helvetica", "normal");
  docPdf.text(`Montant du loyer mensuel : ${tenant.monthlyRent} $ USD`, 14, 141);
  docPdf.text(`Garantie locative / Caution : ${tenant.guaranteeAmount || 0} $ USD (${tenant.guaranteeStatus || 'Payée'})`, 14, 148);

  const charges = Number(tenant.waterAmount || 0) + Number(tenant.electricityAmount || 0) + Number(tenant.syndicAmount || 0);
  docPdf.text(`Charges locatives mensuelles prévisionnelles : ${charges} $ USD`, 14, 155);

  docPdf.setFont("helvetica", "bold");
  docPdf.text("ARTICLE 4 : CLAUSES & CONDITIONS PARTICULIÈRES (OHADA)", 14, 168);
  docPdf.setFont("helvetica", "normal");
  const clauses = contract?.clauses || "Le preneur s'oblige à payer le loyer à l'échéance convenue au plus tard le 5 de chaque mois, à jouir des lieux paisiblement en bon père de famille, et à assumer l'entretien locatif courant. Le bailleur assure la délivrance d'un logement salubre et le clos-couvert.";
  const splitClauses = docPdf.splitTextToSize(clauses, 180);
  docPdf.text(splitClauses, 14, 176);

  const finalY = Math.min(265, 188 + splitClauses.length * 5);
  docPdf.setFont("helvetica", "bold");
  docPdf.text("Pour le Bailleur / Gestionnaire", 14, finalY);
  docPdf.text("Pour le Locataire", 140, finalY);

  docPdf.save(`contrat_bail_${tenant.name.replace(/\s+/g, '_')}.pdf`);
  toast.success("Contrat de bail officiel téléchargé avec succès !");
}

function downloadSingleReceipt(payment: any, tenant: any) {
  const docPdf = new jsPDF();
  docPdf.setFillColor(30, 58, 138);
  docPdf.rect(0, 0, 210, 40, 'F');
  
  docPdf.setTextColor(255, 255, 255);
  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(22);
  docPdf.text("QUITTANCE DE PAIEMENT", 105, 25, { align: "center" });

  docPdf.setTextColor(31, 41, 55);
  docPdf.setFontSize(11);
  docPdf.setFont("helvetica", "normal");
  docPdf.text(`Réf: PAY-${payment.id?.substring(0, 8)?.toUpperCase() || 'REC'}`, 14, 50);
  docPdf.text(`Date d'émission: ${new Date().toLocaleDateString('fr-FR')}`, 140, 50);

  docPdf.setDrawColor(229, 231, 235);
  docPdf.line(14, 55, 196, 55);

  docPdf.setFontSize(12);
  docPdf.text(`Locataire: ${tenant?.name || 'Inconnu'}`, 14, 65);
  docPdf.text(`Adresse du bien: ${tenant?.address || 'N/A'}`, 14, 73);

  autoTable(docPdf, {
    startY: 85,
    head: [['Nature', 'Date du règlement', 'Moyen de paiement', 'Montant réglé', 'Statut']],
    body: [[
      payment.type || 'Loyer',
      new Date(payment.date).toLocaleDateString('fr-FR'),
      payment.method || 'Mobile Money',
      `${payment.amount} $`,
      payment.status || 'Validé'
    ]],
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138] }
  });

  const finalY = (docPdf as any).lastAutoTable?.finalY || 120;
  docPdf.setFontSize(10);
  docPdf.text("Ce document certifie le paiement libératoire pour les sommes mentionnées ci-dessus.", 14, finalY + 15);
  docPdf.text("ImmoGest - Gestion Locative Sécurisée", 14, finalY + 25);

  docPdf.save(`quittance_${tenant?.name || 'locataire'}_${payment.id?.substring(0,6) || 'recu'}.pdf`);
}

function HistoryTab({ items, tenant }: { items: any[], tenant: any }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const downloadPDF = () => {
    const docPdf = new jsPDF();
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(18);
    docPdf.text("Historique des paiements et dépenses", 105, 20, { align: "center" });

    docPdf.setFontSize(12);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(`Locataire: ${tenant?.name || 'Inconnu'}`, 14, 30);
    
    autoTable(docPdf, {
      startY: 40,
      head: [['Date', 'Type', 'Méthode', 'Montant', 'Statut', 'Détails']],
      body: items.map(p => [
        new Date(p.date).toLocaleDateString('fr-FR'),
        p.type,
        p.method,
        `${p.isExpense ? '-' : '+'}${Math.abs(Number(p.amount))} $`,
        p.status || 'Validé',
        p.notes || ''
      ]),
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    docPdf.save(`historique_${tenant?.name || 'locataire'}.pdf`);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Historique & Justificatifs</h2>
          <p className="text-xs text-gray-500">Tous vos règlements et déductions enregistrés</p>
        </div>
        {items.length > 0 && (
          <button 
            onClick={downloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Télécharger Tout en PDF
          </button>
        )}
      </div>
      
      {items.map((p: any) => {
        const isExpanded = expandedId === p.id;
        return (
          <div key={p.id} className="flex flex-col p-4 bg-gray-50 rounded-2xl border border-gray-100 cursor-pointer hover:bg-gray-100/80 transition-colors" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
            <div className="flex justify-between items-center mb-1">
               <div>
                 <p className="font-bold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
                   {p.type}
                   <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                 </p>
                 <p className="text-xs text-gray-500">
                   {new Date(p.date).toLocaleDateString('fr-FR')} • {p.method}
                 </p>
               </div>
               <div className="flex items-center gap-3 text-right">
                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                   p.status === 'En attente' ? 'bg-amber-100 text-amber-800' :
                   p.status === 'Rejeté' ? 'bg-red-100 text-red-800' :
                   'bg-emerald-100 text-emerald-800'
                 }`}>
                   {p.status || 'Validé'}
                 </span>
                 <p className={`font-bold text-sm sm:text-base ${Number(p.amount) < 0 || p.isExpense ? 'text-red-600' : 'text-emerald-600'}`}>
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
                <p><strong>Statut:</strong> {p.status || 'Validé'}</p>
                {p.notes && <p><strong>Détails:</strong> {p.notes}</p>}
                {p.isExpense && <p className="text-xs italic mt-2 text-gray-500">* Cette dépense a été déduite de votre garantie locative.</p>}
                <div className="pt-2 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadSingleReceipt(p, tenant);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100"
                  >
                    <Download className="w-3.5 h-3.5" /> Quittance individuelle
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Aucun historique de paiement pour le moment.</p>
        </div>
      )}
    </div>
  );
}

export function PublicPay({ tenantId: propTenantId }: { tenantId?: string }) {
  const params = useParams();
  const navigate = useNavigate();
  const tenantId = propTenantId || params.id;

  const [tenant, setTenant] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [maintenances, setMaintenances] = useState<any[]>([]);
  const [contract, setContract] = useState<any>(null);
  const [adminPaymentConfig, setAdminPaymentConfig] = useState<any>(null);

  const [loading, setLoading] = useState(Boolean(tenantId));
  const [error, setError] = useState('');
  const [isLandlordBlocked, setIsLandlordBlocked] = useState(false);
  const [showPhoto, setShowPhoto] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'pay' | 'history' | 'contract' | 'report' | 'notifications' | 'account'>('dashboard');
  const [notifications, setNotifications] = useState<any[]>([]);

  // Payment Form States
  const [paymentType, setPaymentType] = useState<string>('Loyer');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentStep, setPaymentStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'Mobile Money' | 'Carte Visa' | 'Preuve Photo'>('Mobile Money');
  const [paymentProvider, setPaymentProvider] = useState<string>(() => {
    try { return localStorage.getItem('tenant_paymentProvider') || 'M-Pesa'; } catch { return 'M-Pesa'; }
  });
  const [accountNumber, setAccountNumber] = useState<string>(() => {
    try { return localStorage.getItem('tenant_accountNumber') || ''; } catch { return ''; }
  });
  const [proofImage, setProofImage] = useState<string>('');
  const [proofNote, setProofNote] = useState<string>('');
  const [paymentResult, setPaymentResult] = useState<string>('');
  const [failReason, setFailReason] = useState<string>('');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [savedAccountSuccess, setSavedAccountSuccess] = useState(false);

  // Maintenance Form States
  const [issueTitle, setIssueTitle] = useState('Eau');
  const [issueDesc, setIssueDesc] = useState('');
  const [issuePriority, setIssuePriority] = useState('Normale');
  const [issuePhotoUrl, setIssuePhotoUrl] = useState('');
  const [respondingIssueId, setRespondingIssueId] = useState<string | null>(null);
  const [tenantResponseTargetStatus, setTenantResponseTargetStatus] = useState<string>('');
  const [tenantResponseText, setTenantResponseText] = useState<string>('');
  const [submittingIssue, setSubmittingIssue] = useState(false);

  const [manualCode, setManualCode] = useState('');
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);

  // Termination & Notice Procedures State
  const [terminationProcedures, setTerminationProcedures] = useState<TerminationProcedure[]>([]);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeReason, setNoticeReason] = useState('Déménagement pour raisons personnelles');
  const [noticeDurationMonths, setNoticeDurationMonths] = useState(3);
  const [submittingNotice, setSubmittingNotice] = useState(false);

  // Fetch tenant doc and listen to collections
  useEffect(() => {
    if (!tenantId) return;

    let isMounted = true;

    const initTenant = async () => {
      try {
        const docRef = doc(db, 'tenants', tenantId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          if (isMounted) {
            setError('Locataire introuvable. Veuillez vérifier le lien fourni.');
            setLoading(false);
          }
          return;
        }

        const tData: any = { id: docSnap.id, ...docSnap.data() };

        // Privacy & Tamper Check:
        // A landlord MUST NEVER access or modify tenant's portal!
        if (auth.currentUser) {
          try {
            const userDocSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
            if (userDocSnap.exists()) {
              const uData = userDocSnap.data();
              if (uData.role === 'landlord' || auth.currentUser.uid === tData.landlordId) {
                if (isMounted) {
                  setIsLandlordBlocked(true);
                  setLoading(false);
                }
                return;
              }
              // If tenant user, ensure they match this portal
              if (uData.role === 'tenant' && uData.tenantId && uData.tenantId !== tenantId) {
                if (isMounted) {
                  setError("Accès non autorisé : ce lien ne correspond pas à votre compte locataire.");
                  setLoading(false);
                }
                return;
              }
            }
          } catch (e) {
            console.warn("User role check error", e);
          }
        }

        if (isMounted) {
          setTenant(tData);
          setPaymentAmount(String(tData.monthlyRent || 0));
        }

        // Fetch landlord payment settings (bank, mobile money)
        if (tData.landlordId) {
          getDoc(doc(db, 'users', tData.landlordId)).then(adminSnap => {
            if (adminSnap.exists() && isMounted) {
              setAdminPaymentConfig(adminSnap.data());
            }
          }).catch(console.error);
        }

        // Realtime payments listener
        const qPays = query(collection(db, 'payments'), where('tenantId', '==', tenantId));
        const unsubPayments = onSnapshot(qPays, (pSnap) => {
          if (!isMounted) return;
          const pData = pSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
          setPayments(pData);
        });

        // Realtime maintenance listener
        const qMaint = query(collection(db, 'maintenance'), where('tenantId', '==', tenantId));
        const unsubMaint = onSnapshot(qMaint, (mSnap) => {
          if (!isMounted) return;
          const mData = mSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setMaintenances(mData);
        });

        // Realtime expenses listener
        const qExp = query(collection(db, 'expenses'), where('tenantId', '==', tenantId));
        const unsubExp = onSnapshot(qExp, (expSnap) => {
          if (!isMounted) return;
          const expData = expSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setExpenses(expData);
        });

        // Realtime notifications listener
        const qNotifs = query(collection(db, 'notifications'), where('tenantId', '==', tenantId));
        const unsubNotifs = onSnapshot(qNotifs, (nSnap) => {
          if (!isMounted) return;
          const nData = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setNotifications(nData);
        }, (err) => { console.warn("Notifications listener error", err); });

        // Realtime termination procedures listener (Préavis & Clôture)
        const qTerm = query(collection(db, 'termination_procedures'), where('tenantId', '==', tenantId));
        const unsubTerm = onSnapshot(qTerm, (termSnap) => {
          if (!isMounted) return;
          const termData = termSnap.docs.map(d => ({ id: d.id, ...d.data() } as TerminationProcedure));
          termData.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          setTerminationProcedures(termData);
        }, (err) => { console.warn("Termination procedures listener error", err); });

        // Fetch contract
        const qContract = query(collection(db, 'contracts'), where('tenantId', '==', tenantId));
        getDocs(qContract).then(cSnap => {
          if (!cSnap.empty && isMounted) {
            setContract({ id: cSnap.docs[0].id, ...cSnap.docs[0].data() });
          }
        }).catch(console.error);

        if (isMounted) setLoading(false);

        return () => {
          unsubPayments();
          unsubMaint();
          unsubExp();
          unsubNotifs();
          unsubTerm();
        };

      } catch (err: any) {
        console.error("Error loading tenant portal", err);
        if (isMounted) {
          setError('Erreur de connexion. Veuillez réessayer plus tard.');
          setLoading(false);
        }
      }
    };

    initTenant();

    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  // Derived Financial Calculations
  const dToday = useMemo(() => new Date(), []);
  const currentYear = dToday.getFullYear();
  const currentMonthStart = useMemo(() => new Date(dToday.getFullYear(), dToday.getMonth(), 1), [dToday]);

  const waterAmount = Number(tenant?.waterAmount) || 0;
  const electAmount = Number(tenant?.electricityAmount) || 0;
  const syndicAmount = Number(tenant?.syndicAmount) || 0;
  const networkAmount = Number(tenant?.networkAmount) || 0;
  const cleaningAmount = Number(tenant?.cleaningAmount) || 0;
  const otherAmount = Number(tenant?.otherAmount) || 0;

  const totalMonthlyCharges = waterAmount + electAmount + syndicAmount + networkAmount + cleaningAmount + otherAmount;
  const totalAmountDuePerMonth = (Number(tenant?.monthlyRent) || 0) + totalMonthlyCharges;

  // Payments this month
  const paidThisMonthTotal = useMemo(() => {
    return payments
      .filter(p => new Date(p.date) >= currentMonthStart && p.status !== 'Rejeté' && !p.isExpense)
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);
  }, [payments, currentMonthStart]);

  const paidThisMonthForRent = useMemo(() => {
    return payments
      .filter(p => (p.type === 'Loyer' || p.type === 'Tous les frais du mois') && new Date(p.date) >= currentMonthStart && p.status !== 'Rejeté' && !p.isExpense)
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);
  }, [payments, currentMonthStart]);

  // Total paid this year (SYNTHESIS WIDGET)
  const totalPaidThisYear = useMemo(() => {
    return payments
      .filter(p => new Date(p.date).getFullYear() === currentYear && p.status !== 'Rejeté' && !p.isExpense)
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);
  }, [payments, currentYear]);

  // Progress for monthly rent
  const monthlyRentNumber = Number(tenant?.monthlyRent) || 0;
  const rentProgressPercent = monthlyRentNumber > 0 
    ? Math.min(100, Math.round((paidThisMonthForRent / monthlyRentNumber) * 100))
    : 100;

  const remainingThisMonth = Math.max(0, totalAmountDuePerMonth - paidThisMonthTotal);
  const isLate = dToday.getDate() >= 25 && remainingThisMonth > 0;

  // Unpaid months count
  const rentPayments = useMemo(() => payments.filter(p => p.type === 'Loyer' && p.status !== 'Rejeté'), [payments]);
  const paidRentTotal = useMemo(() => rentPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0), [rentPayments]);
  const dateEntry = useMemo(() => new Date(tenant?.entryDate || dToday), [tenant, dToday]);
  const diffMonths = (dToday.getFullYear() - dateEntry.getFullYear()) * 12 + (dToday.getMonth() - dateEntry.getMonth() + 1);
  const expectedRentTotal = Math.max(1, diffMonths) * (Number(tenant?.monthlyRent) || 0);
  const balanceDebt = Math.max(0, expectedRentTotal - paidRentTotal);
  const unpaidMonths = Math.max(0, Math.ceil(balanceDebt / (Number(tenant?.monthlyRent) || 1)));

  // Anti-Duplicate Check
  const checkDuplicateForMonth = (typeToCheck: string) => {
    const curYear = dToday.getFullYear();
    const curMonth = dToday.getMonth();
    return payments.some(p => {
      if (p.status === 'Rejeté' || p.status === 'Échoué' || p.status === 'Contesté') return false;
      const pDate = new Date(p.date);
      return (
        pDate.getFullYear() === curYear &&
        pDate.getMonth() === curMonth &&
        (p.type === typeToCheck || (typeToCheck === 'Tous les frais du mois' && p.type === 'Loyer') || (typeToCheck === 'Loyer' && p.type === 'Tous les frais du mois'))
      );
    });
  };

  // Image compressor for proof screenshots
  const handleProofImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1000;
        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        setProofImage(compressed);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Process and Submit Payment or Proof
  const handleSubmitPayment = async () => {
    if (!tenant) return;

    const numAmount = Number(paymentAmount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      alert("Le montant du versement doit être un nombre strictement supérieur à 0 $ USD.");
      return;
    }

    // Strict Anti-Duplicate Validation
    if (checkDuplicateForMonth(paymentType)) {
      setDuplicateWarning(
        `Un paiement pour "${paymentType}" est déjà enregistré ou en cours de validation par votre bailleur pour ce mois-ci (${dToday.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}). Pour éviter les doubles débits, l'enregistrement en doublon est bloqué.`
      );
      return;
    }

    // Strict Visa Validation
    if (paymentMethod === 'Carte Visa') {
      const sanitized = accountNumber.replace(/\s+/g, '');
      if (paymentProvider !== 'Carte Visa' && !paymentProvider.toLowerCase().includes('visa')) {
        alert("Seules les cartes VISA sont acceptées pour le paiement bancaire direct.");
        return;
      }
      if (sanitized.length < 13 || (!sanitized.startsWith('4') && !paymentProvider.toLowerCase().includes('visa'))) {
        alert("Numéro de carte Visa invalide. Veuillez renseigner un numéro de carte bancaire Visa valide.");
        return;
      }
    }

    setLoading(true);
    setPaymentResult('');
    setFailReason('');

    try {
      const now = new Date().toISOString();
      const monthKey = `${dToday.getFullYear()}-${String(dToday.getMonth() + 1).padStart(2, '0')}-${paymentType}`;

      const paymentRecord: any = {
        amount: numAmount,
        date: now,
        type: paymentType,
        monthKey,
        tenantId: tenant.id,
        landlordId: tenant.landlordId,
        createdAt: now,
        // Rule: All tenant submissions start in 'En attente' pending landlord confirmation
        status: 'En attente'
      };

      if (paymentMethod === 'Mobile Money') {
        paymentRecord.method = `Mobile Money (${paymentProvider || 'M-Pesa'})`;
        paymentRecord.notes = `Déclaration Mobile Money. Compte : ***${accountNumber ? accountNumber.slice(-4) : 'Direct'}`;
      } else if (paymentMethod === 'Carte Visa') {
        paymentRecord.method = `Carte Visa (${paymentProvider || 'Visa'})`;
        paymentRecord.notes = `Déclaration Carte Bancaire Visa. Carte : **** ${accountNumber ? accountNumber.slice(-4) : 'Visa'}`;
      } else {
        paymentRecord.method = 'Capture / Preuve Reçu';
        paymentRecord.notes = proofNote || 'Preuve de virement / reçu transmis par le locataire.';
        paymentRecord.proofUrl = proofImage;
      }

      // 1. Add to payments first
      const paymentRef = await addDoc(collection(db, 'payments'), paymentRecord);

      // 2. Also register in paymentProofs for landlord's review queue
      await addDoc(collection(db, 'paymentProofs'), {
        paymentId: paymentRef.id,
        amount: numAmount,
        date: now,
        type: paymentType,
        monthKey,
        method: paymentRecord.method,
        notes: paymentRecord.notes,
        proofUrl: proofImage || '',
        tenantId: tenant.id,
        tenantName: tenant.name,
        landlordId: tenant.landlordId,
        status: 'En attente',
        createdAt: now
      });

      // 3. Notify landlord
      if (tenant.landlordId) {
        await addDoc(collection(db, 'notifications'), {
          userId: tenant.landlordId,
          landlordId: tenant.landlordId,
          tenantId: tenant.id,
          type: 'payment',
          title: `Paiement en attente de confirmation : ${tenant.name}`,
          message: `Le locataire ${tenant.name} a déclaré un paiement de ${numAmount} $ pour ${paymentType} (${paymentRecord.method}). Veuillez vérifier et confirmer l'encaissement.`,
          createdAt: now,
          read: false
        }).catch(console.warn);
      }

      // Save preference
      try {
        localStorage.setItem('tenant_paymentProvider', paymentProvider);
        localStorage.setItem('tenant_accountNumber', accountNumber);
      } catch (_e) {
        void _e;
      }

      setPaymentResult('success');
      setPaymentStep(4);

    } catch (err: any) {
      console.error("Payment error", err);
      setFailReason("Une erreur est survenue lors de l'enregistrement de votre paiement. Veuillez réessayer.");
      setPaymentResult('error');
      setPaymentStep(4);
    } finally {
      setLoading(false);
    }
  };

  // Submit Departure Notice (Loi n° 15/025 RDC)
  const handleSubmitNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setSubmittingNotice(true);
    try {
      const now = new Date().toISOString();
      const confirmedEnd = calculateNoticeEndDate(now, noticeDurationMonths, true);
      
      const newProc: any = {
        landlordId: tenant.landlordId,
        tenantId: tenant.id,
        contractId: contract?.id || '',
        targetName: tenant.name,
        targetAddressOrSpecialty: tenant.address || 'Logement',
        targetPhone: tenant.phone || '',
        targetEmail: tenant.email || '',
        initiator: 'tenant',
        procedureType: 'preavis_location',
        reason: noticeReason,
        legalBasis: 'Loi n° 15/025 du 31 décembre 2015 relative aux baux à loyer en RDC (Art. 18)',
        notificationDate: now,
        confirmedEndDate: confirmedEnd,
        desiredEndDate: confirmedEnd,
        noticeDurationMonths: Number(noticeDurationMonths) || 3,
        status: 'Préavis en cours',
        closureChecklist: {
          rentPaidUpToDate: false,
          chargesSettled: false,
          inventoryExitDone: false,
          keysReturned: false,
          damagesIdentified: false,
          damageCost: 0,
          guaranteeAmount: Number(tenant.guaranteeAmount) || 0,
          guaranteeReturned: 0,
          hasReserves: false,
          ongoingTasksTransferred: false,
          invoicesPaid: false,
          equipmentReturned: false,
          accessRevoked: false
        },
        events: [
          {
            timestamp: now,
            author: tenant.name,
            role: 'tenant',
            action: 'Dépôt formel du préavis de départ par le locataire',
            details: `Préavis légal de ${noticeDurationMonths} mois déposé. Échéance calculée : ${new Date(confirmedEnd).toLocaleDateString('fr-FR')}. Motif : ${noticeReason}`
          }
        ],
        comments: [],
        createdAt: now,
        updatedAt: now
      };

      await addDoc(collection(db, 'termination_procedures'), newProc);

      // Notify landlord
      if (tenant.landlordId) {
        await addDoc(collection(db, 'notifications'), {
          userId: tenant.landlordId,
          landlordId: tenant.landlordId,
          tenantId: tenant.id,
          type: 'contract',
          title: `Préavis de départ reçu : ${tenant.name}`,
          message: `Le locataire ${tenant.name} a déposé un préavis de départ de ${noticeDurationMonths} mois (Échéance légale : ${new Date(confirmedEnd).toLocaleDateString('fr-FR')}). Motif : ${noticeReason}`,
          createdAt: now,
          read: false
        }).catch(console.warn);
      }

      setShowNoticeModal(false);
      toast.success("Votre préavis de départ a été transmis avec succès à votre bailleur.");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du dépôt du préavis.");
    } finally {
      setSubmittingNotice(false);
    }
  };

  // Maintenance Incident Submission
  const handleReportIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !issueTitle || !issueDesc.trim()) return;

    setSubmittingIssue(true);
    try {
      const now = new Date().toISOString();
      const newIssue: any = {
        title: issueTitle,
        description: issueDesc.trim(),
        priority: issuePriority,
        propertyName: tenant.propertyName || 'Logement',
        propertyId: tenant.propertyId || '',
        tenantName: tenant.name,
        tenantId: tenant.id,
        landlordId: tenant.landlordId,
        status: 'En attente',
        createdAt: now,
        updatedAt: now
      };

      if (issuePhotoUrl) {
        newIssue.photoUrl = issuePhotoUrl;
      }

      await addDoc(collection(db, 'maintenance'), newIssue);

      setIssueTitle('Eau');
      setIssueDesc('');
      setIssuePhotoUrl('');
      setIssuePriority('Normale');
      alert("Votre signalement a été transmis avec succès à votre bailleur.");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'envoi du signalement. Veuillez vérifier votre connexion.");
    } finally {
      setSubmittingIssue(false);
    }
  };

  // Tenant feedback on landlord's resolution
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
            createdAt: now,
            status: 'Validé'
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
      setRespondingIssueId(null);
      setTenantResponseTargetStatus('');
      setTenantResponseText('');
      alert(action === 'Résolu' ? "Signalement clôturé avec succès." : "Statut actualisé.");
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'enregistrement de votre réponse.");
    } finally {
      setLoading(false);
    }
  };

  // Self-deletion of tenant account
  const handleDeleteTenantAccount = async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      // 1. Delete tenant doc
      await deleteDoc(doc(db, 'tenants', tenant.id));
      
      // 2. If user is logged in with Firebase Auth, attempt to delete their auth doc
      if (auth.currentUser) {
        try {
          await deleteDoc(doc(db, 'users', auth.currentUser.uid));
          await auth.currentUser.delete();
        } catch {
          await auth.signOut();
        }
      }

      alert("Votre compte locataire et vos informations personnelles ont été définitivement supprimés.");
      navigate('/');
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la suppression du compte.");
    } finally {
      setLoading(false);
    }
  };

  // 1. LANDLORD SECURITY BLOCK SCREEN
  if (isLandlordBlocked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl border border-gray-100 space-y-6">
          <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <ShieldAlert className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-black tracking-widest text-rose-600 uppercase px-3 py-1 bg-rose-50 rounded-full border border-rose-100">
              Protection Stricte du Locataire
            </span>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Accès Réservé au Locataire
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed text-justify">
              Vous êtes actuellement connecté avec un compte <strong>Bailleur / Propriétaire</strong>. 
              Pour garantir la stricte indépendance, la conformité juridique et empêcher toute altération des informations du locataire, 
              le bailleur <strong>ne peut pas accéder</strong> à l'espace personnel du locataire.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-700 text-left space-y-1.5">
            <p className="font-bold flex items-center gap-1.5 text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Transmission Sécurisée
            </p>
            <p>
              Transmettez ce lien à votre locataire par <strong>WhatsApp</strong> ou par <strong>Email</strong>. 
              Lui seul pourra s'y connecter et enregistrer ses justificatifs.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <Building2 className="w-4 h-4" />
              Retourner à mon Espace Bailleur
            </button>

            <button
              onClick={async () => {
                await auth.signOut();
                window.location.reload();
              }}
              className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-xs transition-colors cursor-pointer"
            >
              Se déconnecter du compte bailleur
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. MANUAL CODE PROMPT IF NO TENANT ID IN URL
  if (!tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 text-gray-900">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full text-center border border-gray-100">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Espace Locataire</h1>
          <p className="text-sm text-gray-500 mb-6">Saisissez votre code d'accès personnel pour ouvrir votre portail locataire.</p>
          <input 
            type="text" 
            value={manualCode} 
            onChange={e => setManualCode(e.target.value)} 
            placeholder="Code locataire..." 
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none mb-4 text-center font-bold tracking-widest text-lg focus:border-indigo-500"
          />
          <button 
            onClick={() => { if (manualCode.trim()) { navigate(`/pay/${manualCode.trim()}`); } }}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors cursor-pointer"
          >
            Se Connecter
          </button>
        </div>
      </div>
    );
  }

  // 3. LOADING SPINNER
  if (loading && !tenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="text-sm font-semibold text-gray-600">Chargement de votre espace sécurisé...</p>
      </div>
    );
  }

  // 4. ERROR STATE
  if (error || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full space-y-4 border border-gray-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Lien Invalide</h2>
          <p className="text-gray-500 text-sm leading-relaxed">{error || 'Le locataire demandé est introuvable.'}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-36 text-gray-900">
      <InstallPrompt />

      {/* Realtime Notification Banner from Landlord */}
      {tenant.hasNewUpdates && (
        <div className="bg-amber-500 text-white px-6 py-2.5 flex items-center justify-between z-20 relative text-xs sm:text-sm font-medium shadow-sm">
          <span>Votre bailleur a mis à jour votre dossier ou votre contrat locatif.</span>
          <button 
            onClick={() => updateDoc(doc(db, 'tenants', tenant.id), { hasNewUpdates: false })}
            className="text-white underline font-bold ml-4 cursor-pointer hover:opacity-90"
          >
            Compris
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-blue-900 text-white px-6 pt-8 pb-20 rounded-b-[40px] shadow-sm relative">
        <div className="max-w-5xl mx-auto flex justify-between items-center mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                Portail Personnel Locataire Sécurisé
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-white">{tenant.name}</h1>
            <p className="opacity-90 flex items-center gap-2 text-xs sm:text-sm text-indigo-100 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 
              {tenant.address || 'Logement conventionné'} • {tenant.housingType || 'Appartement'}
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
            <Building2 className="w-7 h-7 text-indigo-100" />
          </div>
        </div>

        {/* Desktop & Tablet Navigation Tab Bar */}
        <div className="max-w-5xl mx-auto mt-6 flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
          {[
            { id: 'dashboard', label: 'Tableau de bord', icon: Building2 },
            { id: 'pay', label: 'Régler Loyer', icon: CreditCard },
            { id: 'history', label: 'Quittances & Historique', icon: History },
            { id: 'contract', label: 'Mon Contrat', icon: FileSignature },
            { id: 'report', label: 'Mes Réparations', icon: Wrench },
            { id: 'notifications', label: 'Mes Notifications', icon: Bell, badge: notifications.length },
            { id: 'account', label: 'Mon Compte', icon: User },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'pay') {
                    setPaymentType('Loyer');
                    setPaymentAmount(String(remainingThisMonth > 0 ? remainingThisMonth : tenant.monthlyRent));
                    setPaymentStep(1);
                  }
                  setActiveTab(tab.id as any);
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-indigo-950 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-indigo-950 font-black">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-10 relative z-10 space-y-4">

        {/* ======================================================== */}
        {/* TAB 1: DASHBOARD (ACCUEIL) */}
        {/* ======================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">

            {/* Status Card for Current Month's Rent */}
            <div className={`p-5 rounded-3xl shadow-sm border transition-all ${
              remainingThisMonth === 0 
                ? 'bg-gradient-to-br from-emerald-600 to-teal-800 text-white border-emerald-500'
                : isLate
                ? 'bg-gradient-to-br from-rose-600 to-red-800 text-white border-red-500'
                : 'bg-gradient-to-br from-indigo-700 via-blue-800 to-slate-900 text-white border-indigo-600'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-black tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                  {remainingThisMonth === 0 ? "Statut : À Jour ✅" : isLate ? "Retard de Paiement ⚠️" : "Échéance en cours ⏳"}
                </span>
                <span className="text-xs font-semibold text-white/90">
                  {dToday.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-3">
                <div>
                  <p className="text-xs text-white/80">
                    {remainingThisMonth === 0 ? "Loyer mensuel habituel :" : "Reste à régler ce mois :"}
                  </p>
                  <h2 className="text-3xl font-black text-white tracking-tight mt-0.5">
                    {remainingThisMonth === 0 ? `${totalAmountDuePerMonth} $` : `${remainingThisMonth} $`}
                  </h2>
                </div>
                {remainingThisMonth > 0 && (
                  <button
                    onClick={() => {
                      setPaymentType('Loyer');
                      setPaymentAmount(String(remainingThisMonth));
                      setPaymentStep(1);
                      setActiveTab('pay');
                    }}
                    className="py-2.5 px-4 bg-white text-gray-950 font-black text-xs rounded-xl shadow-lg hover:bg-gray-100 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Régler</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <p className="text-[11px] text-white/90 mt-3 pt-2.5 border-t border-white/20">
                {remainingThisMonth === 0
                  ? "Votre loyer et vos charges de ce mois sont entièrement soldés. Merci pour votre ponctualité !"
                  : isLate
                  ? `Dépassement constaté ! Il vous reste ${remainingThisMonth} $ à payer. Veuillez régulariser au plus vite.`
                  : `Loyer de base (${tenant.monthlyRent} $) + Charges eau & élec (${totalMonthlyCharges} $).`}
              </p>
            </div>

            {/* SYNTHESIS WIDGET: MES PAIEMENTS (Requested by User) */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-gray-900">Synthèse : Mes Paiements</h3>
                    <p className="text-[11px] text-gray-500">Bilan financier en temps réel</p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                  Année {currentYear}
                </span>
              </div>

              {/* Total Paid This Year Metric */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-gradient-to-br from-indigo-50/70 to-blue-50/50 rounded-2xl border border-indigo-100/60">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Total versé ({currentYear})</span>
                  <p className="text-2xl font-black text-indigo-950 mt-1">
                    {totalPaidThisYear.toLocaleString()} $
                  </p>
                  <p className="text-[10px] text-indigo-500 mt-0.5">Cumul des reçus validés</p>
                </div>

                <div className="p-3.5 bg-gradient-to-br from-slate-50 to-gray-50 rounded-2xl border border-gray-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Quittances</span>
                  <p className="text-2xl font-black text-gray-900 mt-1">
                    {payments.filter(p => p.status !== 'Rejeté').length}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Documents PDF officiels</p>
                </div>
              </div>

              {/* Visual Progress Bar for Monthly Rent */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-gray-700">Loyer du mois ({dToday.toLocaleDateString('fr-FR', { month: 'short' })})</span>
                  <span className="font-black text-indigo-600">
                    {paidThisMonthForRent} $ / {monthlyRentNumber} $ ({rentProgressPercent}%)
                  </span>
                </div>

                {/* The Progress Bar Track */}
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden relative">
                  <div 
                    className={`h-full transition-all duration-700 rounded-full ${
                      rentProgressPercent >= 100 
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500' 
                        : rentProgressPercent > 0 
                        ? 'bg-gradient-to-r from-indigo-500 to-blue-600' 
                        : 'bg-rose-400'
                    }`}
                    style={{ width: `${rentProgressPercent}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-[10px] text-gray-500 pt-1">
                  <span>0 $</span>
                  <span className={`font-bold ${rentProgressPercent >= 100 ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {rentProgressPercent >= 100 ? '✓ Soldé à 100%' : `${monthlyRentNumber - paidThisMonthForRent} $ restant`}
                  </span>
                  <span>{monthlyRentNumber} $</span>
                </div>
              </div>
            </div>

            {/* Financial Overview Cards */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 p-3.5 rounded-2xl border border-red-100 flex flex-col justify-between">
                  <p className="text-[10px] text-red-600 font-bold uppercase tracking-wider mb-1">Mois impayés</p>
                  <div>
                    <p className="text-xl font-black text-red-700">{unpaidMonths}</p>
                    {balanceDebt > 0 && <p className="text-[11px] text-red-600 font-bold mt-0.5">Dette: {balanceDebt} $</p>}
                  </div>
                </div>

                <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-100 flex flex-col justify-between">
                  <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-1">Garantie locative</p>
                  <div>
                    <p className="text-xl font-black text-emerald-700">{tenant.guaranteeAmount || 0} $</p>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">{tenant.guaranteeStatus || 'Payée'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Loyer conventionné</p>
                  <h4 className="text-xl font-bold text-gray-900">{tenant.monthlyRent || 0} $</h4>
                </div>
                <div className="text-right text-[11px] text-gray-500 space-y-0.5">
                  <p>Eau: <strong className="text-gray-800">{waterAmount} $</strong></p>
                  <p>Élec: <strong className="text-gray-800">{electAmount} $</strong></p>
                  <p className="font-bold border-t border-gray-200 pt-0.5 text-gray-800">Charges: {totalMonthlyCharges} $</p>
                </div>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              <button 
                onClick={() => { 
                  setPaymentType('Loyer'); 
                  setPaymentAmount(tenant.monthlyRent); 
                  setPaymentStep(1); 
                  setActiveTab('pay'); 
                }} 
                className="bg-white p-3.5 rounded-2xl shadow-sm border border-gray-100 text-center hover:bg-gray-50 transition-all cursor-pointer"
              >
                <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-1.5">
                  <Building2 className="w-4 h-4" />
                </div>
                <p className="font-bold text-gray-900 text-xs">Payer Loyer</p>
              </button>

              <button 
                onClick={() => { 
                  setPaymentType('Tous les frais du mois'); 
                  setPaymentAmount(String(remainingThisMonth || totalAmountDuePerMonth)); 
                  setPaymentStep(1); 
                  setActiveTab('pay'); 
                }} 
                className="bg-white p-3.5 rounded-2xl shadow-sm border border-gray-100 text-center hover:bg-gray-50 transition-all cursor-pointer"
              >
                <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-1.5">
                  <CreditCard className="w-4 h-4" />
                </div>
                <p className="font-bold text-gray-900 text-xs">Tout Réglé</p>
              </button>

              <button 
                onClick={() => setActiveTab('report')} 
                className="bg-white p-3.5 rounded-2xl shadow-sm border border-gray-100 text-center hover:bg-gray-50 transition-all cursor-pointer"
              >
                <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mx-auto mb-1.5">
                  <Wrench className="w-4 h-4" />
                </div>
                <p className="font-bold text-gray-900 text-xs">Incident</p>
              </button>
            </div>

            {/* Simplified Payment History */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900">Derniers Paiements</h3>
                  <p className="text-[11px] text-gray-500">Quittances téléchargeables</p>
                </div>
                <button
                  onClick={() => setActiveTab('history')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                >
                  Voir tout ({payments.length})
                </button>
              </div>

              <div className="space-y-2">
                {payments.slice(0, 4).map((p: any) => (
                  <div key={p.id} className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between gap-3 hover:bg-gray-100/70 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                        p.status === 'En attente' ? 'bg-amber-100 text-amber-700' :
                        p.status === 'Rejeté' ? 'bg-rose-100 text-rose-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {p.status === 'En attente' ? <Clock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-xs text-gray-900 truncate">{p.type || 'Loyer'}</p>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                            p.status === 'En attente' ? 'bg-amber-100 text-amber-700' :
                            p.status === 'Rejeté' ? 'bg-rose-100 text-rose-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {p.status || 'Validé'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          {new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} • {p.method || 'Mobile Money'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-black text-sm text-gray-900">+{p.amount} $</span>
                      <button
                        onClick={() => downloadSingleReceipt(p, tenant)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Télécharger la quittance PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {payments.length === 0 && (
                  <p className="text-center text-gray-400 text-xs py-4">
                    Aucun règlement enregistré pour le moment.
                  </p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: ESPACE PAIEMENT (MODERNISÉ AVEC PREUVES & VISA) */}
        {/* ======================================================== */}
        {activeTab === 'pay' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => { if (paymentStep > 1) setPaymentStep(paymentStep - 1); else setActiveTab('dashboard'); }} 
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5 rotate-180 text-gray-500" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Règlement du Loyer</h2>
                  <p className="text-xs text-gray-500">Étape {paymentStep} sur 3</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full">
                {paymentType}
              </span>
            </div>

            {/* Duplicate warning banner */}
            {duplicateWarning && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Paiement Déjà Existant ce Mois-ci
                </div>
                <p>{duplicateWarning}</p>
                <button
                  onClick={() => setDuplicateWarning(null)}
                  className="text-amber-800 font-bold underline"
                >
                  Fermer
                </button>
              </div>
            )}

            {/* STEP 1: Montant et Type */}
            {paymentStep === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Nature du versement
                  </label>
                  <select 
                    value={paymentType} 
                    onChange={e => { 
                      const v = e.target.value;
                      setPaymentType(v);
                      setDuplicateWarning(null);
                      if (v === 'Loyer') setPaymentAmount(String(tenant.monthlyRent || 0)); 
                      else if (v === 'Tous les frais du mois') setPaymentAmount(String(remainingThisMonth || totalAmountDuePerMonth));
                      else if (v === 'Eau') setPaymentAmount(String(waterAmount || 0)); 
                      else if (v === 'Électricité') setPaymentAmount(String(electAmount || 0)); 
                      else if (v === 'Frais syndics') setPaymentAmount(String(syndicAmount || 0));
                      else if (v === 'Internet / Networks') setPaymentAmount(String(networkAmount || 0));
                      else if (v === 'Entretien') setPaymentAmount(String(cleaningAmount || 0));
                      else if (v === 'Autre') setPaymentAmount(String(otherAmount || 0));
                    }} 
                    className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-semibold text-gray-900"
                  >
                    <option value="Loyer">Loyer Conventionné ({tenant.monthlyRent} $)</option>
                    <option value="Tous les frais du mois">Tous les frais du mois ({remainingThisMonth || totalAmountDuePerMonth} $)</option>
                    <option value="Eau">Consommation Eau ({waterAmount} $)</option>
                    <option value="Électricité">Électricité ({electAmount} $)</option>
                    <option value="Frais syndics">Frais syndics ({syndicAmount} $)</option>
                    <option value="Internet / Networks">Internet / Réseau ({networkAmount} $)</option>
                    <option value="Entretien">Entretien ({cleaningAmount} $)</option>
                    <option value="Autre">Autres charges ({otherAmount} $)</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Montant fixé ($)
                    </label>
                    <span className="text-[11px] text-gray-400 font-medium">Montant officiel non modifiable</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="text" 
                      readOnly 
                      value={`${paymentAmount} $`} 
                      className="w-full p-4 bg-gray-100 border border-gray-200 rounded-xl outline-none text-2xl font-black text-gray-900 cursor-not-allowed select-none" 
                    />
                    <Lock className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <button 
                  disabled={!paymentAmount || Number(paymentAmount) <= 0} 
                  onClick={() => {
                    if (checkDuplicateForMonth(paymentType)) {
                      setDuplicateWarning(
                        `Un paiement pour "${paymentType}" est déjà enregistré ce mois-ci. Pour éviter tout doublon, vous ne pouvez pas effectuer deux fois ce même paiement.`
                      );
                      return;
                    }
                    setPaymentStep(2);
                  }} 
                  className="w-full py-4 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <span>Continuer pour {paymentAmount} $</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 2: Choix du Mode de Règlement */}
            {paymentStep === 2 && (
              <div className="space-y-4">
                <h3 className="font-bold text-sm text-gray-900">Sélectionnez le mode de règlement</h3>

                {/* Option 1: Mobile Money */}
                <button 
                  onClick={() => setPaymentMethod('Mobile Money')} 
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left cursor-pointer ${
                    paymentMethod === 'Mobile Money' ? 'border-indigo-600 bg-indigo-50/70 shadow-xs' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-indigo-100 text-indigo-600 shrink-0">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-sm">Mobile Money</p>
                    <p className="text-xs text-gray-500">M-Pesa, Orange Money, Airtel Money</p>
                  </div>
                  {paymentMethod === 'Mobile Money' && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                </button>

                {/* Option 2: Carte Visa Seule */}
                <button 
                  onClick={() => setPaymentMethod('Carte Visa')} 
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left cursor-pointer ${
                    paymentMethod === 'Carte Visa' ? 'border-indigo-600 bg-indigo-50/70 shadow-xs' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-100 text-blue-600 shrink-0">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-sm">Carte Visa</p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Visa Uniquement</span>
                    </div>
                    <p className="text-xs text-gray-500">Paiement sécurisé par carte bancaire Visa</p>
                  </div>
                  {paymentMethod === 'Carte Visa' && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                </button>

                {/* Option 3: Preuve directe / Capture d'écran */}
                <button 
                  onClick={() => setPaymentMethod('Preuve Photo')} 
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left cursor-pointer ${
                    paymentMethod === 'Preuve Photo' ? 'border-indigo-600 bg-indigo-50/70 shadow-xs' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-100 text-emerald-600 shrink-0">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-sm">Preuve de Paiement / Capture</p>
                    <p className="text-xs text-gray-500">Photo du reçu de banque ou capture d'écran du transfert</p>
                  </div>
                  {paymentMethod === 'Preuve Photo' && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                </button>

                <button 
                  onClick={() => setPaymentStep(3)} 
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors cursor-pointer shadow-md mt-4"
                >
                  Étape Suivante
                </button>
              </div>
            )}

            {/* STEP 3: Coordonnées & Envoi */}
            {paymentStep === 3 && (
              <div className="space-y-4">
                {/* Landlord recipient notice */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-900 space-y-1">
                  <p className="font-bold uppercase tracking-wider text-[10px] text-indigo-700">Compte Récepteur du Bailleur</p>
                  {paymentMethod === 'Mobile Money' ? (
                    adminPaymentConfig?.mobileMoneyProvider ? (
                      <p className="font-medium">
                        ✅ Versement vers : <strong>{adminPaymentConfig.mobileMoneyProvider}</strong> ({'**' + (adminPaymentConfig.mobileMoneyPhone?.slice(-4) || '****')})
                      </p>
                    ) : (
                      <p className="text-amber-700 font-semibold">⚠️ Le bailleur recevra la notification directe de votre versement.</p>
                    )
                  ) : paymentMethod === 'Carte Visa' ? (
                    adminPaymentConfig?.bankProvider ? (
                      <p className="font-medium">
                        ✅ Compte bancaire récepteur : <strong>{adminPaymentConfig.bankProvider}</strong> ({'**' + (adminPaymentConfig.bankAccountNumber?.slice(-4) || '****')})
                      </p>
                    ) : (
                      <p className="text-indigo-800">✅ Versement sécurisé direct sur le compte séquestre du bailleur.</p>
                    )
                  ) : (
                    <p className="text-emerald-800 font-medium">
                      📸 Votre bailleur validera immédiatement la quittance dès réception de votre preuve.
                    </p>
                  )}
                </div>

                {/* Sub-form according to payment method */}
                {paymentMethod === 'Mobile Money' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Opérateur Mobile Money
                    </label>
                    <select 
                      value={paymentProvider} 
                      onChange={e => setPaymentProvider(e.target.value)} 
                      className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-semibold"
                    >
                      <option value="M-Pesa">M-Pesa (Vodacom)</option>
                      <option value="Orange Money">Orange Money</option>
                      <option value="Airtel Money">Airtel Money</option>
                    </select>

                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider pt-1">
                      Numéro de téléphone expéditeur
                    </label>
                    <input 
                      type="tel" 
                      value={accountNumber} 
                      onChange={e => setAccountNumber(e.target.value)} 
                      placeholder="Ex: 0812345678" 
                      className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-semibold"
                    />
                  </div>
                )}

                {paymentMethod === 'Carte Visa' && (
                  <div className="space-y-3">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                      <strong>Règle de sécurité :</strong> Seules les cartes portant le logo VISA sont autorisées pour ce compte.
                    </div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Numéro de Carte Visa
                    </label>
                    <input 
                      type="text" 
                      value={accountNumber} 
                      onChange={e => setAccountNumber(e.target.value)} 
                      placeholder="4000 1234 5678 9010" 
                      className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-semibold"
                    />
                  </div>
                )}

                {paymentMethod === 'Preuve Photo' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Téléverser votre capture / photo du reçu
                    </label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProofImageUpload(file);
                      }}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500"
                    />

                    {proofImage && (
                      <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 p-2">
                        <img src={proofImage} alt="Preuve" className="w-full h-44 object-contain rounded-xl" />
                        <button
                          type="button"
                          onClick={() => setProofImage('')}
                          className="absolute top-4 right-4 bg-red-600 text-white p-1.5 rounded-full shadow hover:bg-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider pt-1">
                      Note ou Référence du virement (facultatif)
                    </label>
                    <input 
                      type="text" 
                      value={proofNote} 
                      onChange={e => setProofNote(e.target.value)} 
                      placeholder="Ex: Virement bancaire n° 98234 effectué ce matin" 
                      className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm"
                    />
                  </div>
                )}

                <button 
                  onClick={handleSubmitPayment} 
                  disabled={loading || (paymentMethod === 'Preuve Photo' && !proofImage)} 
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md mt-4"
                >
                  {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  <span>Valider le paiement de {paymentAmount} $</span>
                </button>
              </div>
            )}

            {/* STEP 4: Confirmation Result */}
            {paymentStep === 4 && (
              <div className="text-center py-6 space-y-4">
                {paymentResult === 'success' ? (
                  <>
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                      <CheckCircle2 className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900">Paiement Enregistré !</h2>
                    <p className="text-sm text-gray-600 max-w-xs mx-auto">
                      Votre justificatif a été transmis au bailleur avec succès. Votre quittance est prête.
                    </p>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-xs text-gray-700 text-left space-y-1">
                      <p><strong>Montant :</strong> {paymentAmount} $</p>
                      <p><strong>Type :</strong> {paymentType}</p>
                      <p><strong>Moyen :</strong> {paymentMethod}</p>
                      <p><strong>Bénéficiaire :</strong> {tenant.name}</p>
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                      <button 
                        onClick={() => { setActiveTab('dashboard'); setPaymentStep(1); }} 
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-colors cursor-pointer"
                      >
                        Retour au Tableau de Bord
                      </button>
                      <button 
                        onClick={() => setActiveTab('history')} 
                        className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-xs transition-colors cursor-pointer"
                      >
                        Voir dans l'historique
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mx-auto">
                      <AlertTriangle className="w-10 h-10" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Échec du Règlement</h2>
                    <p className="text-sm text-rose-600">{failReason || "Une erreur est survenue."}</p>
                    <button 
                      onClick={() => { setPaymentStep(3); setPaymentResult(''); }} 
                      className="mt-4 w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-sm transition-colors cursor-pointer"
                    >
                      Réessayer
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: HISTORIQUE DES PAIEMENTS */}
        {/* ======================================================== */}
        {activeTab === 'history' && (
          <HistoryTab 
            tenant={tenant} 
            items={[
              ...payments, 
              ...expenses.map(e => ({ 
                ...e, 
                isExpense: true, 
                method: 'Déduit sur la garantie', 
                type: e.category, 
                notes: e.description 
              }))
            ].sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime())} 
          />
        )}

        {/* ======================================================== */}
        {/* TAB 4: ESPACE SIGNALEMENT (MODERNISÉ AVEC PHOTOS & TIMELINE) */}
        {/* ======================================================== */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            <form onSubmit={handleReportIssue} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Signaler un Incident</h2>
                  <p className="text-[11px] text-gray-500">Transmis directement au gestionnaire</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Catégorie du problème
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'Eau', label: 'Eau', icon: Droplets },
                    { id: 'Électricité', label: 'Électricité', icon: Zap },
                    { id: 'Plomberie', label: 'Plomberie', icon: Wrench },
                    { id: 'Fuite', label: 'Fuite', icon: Droplets },
                    { id: 'Toiture', label: 'Toiture', icon: Building2 },
                    { id: 'Autre', label: 'Autre', icon: Layers }
                  ].map(cat => {
                    const IconComp = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setIssueTitle(cat.id)}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                          issueTitle === cat.id 
                            ? 'border-indigo-600 bg-indigo-50/80 text-indigo-700 font-bold' 
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50 text-xs'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                        <span className="text-[11px]">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Urgence
                </label>
                <div className="flex gap-2">
                  {['Normale', 'Urgente'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setIssuePriority(p)}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${
                        issuePriority === p 
                          ? (p === 'Urgente' ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-indigo-50 text-indigo-700 border-indigo-300')
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Description précise
                </label>
                <textarea 
                  required 
                  rows={3} 
                  value={issueDesc} 
                  onChange={e => setIssueDesc(e.target.value)} 
                  placeholder="Décrivez l'anomalie constatée (ex: fuite sous l'évier, coupure de courant...)" 
                  className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs sm:text-sm resize-none focus:border-indigo-500" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Photo illustrative (optionnelle)
                </label>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const img = new Image();
                        img.onload = () => {
                          const canvas = document.createElement('canvas');
                          let width = img.width;
                          let height = img.height;
                          const MAX_SIZE = 800;
                          if (width > height && width > MAX_SIZE) {
                            height = Math.round((height * MAX_SIZE) / width);
                            width = MAX_SIZE;
                          } else if (height > MAX_SIZE) {
                            width = Math.round((width * MAX_SIZE) / height);
                            height = MAX_SIZE;
                          }
                          canvas.width = width;
                          canvas.height = height;
                          const ctx = canvas.getContext('2d');
                          ctx?.drawImage(img, 0, 0, width, height);
                          setIssuePhotoUrl(canvas.toDataURL('image/jpeg', 0.65));
                        };
                        img.src = ev.target?.result as string;
                      };
                      reader.readAsDataURL(file);
                    }
                  }} 
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500" 
                />

                {issuePhotoUrl && (
                  <div className="relative mt-2 rounded-xl overflow-hidden border border-gray-200">
                    <img src={issuePhotoUrl} alt="Aperçu" className="w-full h-36 object-cover" />
                    <button
                      type="button"
                      onClick={() => setIssuePhotoUrl('')}
                      className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full hover:bg-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <button 
                disabled={submittingIssue || !issueDesc.trim()} 
                type="submit" 
                className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 cursor-pointer shadow-md"
              >
                {submittingIssue ? 'Transmission en cours...' : 'Envoyer le signalement au bailleur'}
              </button>
            </form>

            {/* List of past incidents and feedback */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-bold text-sm text-gray-900">Historique de vos signalements ({maintenances.length})</h3>

              <div className="space-y-3">
                {maintenances.map((m: any) => (
                  <div key={m.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-xs sm:text-sm space-y-2.5">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-bold text-gray-900 block">{m.title}</span>
                        <span className="text-[11px] text-gray-500">
                          {new Date(m.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          m.status === 'Résolu' ? 'bg-emerald-100 text-emerald-800' :
                          m.status === 'En cours' ? 'bg-blue-100 text-blue-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {m.status}
                        </span>
                        <button 
                          type="button" 
                          onClick={async () => {
                            if (window.confirm('Voulez-vous supprimer ce signalement ?')) {
                              try {
                                await deleteDoc(doc(db, 'maintenance', m.id));
                              } catch (e) {
                                console.error(e);
                              }
                            }
                          }} 
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{m.description}</p>

                    {m.photoUrl && (
                      <div className="cursor-pointer" onClick={() => setShowPhoto(m.photoUrl)}>
                        <img src={m.photoUrl} alt="Photo problème" className="w-full h-36 object-cover rounded-xl border border-gray-200 hover:opacity-95" />
                      </div>
                    )}

                    {/* Landlord feedback & work costs */}
                    {(m.notes || m.cost !== undefined || m.duration) && (
                      <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-xs space-y-1.5">
                        <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          Réponse du bailleur
                        </p>
                        {m.notes && <p className="text-xs text-gray-800">{m.notes}</p>}
                        {(m.cost !== undefined || m.duration) && (
                          <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                            {m.cost !== undefined && <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-100">Coût déduit: {m.cost} $</span>}
                            {m.duration && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">Délai estimé: {m.duration}</span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tenant Status Actions */}
                    {m.status !== 'Résolu' && (
                      <div className="pt-2 border-t border-gray-200">
                        {respondingIssueId === m.id ? (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-gray-800">Votre retour : {tenantResponseTargetStatus}</p>
                            <textarea
                              rows={2}
                              placeholder="Expliquez la situation..."
                              value={tenantResponseText}
                              onChange={e => setTenantResponseText(e.target.value)}
                              className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setRespondingIssueId(null);
                                  setTenantResponseTargetStatus('');
                                  setTenantResponseText('');
                                }}
                                className="flex-1 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg"
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTenantActionOnMaintenance(m, tenantResponseTargetStatus, tenantResponseText)}
                                className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg"
                              >
                                Envoyer
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Mettre à jour :</span>
                            <button
                              type="button"
                              onClick={() => handleTenantActionOnMaintenance(m, 'Résolu')}
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-bold"
                            >
                              ✓ Résolu
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRespondingIssueId(m.id);
                                setTenantResponseTargetStatus('Non résolu');
                              }}
                              className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-lg text-xs font-bold"
                            >
                              Non résolu
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRespondingIssueId(m.id);
                                setTenantResponseTargetStatus('Mal fait');
                              }}
                              className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded-lg text-xs font-bold"
                            >
                              Mal fait
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {maintenances.length === 0 && (
                  <p className="text-center text-gray-400 text-xs py-4">
                    Aucun incident signalé pour ce logement.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: RUBRIQUE MON CONTRAT (DEMANDÉE PAR L'UTILISATEUR) */}
        {/* ======================================================== */}
        {activeTab === 'contract' && (
          <div className="space-y-4 tab-enter">
            {/* Header Card */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4 card-enter">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <FileSignature className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Mon Contrat de Bail</h2>
                    <p className="text-xs text-gray-500">Bail d'habitation en vigueur et documents locatifs officiels</p>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {contract?.status || 'Bail Actif'}
                </span>
              </div>

              {/* Grid Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Logement Occupé</span>
                  <p className="text-sm font-extrabold text-gray-900">{tenant.address || 'Logement conventionné'}</p>
                  <p className="text-[11px] text-gray-500">{tenant.housingType || 'Appartement'}</p>
                </div>

                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Loyer Mensuel</span>
                  <p className="text-xl font-black text-indigo-700">{tenant.monthlyRent} $</p>
                  <p className="text-[11px] text-gray-500">Exigible le 5 de chaque mois</p>
                </div>

                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Dépôt de Garantie</span>
                  <p className="text-xl font-black text-emerald-700">{tenant.guaranteeAmount || 0} $</p>
                  <p className="text-[11px] text-emerald-600 font-semibold">{tenant.guaranteeStatus || 'Payée'}</p>
                </div>

                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Date de Prise d'Effet</span>
                  <p className="text-sm font-bold text-gray-800">
                    {new Date(contract?.startDate || tenant.entryDate || dToday).toLocaleDateString('fr-FR')}
                  </p>
                  <p className="text-[11px] text-gray-400">Entrée dans les lieux</p>
                </div>

                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Date d'Échéance</span>
                  <p className="text-sm font-bold text-gray-800">
                    {contract?.endDate ? new Date(contract.endDate).toLocaleDateString('fr-FR') : 'Durée indéterminée'}
                  </p>
                  <p className="text-[11px] text-gray-400">Tacite reconduction</p>
                </div>

                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Charges Mensuelles</span>
                  <p className="text-sm font-bold text-gray-800">
                    {Number(tenant.waterAmount || 0) + Number(tenant.electricityAmount || 0) + Number(tenant.syndicAmount || 0)} $
                  </p>
                  <p className="text-[11px] text-gray-500">Eau, Élec, Syndic</p>
                </div>
              </div>

              {/* Specific Clauses */}
              <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/60 space-y-2 text-xs">
                <span className="font-extrabold text-indigo-950 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Clauses Particulières & Engagements Locatifs
                </span>
                <p className="text-gray-700 leading-relaxed">
                  {contract?.clauses || "Le preneur s'oblige à payer son loyer à terme échu au plus tard le 5 de chaque mois, à jouir des lieux paisiblement en bon père de famille, et à assumer les réparations locatives courantes. Le bailleur assure le clos, le couvert et la délivrance d'un logement salubre."}
                </p>
              </div>

              {/* Download Actions */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => downloadContractPDF(contract, tenant)}
                  className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger mon Contrat de Bail (PDF Officiel)</span>
                </button>

                {contract?.attachmentUrl && (
                  <a
                    href={contract.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Pièce Jointe du Bail</span>
                  </a>
                )}
              </div>
            </div>

            {/* SECTION: GESTION DES PRÉAVIS & FIN DE BAIL (LOI N° 15/025 RDC) */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-gray-900">
                      Préavis de Départ & Clôture de Bail
                    </h3>
                    <p className="text-[11px] text-gray-500">
                      Conforme à la Loi n° 15/025 relative aux baux à loyer en RDC
                    </p>
                  </div>
                </div>

                {terminationProcedures.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setShowNoticeModal(true)}
                    className="py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Déposer un préavis</span>
                  </button>
                )}
              </div>

              {terminationProcedures.length > 0 ? (
                <div className="space-y-4">
                  {terminationProcedures.map((proc) => {
                    const isCompleted = proc.status === 'Terminé';
                    const isClosed = proc.status === 'En cours de clôture' || isCompleted;
                    return (
                      <div key={proc.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-gray-900">
                              Dossier #{proc.id.substring(0, 8).toUpperCase()}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {proc.initiator === 'tenant' ? '(Initié par vous)' : '(Notifié par le bailleur)'}
                            </span>
                          </div>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                            proc.status === 'Terminé' ? 'bg-emerald-100 text-emerald-800' :
                            proc.status === 'En cours de clôture' ? 'bg-purple-100 text-purple-800' :
                            proc.status === 'Accord amiable' ? 'bg-blue-100 text-blue-800' :
                            proc.status === 'Contesté' ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {proc.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <span className="text-[10px] uppercase font-bold text-gray-400 block">Notification</span>
                            <span className="font-bold text-gray-800">
                              {proc.notificationDate ? new Date(proc.notificationDate).toLocaleDateString('fr-FR') : 'Date convenue'}
                            </span>
                          </div>
                          <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <span className="text-[10px] uppercase font-bold text-gray-400 block">Fin de bail programmée</span>
                            <span className="font-bold text-indigo-700">
                              {proc.confirmedEndDate ? new Date(proc.confirmedEndDate).toLocaleDateString('fr-FR') : 'À convenir'}
                            </span>
                          </div>
                          <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                            <span className="text-[10px] uppercase font-bold text-gray-400 block">Délai Légal</span>
                            <span className="font-bold text-gray-800">
                              {proc.noticeDurationMonths} mois (Art. 18)
                            </span>
                          </div>
                        </div>

                        <div className="p-3 bg-white rounded-xl border border-gray-100 text-xs space-y-1">
                          <p className="font-bold text-gray-700">Motif signifié :</p>
                          <p className="text-gray-600 italic">"{proc.reason}"</p>
                          <p className="text-[10px] text-gray-400 pt-1">
                            Fondement : {proc.legalBasis}
                          </p>
                        </div>

                        {/* Checklist d'état des lieux & obligations */}
                        <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs space-y-2">
                          <span className="font-bold text-indigo-950 block">Suivi des obligations de clôture :</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              {proc.closureChecklist?.rentPaidUpToDate ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                              <span>Loyers soldés</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {proc.closureChecklist?.chargesSettled ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                              <span>Charges réglées</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {proc.closureChecklist?.inventoryExitDone ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                              <span>État des lieux sortie</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {proc.closureChecklist?.keysReturned ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Clock className="w-3.5 h-3.5 text-amber-500" />}
                              <span>Clés restituées</span>
                            </div>
                          </div>
                        </div>

                        {/* PDF Downloads */}
                        <div className="pt-1 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => generateNoticeLetterPDF(proc, adminPaymentConfig?.companyName || 'Le Bailleur')}
                            className="py-2 px-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Lettre officielle de préavis (PDF)</span>
                          </button>

                          {(isClosed || proc.closureChecklist?.inventoryExitDone) && (
                            <button
                              type="button"
                              onClick={() => generateClosureInventoryPDF(proc)}
                              className="py-2 px-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>PV de Clôture & Décompte Garantie (PDF)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-100 text-xs text-amber-950 space-y-2">
                  <p className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    Réglementation relative au départ du logement (RDC)
                  </p>
                  <p className="leading-relaxed text-amber-900">
                    Conformément à la Loi n° 15/025, le délai de préavis pour un logement d'habitation est légalement fixé à <strong>3 mois</strong>. 
                    Le préavis prend effet à compter du 1er jour du mois civil suivant sa notification formelle. 
                    Si vous envisagez de quitter le logement, vous pouvez adresser votre notification directement ci-dessous.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNoticeModal(true)}
                    className="py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Déposer formellement un préavis de départ</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL: FORMULAIRE DE PRÉAVIS DE DÉPART */}
        {showNoticeModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 tab-enter">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-gray-900">Dépôt de Préavis de Départ</h3>
                    <p className="text-[10px] text-gray-500">Conforme à la Loi n° 15/025 RDC</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNoticeModal(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitNotice} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Durée légale du préavis *
                  </label>
                  <select
                    value={noticeDurationMonths}
                    onChange={e => setNoticeDurationMonths(Number(e.target.value))}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-indigo-900"
                  >
                    <option value={3}>3 mois (Délai légal standard - Habitation)</option>
                    <option value={2}>2 mois (Dérogation / Accord préalable)</option>
                    <option value={1}>1 mois (Cas d'urgence ou accord écrit)</option>
                    <option value={6}>6 mois (Bail commercial ou longue durée)</option>
                  </select>
                </div>

                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-1">
                  <span className="text-[10px] uppercase font-bold text-indigo-700 block">
                    Calcul de l'échéance légale
                  </span>
                  <p className="font-extrabold text-indigo-950 text-sm">
                    Date de fin de contrat : {new Date(calculateNoticeEndDate(new Date().toISOString(), noticeDurationMonths, true)).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-[10px] text-indigo-600">
                    Prend effet le 1er du mois prochain et s'achève au dernier jour du {noticeDurationMonths}e mois.
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Motif du préavis *
                  </label>
                  <select
                    value={noticeReason}
                    onChange={e => setNoticeReason(e.target.value)}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-semibold text-gray-800"
                  >
                    <option value="Déménagement pour raisons personnelles">Déménagement pour raisons personnelles</option>
                    <option value="Mutation ou réaffectation professionnelle">Mutation ou réaffectation professionnelle</option>
                    <option value="Acquisition d'un logement personnel">Acquisition d'un logement personnel</option>
                    <option value="Changement de situation familiale">Changement de situation familiale</option>
                    <option value="Fin de mission professionnelle à Kinshasa">Fin de mission professionnelle à Kinshasa</option>
                    <option value="Autre motif convenu">Autre motif convenu</option>
                  </select>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-[11px] text-gray-600 leading-relaxed">
                  En transmettant ce préavis, vous vous engagez à régler les loyers et charges d'ici l'échéance et à convenir d'un état des lieux de sortie contradictoire pour la restitution des clés et de la garantie locative.
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNoticeModal(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={submittingNotice}
                    className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl disabled:opacity-50 shadow-md cursor-pointer"
                  >
                    {submittingNotice ? 'Transmission...' : 'Confirmer & Transmettre'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: RUBRIQUE MES NOTIFICATIONS (DEMANDÉE PAR L'UTILISATEUR) */}
        {/* ======================================================== */}
        {activeTab === 'notifications' && (
          <div className="space-y-4 tab-enter">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4 card-enter">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Mes Notifications</h2>
                    <p className="text-xs text-gray-500">Rappels de loyer, quittances et alertes logement</p>
                  </div>
                </div>

                <span className="text-xs font-bold text-indigo-600 px-2.5 py-1 rounded-full bg-indigo-50">
                  {notifications.length + 2} alertes
                </span>
              </div>

              {/* Smart system notifications */}
              <div className="space-y-2.5">
                {/* 1. Rent reminder */}
                <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                  remainingThisMonth > 0 
                    ? 'bg-amber-50/80 border-amber-200 text-amber-950' 
                    : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                }`}>
                  <Calendar className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold">
                        {remainingThisMonth > 0 ? "Échéance de loyer en cours" : "Loyer soldé pour ce mois"}
                      </span>
                      <span className="text-[10px] text-gray-400">Ce mois</span>
                    </div>
                    <p className="text-gray-600 mt-1">
                      {remainingThisMonth > 0 
                        ? `Votre loyer de ${dToday.toLocaleDateString('fr-FR', { month: 'long' })} présente un solde restant de ${remainingThisMonth} $. Vous pouvez le régler directement en ligne.`
                        : "Votre compte est entièrement à jour pour ce mois-ci. Merci pour votre ponctualité !"}
                    </p>
                    {remainingThisMonth > 0 && (
                      <button
                        onClick={() => {
                          setPaymentType('Loyer');
                          setPaymentAmount(String(remainingThisMonth));
                          setActiveTab('pay');
                        }}
                        className="mt-2 px-3 py-1 bg-amber-600 text-white rounded-lg font-bold text-[11px] shadow-xs cursor-pointer"
                      >
                        Régler maintenant
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Quittances notification */}
                {payments.length > 0 && (
                  <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-blue-950 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold">Quittances de paiement disponibles</span>
                        <span className="text-[10px] text-gray-400">Récents</span>
                      </div>
                      <p className="text-gray-600 mt-1">
                        Vos {payments.length} quittance(s) de loyer officielles sont générées et prêtes à être téléchargées au format PDF avec signature.
                      </p>
                      <button
                        onClick={() => setActiveTab('history')}
                        className="mt-2 px-3 py-1 bg-blue-600 text-white rounded-lg font-bold text-[11px] shadow-xs cursor-pointer"
                      >
                        Consulter mes quittances
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Maintenance technician notification */}
                {maintenances.some(m => m.status === 'En cours' || m.assignedTechnicianName) && (
                  <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-indigo-950 flex items-start gap-3">
                    <Wrench className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold">Suivi d'intervention technique</span>
                        <span className="text-[10px] text-gray-400">En cours</span>
                      </div>
                      <p className="text-gray-600 mt-1">
                        Un technicien de maintenance a été assigné à l'un de vos signalements de réparation.
                      </p>
                      <button
                        onClick={() => setActiveTab('report')}
                        className="mt-2 px-3 py-1 bg-indigo-600 text-white rounded-lg font-bold text-[11px] shadow-xs cursor-pointer"
                      >
                        Suivre les réparations
                      </button>
                    </div>
                  </div>
                )}

                {/* Custom notifications from Firestore */}
                {notifications.map((n) => (
                  <div key={n.id} className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-start gap-3">
                    <Bell className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-gray-900">{n.title}</span>
                        <span className="text-[10px] text-gray-400">
                          {n.createdAt ? new Date(n.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''}
                        </span>
                      </div>
                      <p className="text-gray-600 mt-1">{n.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: ESPACE COMPTE (MODERNISÉ AVEC SÉCURITÉ & SUPPRESSION) */}
        {/* ======================================================== */}
        {activeTab === 'account' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Mon Compte Locataire</h2>
                <p className="text-xs text-gray-500">Coordonnées, bail et préférences</p>
              </div>
            </div>

            {/* Lease & Property Details */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" />
                Détails du Logement & Bail
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-gray-500">Adresse</p>
                  <p className="font-bold text-gray-900">{tenant.address || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" /> Date d'entrée</p>
                  <p className="font-bold text-gray-900">{new Date(tenant.entryDate || dToday).toLocaleDateString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-gray-500">Loyer mensuel</p>
                  <p className="font-bold text-indigo-700">{tenant.monthlyRent} $</p>
                </div>
                <div>
                  <p className="text-gray-500">Garantie locative</p>
                  <p className="font-bold text-emerald-700">{tenant.guaranteeAmount || 0} $</p>
                </div>
              </div>

              {contract && (
                <div className="pt-2 border-t border-gray-200 mt-2 text-xs text-gray-600 space-y-1">
                  <p><strong>Contrat :</strong> {contract.status || 'Actif'} • Du {new Date(contract.startDate || tenant.entryDate).toLocaleDateString('fr-FR')}</p>
                  {contract.attachmentUrl && (
                    <a href={contract.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 font-bold hover:underline">
                      <Download className="w-3.5 h-3.5" /> Télécharger mon contrat de bail
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Landlord Contact Info */}
            <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2 text-xs">
              <h3 className="font-bold text-indigo-950 uppercase tracking-wider text-[10px]">Contacts Gestionnaire / Bailleur</h3>
              <div className="flex flex-wrap gap-3 pt-1">
                {adminPaymentConfig?.mobileMoneyPhone && (
                  <a href={`tel:${adminPaymentConfig.mobileMoneyPhone}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-700 rounded-lg font-bold border border-indigo-200 hover:bg-indigo-50">
                    <Phone className="w-3.5 h-3.5" /> Appeler
                  </a>
                )}
                {tenant.email && (
                  <a href={`mailto:${tenant.email}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 rounded-lg font-medium border border-gray-200 hover:bg-gray-50">
                    <Mail className="w-3.5 h-3.5" /> Email
                  </a>
                )}
              </div>
            </div>

            {/* Saved Payment Coordinates */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                Coordonnées de Règlement Préférées
              </h3>
              
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fournisseur</label>
                <select 
                  value={paymentProvider} 
                  onChange={e => setPaymentProvider(e.target.value)} 
                  className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs sm:text-sm font-semibold"
                >
                  <option value="M-Pesa">M-Pesa (Vodacom)</option>
                  <option value="Orange Money">Orange Money</option>
                  <option value="Airtel Money">Airtel Money</option>
                  <option value="Carte Visa">Carte Bancaire Visa</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Numéro de Téléphone ou Numéro Visa</label>
                <input 
                  type="text" 
                  value={accountNumber} 
                  onChange={e => setAccountNumber(e.target.value)} 
                  placeholder="Ex: 0812345678" 
                  className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs sm:text-sm font-semibold"
                />
              </div>

              <button 
                onClick={() => {
                  try {
                    localStorage.setItem('tenant_paymentProvider', paymentProvider);
                    localStorage.setItem('tenant_accountNumber', accountNumber);
                    setSavedAccountSuccess(true);
                    setTimeout(() => setSavedAccountSuccess(false), 3000);
                  } catch (_e) {
                    void _e;
                  }
                }} 
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Mémoriser pour mes futurs paiements
              </button>
              {savedAccountSuccess && (
                <p className="text-xs text-emerald-600 font-bold text-center">Coordonnées sauvegardées avec succès !</p>
              )}
            </div>

            {/* Security Guarantee */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 space-y-1">
                <p className="font-bold text-slate-900">Espace Sécurisé & Intégrité des Données</p>
                <p>
                  Vos déclarations et quittances sont archivées de manière immuable. 
                  Votre bailleur ne peut pas modifier vos reçus sans votre validation.
                </p>
              </div>
            </div>

            {/* Logout and Delete Account Actions */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <button 
                onClick={async () => {
                  if (auth.currentUser) await auth.signOut();
                  navigate('/');
                }} 
                className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Se Déconnecter de l'Espace Locataire
              </button>

              <button 
                onClick={() => setShowDeleteAccountModal(true)} 
                className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer Définitivement mon Compte Locataire
              </button>
            </div>
          </div>
        )}

        {/* Modal: Delete Tenant Account Confirmation */}
        {showDeleteAccountModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 text-center">
              <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
                <Trash2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-gray-900">Supprimer votre compte ?</h3>
              <p className="text-xs text-gray-600 leading-relaxed text-justify">
                Cette action supprimera définitivement votre compte locataire et vos accès. 
                Si vous n'êtes plus lié à ce bailleur, confirmez la suppression.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteAccountModal(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold text-xs rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTenantAccount}
                  className="flex-1 py-3 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Modern Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-200 flex items-center justify-around px-1 py-2 pb-5 z-40 shadow-[0_-4px_25px_-5px_rgba(0,0,0,0.08)]">
        <button 
          onClick={() => setActiveTab('dashboard')} 
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
            activeTab === 'dashboard' ? 'text-indigo-600 font-bold scale-105' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Building2 className="w-5 h-5" />
          <span className="text-[9px] uppercase font-bold tracking-tight">Accueil</span>
        </button>

        <button 
          onClick={() => { 
            if (tenant) { 
              setPaymentType('Loyer'); 
              setPaymentAmount(String(remainingThisMonth > 0 ? remainingThisMonth : tenant.monthlyRent)); 
            } 
            setActiveTab('pay'); 
            setPaymentStep(1); 
          }} 
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
            activeTab === 'pay' ? 'text-indigo-600 font-bold scale-105' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <CreditCard className="w-5 h-5" />
          <span className="text-[9px] uppercase font-bold tracking-tight">Payer</span>
        </button>

        <button 
          onClick={() => setActiveTab('history')} 
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
            activeTab === 'history' ? 'text-indigo-600 font-bold scale-105' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[9px] uppercase font-bold tracking-tight">Reçus</span>
        </button>

        <button 
          onClick={() => setActiveTab('contract')} 
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
            activeTab === 'contract' ? 'text-indigo-600 font-bold scale-105' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <FileSignature className="w-5 h-5" />
          <span className="text-[9px] uppercase font-bold tracking-tight">Bail</span>
        </button>

        <button 
          onClick={() => setActiveTab('report')} 
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
            activeTab === 'report' ? 'text-indigo-600 font-bold scale-105' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Wrench className="w-5 h-5" />
          <span className="text-[9px] uppercase font-bold tracking-tight">Pannes</span>
        </button>

        <button 
          onClick={() => setActiveTab('notifications')} 
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all relative ${
            activeTab === 'notifications' ? 'text-indigo-600 font-bold scale-105' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <div className="relative">
            <Bell className="w-5 h-5" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-amber-500 text-white rounded-full text-[8px] font-black flex items-center justify-center">
                {notifications.length}
              </span>
            )}
          </div>
          <span className="text-[9px] uppercase font-bold tracking-tight">Alertes</span>
        </button>

        <button 
          onClick={() => setActiveTab('account')} 
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${
            activeTab === 'account' ? 'text-indigo-600 font-bold scale-105' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[9px] uppercase font-bold tracking-tight">Compte</span>
        </button>
      </div>

      {showPhoto && <PhotoModal url={showPhoto} onClose={() => setShowPhoto(null)} />}
    </div>
  );
}
