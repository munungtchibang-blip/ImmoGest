import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  FileSignature, 
  Trash2, 
  Edit, 
  Download, 
  Sparkles, 
  X,
  Building2, 
  ChevronRight,
  FileCheck2
} from 'lucide-react';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import { useSubscription } from '../context/SubscriptionContext';

export function Contracts() {
  const { subscription, openSubscriptionModal } = useSubscription();
  const [nowTimestamp] = useState(() => Date.now());
  const [contracts, setContracts] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'Tous' | 'Actif' | 'En attente' | 'Expiré' | 'Résilié'>('Tous');
  
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingContract, setViewingContract] = useState<any | null>(null);
  
  const [formData, setFormData] = useState({
    tenantId: '',
    propertyId: '',
    startDate: '',
    endDate: '',
    rentAmount: 0,
    depositAmount: 0,
    clauses: '',
    status: 'Actif',
    attachmentUrl: ''
  });

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    // Fetch tenants
    getDocs(query(collection(db, 'tenants'), where('landlordId', '==', uid))).then(snap => {
      setTenants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch properties
    getDocs(query(collection(db, 'properties'), where('landlordId', '==', uid))).then(snap => {
      setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Sub contracts
    const q = query(collection(db, 'contracts'), where('landlordId', '==', uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContracts(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contracts');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenModal = (contract?: any) => {
    if (contract) {
      setFormData({
        tenantId: contract.tenantId || '',
        propertyId: contract.propertyId || '',
        startDate: contract.startDate ? contract.startDate.substring(0,10) : '',
        endDate: contract.endDate ? contract.endDate.substring(0,10) : '',
        rentAmount: contract.rentAmount || 0,
        depositAmount: contract.depositAmount || 0,
        clauses: contract.clauses || '',
        status: contract.status || 'Actif',
        attachmentUrl: contract.attachmentUrl || ''
      });
      setEditingId(contract.id);
    } else {
      setFormData({
        tenantId: '',
        propertyId: '',
        startDate: new Date().toISOString().substring(0,10),
        endDate: '',
        rentAmount: 0,
        depositAmount: 0,
        clauses: '',
        status: 'Actif',
        attachmentUrl: ''
      });
      setEditingId(null);
    }
    setShowModal(true);
  };

  const applyProLegalTemplate = () => {
    const templateClauses = 
`1. DESTINATION : Le bien est exclusivement destiné à l'usage d'habitation. Toute transformation ou sous-location sans accord préalable écrit du bailleur est formellement interdite.
2. PAIEMENT DU LOYER : Le loyer convenu est payable au plus tard le 5 de chaque mois entamé, par Mobile Money ou virement bancaire officiel.
3. GARANTIE LOCATIVE : La garantie ne peut en aucun cas servir au paiement des derniers mois de loyer. Elle est remboursée en fin de bail après état des lieux de sortie contradictoire.
4. CHARGES COMMUNES : Les consommations d'eau, d'électricité et frais syndics sont à la charge exclusive du preneur selon les relevés de compteurs.
5. PRÉAVIS : En cas de résiliation, un préavis écrit de 3 mois doit être notifié par l'une ou l'autre des parties conformément à la législation sur les baux à loyer.`;

    setFormData(prev => ({
      ...prev,
      clauses: templateClauses
    }));
    toast.success("Modèle juridique conforme OHADA/RDC inséré avec succès !");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      toast.error('Le fichier est trop volumineux (max 800KB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setFormData({ ...formData, attachmentUrl: event.target.result as string });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    try {
      const contractData = {
        landlordId: auth.currentUser.uid,
        tenantId: formData.tenantId,
        propertyId: formData.propertyId,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
        rentAmount: Number(formData.rentAmount),
        depositAmount: Number(formData.depositAmount),
        clauses: formData.clauses || null,
        status: formData.status,
        attachmentUrl: formData.attachmentUrl || null,
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        const ref = doc(db, 'contracts', editingId);
        await updateDoc(ref, contractData);
        toast.success('Contrat mis à jour avec succès');
      } else {
        await addDoc(collection(db, 'contracts'), {
          ...contractData,
          createdAt: new Date().toISOString()
        });
        toast.success('Nouveau contrat enregistré');
      }
      setShowModal(false);
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer définitivement ce contrat ?')) {
      try {
        await deleteDoc(doc(db, 'contracts', id));
        toast.success('Contrat supprimé');
      } catch {
        toast.error('Erreur lors de la suppression');
      }
    }
  };

  const getTenantName = (id: string) => tenants.find(t => t.id === id)?.name || 'Locataire';
  const getTenantEmail = (id: string) => tenants.find(t => t.id === id)?.email || '';
  const getPropertyName = (id: string) => properties.find(p => p.id === id)?.name || 'Bien immobilier';

  const generateContractPDF = (contract: any) => {
    const doc = new jsPDF();
    const t = tenants.find(t => t.id === contract.tenantId);
    const p = properties.find(p => p.id === contract.propertyId);
    
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, 210, 45, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    doc.setFontSize(24);
    doc.text("CONTRAT DE BAIL À LOYER", 105, 25, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("times", "normal");
    doc.text("Conforme à la législation régissant les baux d'habitation", 105, 33, { align: "center" });
    
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(10);
    doc.text(`Fait le : ${new Date().toLocaleDateString('fr-FR')}`, 155, 55);
    doc.text(`Réf : CTR-${contract.id.substring(0, 8).toUpperCase()}`, 20, 55);

    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(20, 62, 170, 22, 2, 2, 'FD');
    doc.setFontSize(10);
    doc.setFont("times", "italic");
    doc.text(`Convention légale établie entre le bailleur et le preneur pour l'occupation paisible du bien.`, 105, 75, { align: "center" });

    // Parties
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text("ARTICLE 1 : DESIGNATION DES PARTIES", 20, 100);
    doc.line(20, 102, 190, 102);
    
    doc.setFontSize(11);
    doc.text("Le Locataire (Preneur) :", 25, 112);
    doc.setFont("times", "normal");
    doc.text(`${t?.name || 'Inconnu'}`, 80, 112);
    if (t?.phone) doc.text(`Téléphone : ${t.phone}`, 80, 119);
    if (t?.email) doc.text(`Email : ${t.email}`, 80, 126);
    
    doc.setFont("times", "bold");
    const propLine = 138;
    doc.text("Le Bien Loué :", 25, propLine);
    doc.setFont("times", "normal");
    doc.text(`${p?.name || 'Non spécifié'}`, 80, propLine);
    if (p?.address) doc.text(`Adresse : ${p.address}`, 80, propLine + 7);
    if (p?.type) doc.text(`Catégorie : ${p.type}`, 80, propLine + 14);

    // Termes Financiers
    const finLine = propLine + 28;
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text("ARTICLE 2 : CONDITIONS FINANCIERES", 20, finLine);
    doc.line(20, finLine + 2, 190, finLine + 2);

    doc.setFontSize(11);
    doc.setFont("times", "normal");
    doc.text("Loyer mensuel convenu :", 25, finLine + 12);
    doc.setFont("times", "bold");
    doc.text(`${contract.rentAmount} $ US`, 100, finLine + 12);
    
    doc.setFont("times", "normal");
    doc.text("Garantie locative (Caution) :", 25, finLine + 20);
    doc.setFont("times", "bold");
    doc.text(`${contract.depositAmount} $ US`, 100, finLine + 20);

    // Durée
    const durLine = finLine + 34;
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text("ARTICLE 3 : DURÉE & ENTREE EN VIGUEUR", 20, durLine);
    doc.line(20, durLine + 2, 190, durLine + 2);

    doc.setFontSize(11);
    doc.setFont("times", "normal");
    doc.text(`Prise d'effet le : ${new Date(contract.startDate).toLocaleDateString('fr-FR')}`, 25, durLine + 12);
    doc.text(`Échéance : ${contract.endDate ? new Date(contract.endDate).toLocaleDateString('fr-FR') : 'Durée indéterminée'}`, 25, durLine + 19);

    if (contract.clauses) {
      const clauseLine = durLine + 32;
      doc.setFont("times", "bold");
      doc.setFontSize(13);
      doc.text("ARTICLE 4 : CLAUSES & ENGAGEMENTS SPECIFIQUES", 20, clauseLine);
      doc.line(20, clauseLine + 2, 190, clauseLine + 2);

      doc.setFontSize(10);
      doc.setFont("times", "normal");
      const splitClauses = doc.splitTextToSize(contract.clauses, 165);
      doc.text(splitClauses, 25, clauseLine + 10);
    }

    doc.save(`contrat_bail_${t?.name || 'locataire'}_${contract.id.substring(0, 6)}.pdf`);
    toast.success("Contrat PDF généré avec succès");
  };

  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      const tenant = tenants.find(t => t.id === c.tenantId);
      const prop = properties.find(p => p.id === c.propertyId);
      const tenantName = tenant?.name || 'Locataire';
      const propertyName = prop?.name || 'Bien immobilier';
      const matchesSearch = 
        tenantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        propertyName.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;
      if (selectedFilter === 'Tous') return true;
      return c.status === selectedFilter;
    });
  }, [contracts, searchTerm, selectedFilter, tenants, properties]);

  const stats = useMemo(() => {
    const total = contracts.length;
    const active = contracts.filter(c => c.status === 'Actif').length;
    const expiringSoon = contracts.filter(c => {
      if (c.status !== 'Actif' || !c.endDate) return false;
      const end = new Date(c.endDate).getTime();
      const diffDays = Math.ceil((end - nowTimestamp) / (1000 * 3600 * 24));
      return diffDays > 0 && diffDays <= 30;
    }).length;
    const totalVolume = contracts.reduce((sum, c) => sum + Number(c.rentAmount || 0), 0);
    return { total, active, expiringSoon, totalVolume };
  }, [contracts, nowTimestamp]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Actif': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
      case 'En attente': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
      case 'Expiré': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300';
      case 'Résilié': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contrats de Location</h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              {contracts.length} baux
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5">
            Gérez vos engagements légaux, baux locatifs et quittances certifiées.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/terminations"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all border border-indigo-200 dark:border-indigo-800 shadow-xs"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Préavis & Résiliations</span>
          </Link>

          <button
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Contrat</span>
          </button>
        </div>
      </div>

      {/* PRO SUBSCRIPTION RECOMMENDATION BANNER FOR CONTRACTS (Requested by User) */}
      {subscription.tierId !== 'pro' && subscription.tierId !== 'vip' && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white shadow-md relative overflow-hidden border border-indigo-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 z-10">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-400/30">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400 text-gray-950">
                  Recommandation Forfait Pro
                </span>
                <span className="text-xs text-indigo-200">Baux Sécurisés & Modèles Avancés</span>
              </div>
              <p className="text-sm font-bold text-white">
                Passez à l'Abonnement Pro pour vos Contrats
              </p>
              <p className="text-xs text-indigo-100/90 max-w-xl leading-relaxed">
                Débloquez la génération automatique de contrats de bail conformes au droit congolais (OHADA), la signature électronique infalsifiable et l'archivage numérique sécurisé illimité.
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

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-xs border border-gray-100 dark:border-gray-700/80">
          <span className="text-[10px] uppercase font-bold text-gray-400">Total Baux</span>
          <p className="text-xl font-black text-gray-900 dark:text-white mt-1">{stats.total}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-xs border border-gray-100 dark:border-gray-700/80">
          <span className="text-[10px] uppercase font-bold text-emerald-600">Actifs</span>
          <p className="text-xl font-black text-emerald-600 mt-1">{stats.active}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-xs border border-gray-100 dark:border-gray-700/80">
          <span className="text-[10px] uppercase font-bold text-amber-500">Expirent sous 30j</span>
          <p className="text-xl font-black text-amber-600 mt-1">{stats.expiringSoon}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-xs border border-gray-100 dark:border-gray-700/80">
          <span className="text-[10px] uppercase font-bold text-blue-600">Volume Loyers</span>
          <p className="text-xl font-black text-blue-600 mt-1">{stats.totalVolume.toLocaleString()} $</p>
        </div>
      </div>

      {/* Search & Filter Chips */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Rechercher par locataire ou bien immobilier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs sm:text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500 transition"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['Tous', 'Actif', 'En attente', 'Expiré', 'Résilié'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setSelectedFilter(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedFilter === tab
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Contract Cards Grid */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
        </div>
      ) : filteredContracts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-100 dark:border-gray-700 text-center space-y-3">
          <FileSignature className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto" />
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Aucun contrat ne correspond à votre recherche.</p>
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-xl text-xs font-bold"
          >
            <Plus className="w-4 h-4" /> Enregistrer un premier contrat
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContracts.map(contract => (
            <div
              key={contract.id}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 p-4 flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-500 transition-all group"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm shrink-0">
                      {getTenantName(contract.tenantId).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                        {getTenantName(contract.tenantId)}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                        <Building2 className="w-3 h-3 shrink-0" />
                        {getPropertyName(contract.propertyId)}
                      </p>
                    </div>
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${getStatusColor(contract.status)}`}>
                    {contract.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 bg-gray-50 dark:bg-gray-700/40 rounded-xl text-xs mb-3">
                  <div>
                    <span className="text-gray-400 text-[10px] uppercase font-bold">Loyer</span>
                    <p className="font-bold text-blue-600 dark:text-blue-400 text-sm">{contract.rentAmount} $</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] uppercase font-bold">Garantie</span>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{contract.depositAmount} $</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] uppercase font-bold">Prise d'effet</span>
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      {new Date(contract.startDate).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] uppercase font-bold">Fin de bail</span>
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      {contract.endDate ? new Date(contract.endDate).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : 'Indéterminée'}
                    </p>
                  </div>
                </div>

                {contract.clauses && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 italic mb-3">
                    "{contract.clauses}"
                  </p>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-700/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => setViewingContract(contract)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
                >
                  Détails
                </button>

                <div className="flex items-center gap-1.5">
                  <Link
                    to="/terminations"
                    className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors cursor-pointer"
                    title="Gérer le préavis ou la résiliation"
                  >
                    <FileCheck2 className="w-4 h-4" />
                  </Link>

                  <button
                    onClick={() => generateContractPDF(contract)}
                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors cursor-pointer"
                    title="Télécharger PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleOpenModal(contract)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors cursor-pointer"
                    title="Modifier"
                  >
                    <Edit className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(contract.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal with Pro Legal Clauses Insertion */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/10 dark:bg-black/20 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 max-w-lg w-full p-6 space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingId ? 'Modifier le Contrat de Bail' : 'Nouveau Contrat de Bail'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Locataire</label>
                <select
                  required
                  value={formData.tenantId}
                  onChange={e => {
                    const sel = tenants.find(t => t.id === e.target.value);
                    setFormData({
                      ...formData,
                      tenantId: e.target.value,
                      propertyId: sel?.propertyId || formData.propertyId,
                      rentAmount: sel?.monthlyRent || formData.rentAmount,
                      depositAmount: sel?.guaranteeAmount || formData.depositAmount
                    });
                  }}
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs sm:text-sm font-semibold outline-none"
                >
                  <option value="">Sélectionner un locataire...</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.monthlyRent} $/mois)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Bien Immobilier</label>
                <select
                  required
                  value={formData.propertyId}
                  onChange={e => setFormData({...formData, propertyId: e.target.value})}
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs sm:text-sm font-semibold outline-none"
                >
                  <option value="">Sélectionner le bien loué...</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Loyer ($)</label>
                  <input
                    required
                    type="number"
                    value={formData.rentAmount}
                    onChange={e => setFormData({...formData, rentAmount: Number(e.target.value)})}
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs sm:text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Garantie ($)</label>
                  <input
                    required
                    type="number"
                    value={formData.depositAmount}
                    onChange={e => setFormData({...formData, depositAmount: Number(e.target.value)})}
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs sm:text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Date d'effet</label>
                  <input
                    required
                    type="date"
                    value={formData.startDate}
                    onChange={e => setFormData({...formData, startDate: e.target.value})}
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs sm:text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Date de fin</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={e => setFormData({...formData, endDate: e.target.value})}
                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs sm:text-sm font-medium"
                  />
                </div>
              </div>

              {/* Clauses with PRO Button */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Clauses & Engagements Spécifiques
                  </label>
                  <button
                    type="button"
                    onClick={applyProLegalTemplate}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Insérer modèle type Pro
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={formData.clauses}
                  onChange={e => setFormData({...formData, clauses: e.target.value})}
                  placeholder="Clauses particulières, usage, entretien..."
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Statut du Bail</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value})}
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs sm:text-sm font-semibold"
                >
                  <option value="Actif">Actif</option>
                  <option value="En attente">En attente de signature</option>
                  <option value="Expiré">Expiré</option>
                  <option value="Résilié">Résilié</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Pièce Jointe Scannée (optionnel)</label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleFileChange}
                  className="w-full text-xs text-gray-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md"
                >
                  {editingId ? 'Mettre à jour' : 'Créer le contrat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Contract Modal */}
      {viewingContract && (
        <div className="fixed inset-0 bg-slate-900/10 dark:bg-black/20 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 max-w-lg w-full p-6 space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Détails du Contrat</h2>
              <button onClick={() => setViewingContract(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl space-y-1">
                <p className="text-gray-400 text-xs">Locataire</p>
                <p className="font-bold text-gray-900 dark:text-white text-base">{getTenantName(viewingContract.tenantId)}</p>
                <p className="text-gray-500">{getTenantEmail(viewingContract.tenantId)}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">Loyer Mensuel</span>
                  <p className="font-black text-blue-600 text-base">{viewingContract.rentAmount} $</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">Garantie Payée</span>
                  <p className="font-black text-emerald-600 text-base">{viewingContract.depositAmount} $</p>
                </div>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl">
                <span className="text-gray-400 text-[10px] uppercase font-bold">Bien loué</span>
                <p className="font-bold text-gray-900 dark:text-white">{getPropertyName(viewingContract.propertyId)}</p>
              </div>

              {viewingContract.clauses && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl space-y-1">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">Clauses particulières</span>
                  <p className="text-gray-700 dark:text-gray-300 text-xs leading-relaxed whitespace-pre-wrap">{viewingContract.clauses}</p>
                </div>
              )}

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => generateContractPDF(viewingContract)}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> Télécharger en PDF
                </button>
                <button
                  type="button"
                  onClick={() => setViewingContract(null)}
                  className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-xl"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
