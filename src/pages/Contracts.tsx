import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { useTranslation } from 'react-i18next';
import { Plus, Search, FileText, FileSignature, Trash2, Edit, AlertTriangle, Paperclip, X, Download, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';

export function Contracts() {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
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
        toast.success('Contrat mis à jour');
      } else {
        await addDoc(collection(db, 'contracts'), {
          ...contractData,
          createdAt: new Date().toISOString()
        });
        toast.success('Contrat créé');
      }
      setShowModal(false);
    } catch (error) {
      console.error(error);
      toast.error('Erreur lors de l\'enregistrement');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce contrat ?')) {
      try {
        await deleteDoc(doc(db, 'contracts', id));
        toast.success('Contrat supprimé');
      } catch (error) {
        toast.error('Erreur lors de la suppression');
      }
    }
  };

  const getTenantName = (id: string) => tenants.find(t => t.id === id)?.name || 'Inconnu';
  const getTenantEmail = (id: string) => tenants.find(t => t.id === id)?.email || '';
  const getPropertyName = (id: string) => properties.find(p => p.id === id)?.name || 'Inconnu';

  const generateContractPDF = (contract: any) => {
    const doc = new jsPDF();
    const t = tenants.find(t => t.id === contract.tenantId);
    const p = properties.find(p => p.id === contract.propertyId);
    
    // Header
    doc.setFillColor(30, 58, 138); // Blue 900
    doc.rect(0, 0, 210, 45, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    doc.setFontSize(26);
    doc.text("CONTRAT DE BAIL À LOYER", 105, 25, { align: "center" });
    doc.setFontSize(12);
    doc.setFont("times", "normal");
    doc.text("Pour un usage d'habitation ou commercial", 105, 33, { align: "center" });
    
    // Reset colors
    doc.setTextColor(31, 41, 55);
    
    doc.setFontSize(10);
    doc.text(`Fait le : ${new Date().toLocaleDateString('fr-FR')}`, 160, 55);
    doc.text(`Réf : CTR-${contract.id.substring(0, 8).toUpperCase()}`, 20, 55);

    // Box
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(20, 65, 170, 25, 2, 2, 'FD');
    doc.setFontSize(11);
    doc.setFont("times", "italic");
    doc.text(`Il a été convenu et arrêté ce qui suit concernant le contrat de location du bien immobilier.`, 105, 78, { align: "center" });

    // Les parties
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text("ARTICLE 1 : LES PARTIES", 20, 105);
    doc.line(20, 107, 190, 107);
    
    doc.setFontSize(12);
    doc.text("Le Locataire :", 25, 117);
    doc.setFont("times", "normal");
    doc.text(`${t?.name || 'Inconnu'}`, 70, 117);
    if(t?.phone) doc.text(`Téléphone : ${t.phone}`, 70, 124);
    if(t?.email) doc.text(`Email : ${t.email}`, 70, 131);
    
    doc.setFont("times", "bold");
    let propLine = 142;
    doc.text("Le Bien Loué :", 25, propLine);
    doc.setFont("times", "normal");
    doc.text(`${p?.name || 'Inconnu'}`, 70, propLine);
    if(p?.address) doc.text(`Adresse : ${p.address}`, 70, propLine + 7);
    if(p?.housingType) doc.text(`Type : ${p.housingType}`, 70, propLine + 14);

    // Termes Financiers
    let finLine = propLine + 30;
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text("ARTICLE 2 : TERMES FINANCIERS", 20, finLine);
    doc.line(20, finLine + 2, 190, finLine + 2);

    doc.setFontSize(12);
    doc.setFont("times", "normal");
    doc.text("Le loyer mensuel convenu est fixé à :", 25, finLine + 14);
    doc.setFont("times", "bold");
    doc.text(`${contract.rentAmount} $`, 100, finLine + 14);
    
    doc.setFont("times", "normal");
    doc.text("Le montant de la garantie locative est de :", 25, finLine + 24);
    doc.setFont("times", "bold");
    doc.text(`${contract.depositAmount} $`, 100, finLine + 24);

    // Durée
    let durLine = finLine + 40;
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text("ARTICLE 3 : DURÉE DU BAIL", 20, durLine);
    doc.line(20, durLine + 2, 190, durLine + 2);

    doc.setFontSize(12);
    doc.setFont("times", "normal");
    doc.text(`Ce bail est consenti pour la période du : ${new Date(contract.startDate).toLocaleDateString('fr-FR')} au ${contract.endDate ? new Date(contract.endDate).toLocaleDateString('fr-FR') : 'Durée indéterminée'}.`, 25, durLine + 12);
    doc.text(`Le statut actuel de ce contrat est : ${contract.status}.`, 25, durLine + 19);

    // Clauses
    let yPos = durLine + 35;
    if (contract.clauses) {
      if (yPos > 240) { doc.addPage(); yPos = 30; }
      doc.setFont("times", "bold");
      doc.setFontSize(14);
      doc.text("ARTICLE 4 : CLAUSES PARTICULIÈRES", 20, yPos);
      doc.line(20, yPos + 2, 190, yPos + 2);
      
      doc.setFontSize(11);
      doc.setFont("times", "normal");
      
      const splitClauses = doc.splitTextToSize(contract.clauses, 160);
      doc.text(splitClauses, 25, yPos + 12);
      yPos += 12 + (splitClauses.length * 5);
    }
    
    // Signatures Area
    if (yPos > 210) { doc.addPage(); yPos = 40; }
    else { yPos += 20; }
    
    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    
    doc.setFontSize(12);
    doc.setFont("times", "bold");
    doc.text("Lu et approuvé,", 20, yPos + 10);
    
    doc.text("Signature du Bailleur", 30, yPos + 25);
    doc.text("Signature du Locataire", 140, yPos + 25);
    
    doc.roundedRect(20, yPos + 35, 70, 30, 2, 2);
    doc.roundedRect(120, yPos + 35, 70, 30, 2, 2);

    doc.setFont("times", "normal");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text("Document généré automatiquement.", 105, 285, { align: "center" });

    doc.save(`Contrat_${t?.name?.replace(/\s+/g, '_') || 'Bail'}.pdf`);
  };

  const filteredContracts = contracts.filter(c => {
    const tName = getTenantName(c.tenantId).toLowerCase();
    const pName = getPropertyName(c.propertyId).toLowerCase();
    const search = searchTerm.toLowerCase();
    return tName.includes(search) || pName.includes(search);
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Actif': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Expiré': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'Résilié': return 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300';
      default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const checkExpirationAlert = (endDateStr: string | null, status: string) => {
    if (status !== 'Actif' || !endDateStr) return null;
    const end = new Date(endDateStr);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return <span className="flex items-center text-xs font-medium text-red-600 dark:text-red-400 mt-1"><AlertTriangle className="w-3 h-3 mr-1" /> Expiré</span>;
    } else if (diffDays <= 30) {
      return <span className="flex items-center text-xs font-medium text-amber-600 dark:text-amber-400 mt-1"><AlertTriangle className="w-3 h-3 mr-1" /> Expire dans {diffDays} jours</span>;
    }
    return null;
  };

  if (loading) return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contrats de location</h1>
          <p className="text-gray-500 dark:text-gray-400">Gérez vos baux et documents importants.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" />
          Nouveau
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Rechercher par locataire ou propriété..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border-none rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 transition text-gray-900 dark:text-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredContracts.map(contract => (
          <div key={contract.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex flex-col transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3 cursor-pointer group flex-1" onClick={() => setViewingContract(contract)}>
                {tenants.find(t => t.id === contract.tenantId)?.photoUrl ? (
                  <img src={tenants.find(t => t.id === contract.tenantId)?.photoUrl} alt="Locataire" className="w-10 h-10 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-100 group-hover:bg-blue-200 dark:bg-blue-900/30 dark:group-hover:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 transition-colors">
                    <FileSignature className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {getTenantName(contract.tenantId)}
                  </h3>
                  <p className="text-xs text-gray-500 mb-0.5">{getTenantEmail(contract.tenantId)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{getPropertyName(contract.propertyId)}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(contract.status)}`}>
                  {contract.status}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleOpenModal(contract); }}
                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition"
                  title="Modifier"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div onClick={() => setViewingContract(contract)} className="cursor-pointer space-y-3 flex-grow group">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Début</p>
                  <p className="font-medium text-gray-900 dark:text-white">{new Date(contract.startDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Fin</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {contract.endDate ? new Date(contract.endDate).toLocaleDateString() : 'Indéterminée'}
                  </p>
                  {checkExpirationAlert(contract.endDate, contract.status)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Loyer</p>
                  <p className="font-medium text-gray-900 dark:text-white">{contract.rentAmount} $</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Garantie</p>
                  <p className="font-medium text-gray-900 dark:text-white">{contract.depositAmount} $</p>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <div className="flex gap-2">
                {contract.attachmentUrl && (
                  <a 
                    href={contract.attachmentUrl} 
                    download="Contrat.pdf"
                    target="_blank" 
                    rel="noreferrer"
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition"
                    title="Pièce jointe originale"
                  >
                    <FileText className="w-5 h-5" />
                  </a>
                )}
                <button
                  onClick={() => generateContractPDF(contract)}
                  className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition"
                  title="Télécharger PDF du contrat"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDelete(contract.id)}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredContracts.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-500 dark:text-gray-400">
            Aucun contrat trouvé.
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full my-8 p-6 shadow-xl relative text-gray-900 dark:text-white">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold mb-6">
              {editingId ? 'Modifier le contrat' : 'Nouveau contrat'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium mb-1">Locataire *</label>
                  <select
                    required
                    value={formData.tenantId}
                    onChange={e => setFormData({ ...formData, tenantId: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
                  >
                    <option value="">Sélectionner un locataire</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Propriété *</label>
                  <select
                    required
                    value={formData.propertyId}
                    onChange={e => setFormData({ ...formData, propertyId: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
                  >
                    <option value="">Sélectionner une propriété</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Date de début *</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date de fin (optionnel)</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Montant du loyer ($) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={Number.isNaN(formData.rentAmount) ? '' : formData.rentAmount}
                    onChange={e => setFormData({ ...formData, rentAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Montant de la garantie ($) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={Number.isNaN(formData.depositAmount) ? '' : formData.depositAmount}
                    onChange={e => setFormData({ ...formData, depositAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Statut *</label>
                <select
                  required
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
                >
                  <option value="Actif">Actif</option>
                  <option value="Expiré">Expiré</option>
                  <option value="Résilié">Résilié</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Clauses spécifiques</label>
                <textarea
                  rows={3}
                  value={formData.clauses}
                  onChange={e => setFormData({ ...formData, clauses: e.target.value })}
                  placeholder="Notes, conditions particulières..."
                  className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Pièce jointe (PDF ou Image, max 800KB)</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                    <Paperclip className="w-4 h-4" />
                    Choisir un fichier
                    <input type="file" accept=".pdf,image/*" onChange={handleFileChange} className="hidden" />
                  </label>
                  {formData.attachmentUrl && (
                    <span className="text-sm text-green-600 dark:text-green-400 font-medium">Fichier joint avec succès</span>
                  )}
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 shadow-md transition"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingContract && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl max-w-2xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Détails du contrat</h2>
              <button onClick={() => setViewingContract(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-4">
                  {tenants.find(t => t.id === viewingContract.tenantId)?.photoUrl && (
                    <img src={tenants.find(t => t.id === viewingContract.tenantId)?.photoUrl} alt="Locataire" className="w-12 h-12 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                  )}
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Locataire</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{getTenantName(viewingContract.tenantId)}</p>
                    {getTenantEmail(viewingContract.tenantId) && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{getTenantEmail(viewingContract.tenantId)}</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Bien immobilier</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{getPropertyName(viewingContract.propertyId)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Période du bail</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {new Date(viewingContract.startDate).toLocaleDateString()} - {viewingContract.endDate ? new Date(viewingContract.endDate).toLocaleDateString() : 'Indéterminée'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Statut</p>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(viewingContract.status)}`}>
                    {viewingContract.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 p-6 border border-gray-100 dark:border-gray-700 rounded-2xl">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Loyer Mensuel</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{viewingContract.rentAmount} $</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Garantie Payée</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{viewingContract.depositAmount} $</p>
                </div>
              </div>

              {viewingContract.clauses && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-400" />
                    Clauses Spécifiques
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{viewingContract.clauses}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => generateContractPDF(viewingContract)}
                  className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition flex justify-center items-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Télécharger le contrat
                </button>
                {viewingContract.attachmentUrl && (
                  <a 
                    href={viewingContract.attachmentUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="w-full sm:w-auto px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl font-medium transition flex justify-center items-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    Voir document original
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
