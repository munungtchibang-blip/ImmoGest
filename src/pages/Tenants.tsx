import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  User, 
  MapPin, 
  Phone, 
  ArrowLeft, 
  Trash2, 
  Sparkles, 
  Lock, 
  MessageCircle, 
  Mail, 
  Copy, 
  Check, 
  ShieldCheck,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { useSubscription } from '../context/SubscriptionContext';

interface TenantDispatchInfo {
  tenantId: string;
  name: string;
  phone: string;
  email: string;
}

export function Tenants() {
  const { subscription, openSubscriptionModal } = useSubscription();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [tenantToDelete, setTenantToDelete] = useState<string | null>(null);
  const [tenantDispatch, setTenantDispatch] = useState<TenantDispatchInfo | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'tenants'), where('landlordId', '==', auth.currentUser.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setTenants(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tenants');
    });
    return () => unsub();
  }, []);

  const handleDelete = async () => {
    if (!tenantToDelete) return;
    setLoading(true);
    try {
      // 1. Delete payments related to this tenant
      const qPayments = query(collection(db, 'payments'), where('tenantId', '==', tenantToDelete));
      const paySnap = await getDocs(qPayments);
      await Promise.all(paySnap.docs.map(d => deleteDoc(doc(db, 'payments', d.id))));

      // 2. Delete maintenance related to this tenant
      const qMaintenance = query(collection(db, 'maintenance'), where('tenantId', '==', tenantToDelete));
      const maintSnap = await getDocs(qMaintenance);
      await Promise.all(maintSnap.docs.map(d => deleteDoc(doc(db, 'maintenance', d.id))));

      // 3. Delete contracts
      const qContracts = query(collection(db, 'contracts'), where('tenantId', '==', tenantToDelete));
      const contractSnap = await getDocs(qContracts);
      await Promise.all(contractSnap.docs.map(d => deleteDoc(doc(db, 'contracts', d.id))));

      // 4. Delete expenses
      const qExpenses = query(collection(db, 'expenses'), where('tenantId', '==', tenantToDelete));
      const expSnap = await getDocs(qExpenses);
      await Promise.all(expSnap.docs.map(d => deleteDoc(doc(db, 'expenses', d.id))));

      // 5. Delete payment proofs
      const qProofs = query(collection(db, 'paymentProofs'), where('tenantId', '==', tenantToDelete));
      const proofSnap = await getDocs(qProofs);
      await Promise.all(proofSnap.docs.map(d => deleteDoc(doc(db, 'paymentProofs', d.id))));

      // 6. Delete termination procedures
      const qTerm = query(collection(db, 'termination_procedures'), where('tenantId', '==', tenantToDelete));
      const termSnap = await getDocs(qTerm);
      await Promise.all(termSnap.docs.map(d => deleteDoc(doc(db, 'termination_procedures', d.id))));

      // 7. Delete tenant user account in users collection
      const qUsers = query(collection(db, 'users'), where('tenantId', '==', tenantToDelete));
      const usersSnap = await getDocs(qUsers);
      await Promise.all(usersSnap.docs.map(d => deleteDoc(doc(db, 'users', d.id))));

      // 8. Delete the tenant record itself
      await deleteDoc(doc(db, 'tenants', tenantToDelete));
      toast.success('Locataire, compte utilisateur et données associés supprimés avec succès.');
      
      setTenantToDelete(null);
    } catch (error) {
      console.error("Error deleting tenant cascade", error);
      toast.error("Erreur lors de la suppression.");
    } finally {
      setLoading(false);
    }
  };

  // Rule check: 2 or more tenants require Pro
  const isLimitReached = tenants.length >= 2 && subscription.tierId !== 'pro' && subscription.tierId !== 'vip';

  const handleAddTenantClick = () => {
    if (isLimitReached) {
      toast.error("Limite atteinte (2 locataires). Veuillez passer à l'abonnement Pro (29 $/mois) pour ajouter d'autres locataires.");
      openSubscriptionModal('pro');
      return;
    }
    setShowAddForm(true);
  };

  const uniqueCategories = Array.from(new Set(tenants.map(t => t.housingType).filter(Boolean)));

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = 
      (t.name?.toLowerCase() || '').includes(search.toLowerCase()) || 
      (t.address?.toLowerCase() || '').includes(search.toLowerCase());
      
    const matchesFilter = filterType === 'All' || t.housingType === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-5">
      <Link to="/" className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-xs border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium text-xs sm:text-sm">
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" /> Retour au tableau de bord
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">Locataires</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              {tenants.length} actif{tenants.length > 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5 transition-colors">
            Gérez vos locataires, contrats et accès aux quittances.
          </p>
        </div>

        <button
          onClick={handleAddTenantClick}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nouveau Locataire
        </button>
      </div>

      {/* Pro Warning Banner if reached 2 tenants */}
      {isLimitReached && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-950 dark:text-amber-200">
                Limite de 2 locataires atteinte sur votre forfait {subscription.tierId}
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Passez à l'abonnement Professionnel (Recommandé) pour enregistrer un nombre illimité de locataires et biens.
              </p>
            </div>
          </div>
          <button
            onClick={() => openSubscriptionModal('pro')}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Débloquer Pro
          </button>
        </div>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Rechercher par nom, adresse ou téléphone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-xs sm:text-sm text-gray-900 dark:text-white"
          />
        </div>
        
        {uniqueCategories.length > 0 && (
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs sm:text-sm text-gray-900 dark:text-white transition-colors min-w-[140px]"
          >
            <option value="All">Tous les types</option>
            {uniqueCategories.map(cat => (
              <option key={cat as string} value={cat as string}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      {/* Compact List Layout (Takes less vertical space) */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredTenants.map(tenant => (
            <div
              key={tenant.id}
              className="bg-white dark:bg-gray-800 p-3.5 sm:p-4 rounded-xl shadow-xs border border-gray-100 dark:border-gray-700/80 hover:border-blue-300 dark:hover:border-blue-600 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group relative"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                {tenant.photoUrl ? (
                  <img
                    src={tenant.photoUrl}
                    alt={tenant.name}
                    className="w-11 h-11 rounded-full object-cover shrink-0 border border-gray-200 dark:border-gray-700"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 font-bold text-sm">
                    {tenant.name?.charAt(0)?.toUpperCase() || <User className="w-5 h-5" />}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/tenants/${tenant.id}`}
                      state={{ tenant }}
                      className="text-sm font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                    >
                      {tenant.name}
                    </Link>
                    {tenant.housingType && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {tenant.housingType}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      tenant.guaranteeStatus === 'Payée' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                      tenant.guaranteeStatus === 'Partielle' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                    }`}>
                      Garantie {tenant.guaranteeStatus || 'Non payée'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span className="flex items-center gap-1 truncate max-w-[220px]">
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                      {tenant.address || 'Adresse non renseignée'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                      {tenant.phone}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price & Actions */}
              <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-700/60">
                <div className="text-left sm:text-right">
                  <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                    {tenant.monthlyRent} $
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium"> / mois</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <a
                    href={`https://wa.me/${tenant.phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Bonjour ${tenant.name}, voici un message de votre bailleur concernant votre bail ImmoGest.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                    title="Contacter sur WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>

                  <Link
                    to={`/tenants/${tenant.id}`}
                    state={{ tenant }}
                    className="px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800/60 transition-colors"
                  >
                    Détails
                  </Link>

                  <button 
                    onClick={() => setTenantToDelete(tenant.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    title="Supprimer le locataire"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredTenants.length === 0 && !loading && (
            <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 border-dashed">
              <User className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Aucun locataire trouvé.</p>
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <AddTenantModal
          onClose={() => setShowAddForm(false)}
          allTenants={tenants}
          onSuccess={(dispatchInfo) => {
            setShowAddForm(false);
            setTenantDispatch(dispatchInfo);
          }}
        />
      )}

      {/* Tenant Access Dispatch Modal (WhatsApp / Email auto link sharing) */}
      {tenantDispatch && (
        <TenantAccessDispatchModal
          info={tenantDispatch}
          onClose={() => setTenantDispatch(null)}
        />
      )}

      {tenantToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Supprimer le locataire</h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-6">
              Êtes-vous sûr de vouloir supprimer ce locataire ? Cette action est irréversible et supprimera également l'accès à son historique.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setTenantToDelete(null)} className="flex-1 py-2 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs sm:text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Annuler
              </button>
              <button onClick={handleDelete} className="flex-1 py-2 px-4 bg-red-600 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-red-700 transition-colors">
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Modal to automatically dispatch portal link to tenant via WhatsApp or Email
 * Enforces rule: Landlord does NOT tamper with tenant space directly.
 */
function TenantAccessDispatchModal({ info, onClose }: { info: TenantDispatchInfo; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const portalUrl = `${window.location.origin}/pay/${info.tenantId}`;
  const cleanPhone = info.phone.replace(/[^0-9]/g, '');

  const whatsappMessage = `Bonjour ${info.name},\nVotre bailleur vous a enregistré sur la plateforme ImmoGest.\nVoici votre lien d'accès exclusif et sécurisé pour consulter vos loyers, télécharger vos quittances officielles PDF et suivre vos paiements :\n${portalUrl}\nConservez bien ce lien.`;

  const mailSubject = `Votre espace locataire sécurisé ImmoGest - ${info.name}`;
  const mailBody = `Bonjour ${info.name},\n\nVotre bailleur a créé votre dossier locataire sur ImmoGest.\n\nVous pouvez désormais accéder à votre espace personnel sécurisé en cliquant sur le lien suivant :\n${portalUrl}\n\nDans cet espace vous pourrez :\n- Vérifier l'état de votre loyer\n- Télécharger vos reçus et quittances officielles de paiement en 1 clic\n- Transmettre vos preuves de paiement\n\nBien cordialement,\nImmoGest`;

  const handleCopy = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    toast.success("Lien de l'espace locataire copié !");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsApp = () => {
    const directUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessage)}`;
    window.open(directUrl, '_blank');
  };

  const handleGmail = () => {
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(info.email)}&su=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;
    window.open(gmailUrl, '_blank');
  };

  const handleDefaultMail = () => {
    window.location.href = `mailto:${info.email}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-7 border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-base">
                Espace Locataire Activé !
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Lien personnel pour {info.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Rule Note */}
        <div className="my-4 p-3.5 bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <p>
            <strong>Confidentialité garantie :</strong> Seul le locataire peut se connecter avec ce lien. Le bailleur ne peut pas accéder à l'espace locataire, et le locataire ne peut pas accéder à l'espace bailleur.
          </p>
        </div>

        {/* Portal URL box */}
        <div className="bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 mb-5">
          <input
            type="text"
            readOnly
            value={portalUrl}
            className="bg-transparent text-xs text-gray-700 dark:text-gray-300 font-mono w-full outline-none select-all truncate"
          />
          <button
            onClick={handleCopy}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copié' : 'Copier'}</span>
          </button>
        </div>

        {/* Immediate 1-Click Dispatch Buttons */}
        <div className="space-y-2.5">
          {info.phone && (
            <button
              onClick={handleWhatsApp}
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Ouvrir WhatsApp directement ({info.phone})</span>
            </button>
          )}

          {info.email && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={handleGmail}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span>Ouvrir Gmail Web</span>
              </button>
              <button
                onClick={handleDefaultMail}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span>Application Mail</span>
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function AddTenantModal({ 
  onClose, 
  allTenants, 
  onSuccess 
}: { 
  onClose: () => void; 
  allTenants: any[]; 
  onSuccess: (info: TenantDispatchInfo) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    propertyId: '',
    entryDate: new Date().toISOString().split('T')[0],
    housingType: 'Appartement',
    level: 0,
    guaranteeAmount: '',
    guaranteeStatus: 'Non payée',
    monthlyRent: '',
    photoUrl: '',
    familyStatus: 'Célibataire',
    childrenCount: '0',
    cohabitants: '',
    idType: 'Carte d\'électeur',
    idNumber: '',
    waterAmount: '0',
    electricityAmount: '0',
    syndicAmount: '0',
    networkAmount: '0',
    cleaningAmount: '0',
    otherAmount: '0'
  });

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(query(collection(db, 'properties'), where('landlordId', '==', auth.currentUser.uid)), (snap) => {
      setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'properties');
    });
    return () => unsub();
  }, []);

  const selectedProperty = properties.find(p => p.id === formData.propertyId);
  const isAppartImmeuble = selectedProperty 
     ? (selectedProperty.type === 'Appartement' || selectedProperty.type === 'Immeuble') 
     : (formData.housingType === 'Appartement' || formData.housingType === 'Immeuble');

  let availableLevels: number[] | null = null;
  if (selectedProperty && isAppartImmeuble && selectedProperty.levels) {
    const occupied = allTenants.filter(t => t.propertyId === selectedProperty.id && t.level !== undefined).map(t => t.level);
    availableLevels = Array.from({length: selectedProperty.levels}, (_, i) => i).filter(l => !occupied.includes(l));
  }

  const handlePropertyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pId = e.target.value;
    const p = properties.find(x => x.id === pId);
    let newHousingType = formData.housingType;
    let newAddress = formData.address;
    if (p) {
       newHousingType = p.type;
       newAddress = p.address;
    }
    setFormData({...formData, propertyId: pId, housingType: newHousingType, address: newAddress});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    try {
      if (formData.phone) {
          const qPhone = query(collection(db, 'tenants'), where('phone', '==', formData.phone));
          const sPhone = await getDocs(qPhone);
          if (!sPhone.empty) {
             setError("Ce numéro de téléphone est déjà utilisé par un autre locataire.");
             toast.error("Numéro de téléphone déjà utilisé.");
             return;
          }
      }
      if (formData.email) {
          const qEmail = query(collection(db, 'tenants'), where('email', '==', formData.email));
          const sEmail = await getDocs(qEmail);
          if (!sEmail.empty) {
             setError("Cet email est déjà utilisé par un autre locataire.");
             toast.error("Email déjà utilisé.");
             return;
          }
      }
    } catch(err) {
      console.error(err);
    }
    
    if (availableLevels !== null && !availableLevels.includes(formData.level)) {
       setError("L'étage sélectionné n'est pas libre ou n'existe pas.");
       return;
    }

    setLoading(true);
    setError('');

    let userCredential;
    const pwd = crypto.randomUUID().slice(-8) + 'A1!';
    
    try {
      const secondaryAppId = 'Secondary_' + crypto.randomUUID().replace(/-/g, '');
      const secondaryApp = initializeApp(firebaseConfig, secondaryAppId);
      const secondaryAuth = getAuth(secondaryApp);
      userCredential = await createUserWithEmailAndPassword(secondaryAuth, formData.email, pwd);
    } catch (authErr: any) {
      console.error("Auth creation failed", authErr);
      if (authErr.code === 'auth/email-already-in-use') {
        setError("Cette adresse email possède déjà un compte.");
        toast.error("Email déjà utilisé.");
      } else {
        setError("Erreur lors de la création du compte Auth.");
        toast.error("Vérifiez l'email.");
      }
      setLoading(false);
      return;
    }

    try {
      const now = new Date().toISOString();
      const tenantData: any = {
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
        landlordId: auth.currentUser.uid,
        createdAt: now,
        updatedAt: now
      };
      if (tenantData.housingType !== 'Appartement' && tenantData.housingType !== 'Immeuble') {
          delete tenantData.level;
      }
      if (!tenantData.address) delete tenantData.address;
      if (!tenantData.email) delete tenantData.email;
      if (!tenantData.propertyId) delete tenantData.propertyId;
      if (!tenantData.photoUrl) delete tenantData.photoUrl;
      const docRef = await addDoc(collection(db, 'tenants'), tenantData);
      const newTenantId = docRef.id;
      
      try {
        const secondaryApp = initializeApp(firebaseConfig, 'Secondary_' + newTenantId);
        const secondaryAuth = getAuth(secondaryApp);
        const secondaryDb = getFirestore(secondaryApp);
        await setDoc(doc(secondaryDb, 'users', userCredential.user.uid), {
             name: formData.name,
             phone: formData.phone,
             email: formData.email,
             role: 'tenant',
             tenantId: newTenantId,
             createdAt: now
        });
        await sendPasswordResetEmail(secondaryAuth, formData.email);
        await secondaryAuth.signOut();
      } catch (authErr: any) {
        console.error("Failed to set user document / send reset email", authErr);
      }
      
      // Automatic property occupancy update
      if (tenantData.propertyId) {
        try {
          await updateDoc(doc(db, 'properties', tenantData.propertyId), {
            status: 'Occupé'
          });
        } catch (e) {
          console.error("Failed to update property status automatically", e);
        }
      }

      toast.success("Locataire créé avec succès !");
      onSuccess({
        tenantId: newTenantId,
        name: formData.name,
        phone: formData.phone,
        email: formData.email
      });
    } catch (error) {
      console.error("Error adding tenant", error);
      toast.error('Erreur lors de l\'ajout.');
      setError("Erreur lors de l'ajout. Vérifiez les champs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto transition-colors">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Nouveau Locataire</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-semibold">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Bien Immobilier (Optionnel)</label>
            <select value={formData.propertyId} onChange={handlePropertyChange} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs">
              <option value="">Aucun bien sélectionné</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Nom complet</label>
            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Téléphone</label>
              <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" placeholder="Ex: +243810000000" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Email <span className="text-red-500">*</span></label>
              <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" placeholder="locataire@gmail.com" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Adresse / Numéro de porte</label>
            <input required type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Type de bien</label>
              <select disabled={!!selectedProperty} value={formData.housingType} onChange={e => setFormData({...formData, housingType: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs disabled:opacity-50">
                <option>Appartement</option>
                <option>Maison</option>
                <option>Chambre</option>
                <option>Studio</option>
                <option>Boutique</option>
                <option>Immeuble</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Date d'entrée</label>
              <input required type="date" value={formData.entryDate} onChange={e => setFormData({...formData, entryDate: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" />
            </div>
          </div>
          
          {isAppartImmeuble && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Étage sélectionné</label>
              {availableLevels ? (
                availableLevels.length > 0 ? (
                  <select required value={Number.isNaN(formData.level) ? '' : formData.level} onChange={e => setFormData({...formData, level: parseInt(e.target.value) || 0})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs">
                    {availableLevels.map(lvl => (
                      <option key={lvl} value={lvl}>{lvl === 0 ? "Rez-de-chaussée" : `Étage ${lvl}`}</option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2.5 bg-orange-50 text-orange-700 rounded-xl text-xs font-medium border border-orange-100">
                    Ce bien est complet. Aucun étage disponible.
                  </div>
                )
              ) : (
                <input required type="number" min="0" value={formData.level} onChange={e => setFormData({...formData, level: parseInt(e.target.value) || 0})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" placeholder="Ex: 2 pour le 2ème" />
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Loyer mensuel ($)</label>
              <input required type="number" min="0" value={formData.monthlyRent} onChange={e => setFormData({...formData, monthlyRent: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Garantie ($)</label>
              <input required type="number" min="0" value={formData.guaranteeAmount} onChange={e => setFormData({...formData, guaranteeAmount: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Forfait Eau ($)</label>
              <input required type="number" min="0" value={formData.waterAmount} onChange={e => setFormData({...formData, waterAmount: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Forfait Élec. ($)</label>
              <input required type="number" min="0" value={formData.electricityAmount} onChange={e => setFormData({...formData, electricityAmount: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Statut Garantie</label>
            <select value={formData.guaranteeStatus} onChange={e => setFormData({...formData, guaranteeStatus: e.target.value})} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs">
              <option>Non payée</option>
              <option>Partielle</option>
              <option>Payée</option>
            </select>
          </div>
          
          <div className="pt-3 flex gap-2.5">
            <button type="button" onClick={onClose} className="flex-1 py-2 px-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={loading} className="flex-1 py-2 px-3 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
              {loading ? 'Création...' : 'Créer & Envoyer Lien'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
