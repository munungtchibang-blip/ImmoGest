import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { Plus, Search, User, MapPin, Phone, ArrowLeft, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export function Tenants() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [tenantToDelete, setTenantToDelete] = useState<string | null>(null);

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

      // 3. Delete the tenant
      await deleteDoc(doc(db, 'tenants', tenantToDelete));
      toast.success('Locataire supprimé avec succès');
      
      setTenantToDelete(null);
    } catch (error) {
      console.error("Error deleting tenant cascade", error);
      toast.error("Erreur lors de la suppression.");
    } finally {
      setLoading(false);
    }
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
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Retour au tableau de bord
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">Locataires</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">Gérez vos locataires et leurs contrats.</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nouveau Locataire
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Rechercher un locataire ou une adresse..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-gray-900 dark:text-white"
          />
        </div>
        
        {uniqueCategories.length > 0 && (
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white transition-colors min-w-[150px]"
          >
            <option value="All">Tous les types</option>
            {uniqueCategories.map(cat => (
              <option key={cat as string} value={cat as string}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTenants.map(tenant => (
            <Link key={tenant.id} to={`/tenants/${tenant.id}`} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 transition-all group relative overflow-hidden">
              <div className="flex items-start gap-4">
                {tenant.photoUrl ? (
                  <img src={tenant.photoUrl} alt={tenant.name} className="w-14 h-14 rounded-full object-cover shrink-0 border-2 border-white dark:border-gray-800 shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 border-2 border-white dark:border-gray-800 shadow-sm">
                    <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors pr-8">{tenant.name}</h3>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-blue-600 dark:text-blue-400">{tenant.monthlyRent} $</p>
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">/mois</p>
                    </div>
                  </div>
                  
                  <div className="mt-2 space-y-1.5">
                    <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2 truncate">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0" /> 
                      <span className="truncate">{tenant.address} <span className="text-gray-400">({tenant.housingType})</span></span>
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400 shrink-0" /> {tenant.phone}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg">
                        Garantie: {tenant.guaranteeAmount || 0} $
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                        tenant.guaranteeStatus === 'Payée' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        tenant.guaranteeStatus === 'Partielle' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {tenant.guaranteeStatus || 'Non payée'}
                      </span>
                    </div>

                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setTenantToDelete(tenant.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors absolute bottom-4 right-4"
                      title="Supprimer le locataire"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {filteredTenants.length === 0 && !loading && (
            <div className="col-span-full text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 border-dashed">
              <User className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Aucun locataire trouvé.</p>
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <AddTenantModal onClose={() => setShowAddForm(false)} allTenants={tenants} />
      )}
      {tenantToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Supprimer le locataire</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Êtes-vous sûr de vouloir supprimer ce locataire ? Cette action est irréversible et supprimera également l'accès à son historique.</p>
            <div className="flex gap-3">
              <button onClick={() => setTenantToDelete(null)} className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Annuler</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

function AddTenantModal({ onClose, allTenants }: { onClose: () => void, allTenants: any[] }) {
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
    
    // Strict requirement validation
    if (availableLevels !== null && !availableLevels.includes(formData.level)) {
       setError("L'étage sélectionné n'est pas libre ou n'existe pas.");
       return;
    }

    setLoading(true);
    setError('');

    let userCredential;
    let pwd = crypto.randomUUID().slice(-8) + 'A1!';
    
    try {
      const secondaryAppId = 'Secondary_' + Math.random().toString(36).substring(2, 9);
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
        toast.success("Le locataire a été ajouté et un email de configuration lui a été envoyé !");
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

      onClose();
    } catch (error) {
      console.error("Error adding tenant", error);
      toast.error('Erreur lors de l\'ajout.');
      setError("Erreur lors de l'ajout. Vérifiez les champs.");
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto transition-colors">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Nouveau Locataire</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bien Immobilier (Optionnel)</label>
            <select value={formData.propertyId} onChange={handlePropertyChange} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">Aucun bien sélectionné</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo (optionnelle)</label>
            <input type="file" accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onloadend = () => setFormData({...formData, photoUrl: reader.result as string});
                reader.readAsDataURL(file);
              } else {
                setFormData({...formData, photoUrl: ''});
              }
            }} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            {formData.photoUrl && <img src={formData.photoUrl} alt="Aperçu" className="mt-2 h-16 w-16 object-cover rounded-lg" />}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom complet</label>
            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Téléphone</label>
            <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Accès Locataire</h4>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Une adresse email est obligatoire. Un compte sera automatiquement créé pour le locataire afin d'accéder à son espace. 
              S'il possède déjà un compte avec cet email, la création sera refusée.
            </p>
            
            <label className="block text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input 
              type="email" 
              required
              value={formData.email} 
              onChange={e => setFormData({...formData, email: e.target.value})} 
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse / Numéro de porte</label>
            <input required type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de bien</label>
              <select disabled={!!selectedProperty} value={formData.housingType} onChange={e => setFormData({...formData, housingType: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50">
                <option>Appartement</option>
                <option>Maison</option>
                <option>Chambre</option>
                <option>Studio</option>
                <option>Boutique</option>
                <option>Immeuble</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date d'entrée</label>
              <input required type="date" value={formData.entryDate} onChange={e => setFormData({...formData, entryDate: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          
          {isAppartImmeuble && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Étage sélectionné</label>
              {availableLevels ? (
                availableLevels.length > 0 ? (
                  <select required value={Number.isNaN(formData.level) ? '' : formData.level} onChange={e => setFormData({...formData, level: parseInt(e.target.value) || 0})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="" disabled className="hidden">Sélectionnez un étage libre</option>
                    {availableLevels.map(lvl => (
                      <option key={lvl} value={lvl}>{lvl === 0 ? "Rez-de-chaussée" : `Étage ${lvl}`}</option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 bg-orange-50 text-orange-700 rounded-lg text-sm font-medium border border-orange-100">
                    Ce bien est complet. Aucun étage disponible.
                  </div>
                )
              ) : (
                <input required type="number" min="0" value={formData.level} onChange={e => setFormData({...formData, level: parseInt(e.target.value) || 0})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: 2 pour le 2ème" />
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Loyer mensuel ($)</label>
              <input required type="number" min="0" value={formData.monthlyRent} onChange={e => setFormData({...formData, monthlyRent: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Garantie ($)</label>
              <input required type="number" min="0" value={formData.guaranteeAmount} onChange={e => setFormData({...formData, guaranteeAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Forfait Eau ($)</label>
              <input required type="number" min="0" value={formData.waterAmount} onChange={e => setFormData({...formData, waterAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Forfait Électricité ($)</label>
              <input required type="number" min="0" value={formData.electricityAmount} onChange={e => setFormData({...formData, electricityAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Frais syndics ($)</label>
              <input required type="number" min="0" value={formData.syndicAmount} onChange={e => setFormData({...formData, syndicAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Internet / Networks ($)</label>
              <input required type="number" min="0" value={formData.networkAmount} onChange={e => setFormData({...formData, networkAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entretien ($)</label>
              <input required type="number" min="0" value={formData.cleaningAmount} onChange={e => setFormData({...formData, cleaningAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Autre ($)</label>
              <input required type="number" min="0" value={formData.otherAmount} onChange={e => setFormData({...formData, otherAmount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut de la garantie</label>
            <select value={formData.guaranteeStatus} onChange={e => setFormData({...formData, guaranteeStatus: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option>Non payée</option>
              <option>Partielle</option>
              <option>Payée</option>
            </select>
          </div>
          <hr className="my-4 border-gray-200 dark:border-gray-700" />
          <h3 className="font-bold text-gray-900 dark:text-white mb-2">Pièce d'identité</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de pièce</label>
              <select value={formData.idType} onChange={e => setFormData({...formData, idType: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option>Carte d'électeur</option>
                <option>Permis de conduire</option>
                <option>Passeport</option>
                <option>Carte d'identité</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Numéro de la pièce</label>
              <input type="text" value={formData.idNumber} onChange={e => setFormData({...formData, idNumber: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: N°123456" />
            </div>
          </div>
          
          <hr className="my-4 border-gray-200 dark:border-gray-700" />
          <h3 className="font-bold text-gray-900 dark:text-white mb-2">Situation Familiale</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut marital</label>
              <select value={formData.familyStatus} onChange={e => setFormData({...formData, familyStatus: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option>Célibataire</option>
                <option>En couple</option>
                <option>Marié(e)</option>
                <option>Divorcé(e)</option>
                <option>Veuf/Veuve</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre d'enfants</label>
              <input required type="number" min="0" value={formData.childrenCount} onChange={e => setFormData({...formData, childrenCount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cohabitants (ex: frère, ami...)</label>
            <input type="text" value={formData.cohabitants} onChange={e => setFormData({...formData, cohabitants: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Laissez vide si aucun" />
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
