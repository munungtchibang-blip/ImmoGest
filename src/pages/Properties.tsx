import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { Building2, Plus, ArrowLeft, Trash2, Home, Sparkles, Lock, MapPin, Users, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PhotoModal } from '../components/PhotoModal';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '../context/SubscriptionContext';

export function Properties() {
  const { t } = useTranslation();
  const { subscription, openSubscriptionModal } = useSubscription();
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const unsubProps = onSnapshot(query(collection(db, 'properties'), where('landlordId', '==', uid)), (snap) => {
      setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'properties'); });

    const unsubTenants = onSnapshot(query(collection(db, 'tenants'), where('landlordId', '==', uid)), (snap) => {
      setTenants(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'tenants'); });

    const unsubPayments = onSnapshot(query(collection(db, 'payments'), where('landlordId', '==', uid)), (snap) => {
      setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'payments'); });

    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), where('landlordId', '==', uid)), (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'expenses'); });

    return () => {
      unsubProps();
      unsubTenants();
      unsubPayments();
      unsubExpenses();
    };
  }, []);

  const handleDelete = async () => {
    if (!propertyToDelete) return;
    setLoading(true);
    try {
      // 1. Get tenants of this property
      const qTenants = query(collection(db, 'tenants'), where('propertyId', '==', propertyToDelete));
      const tenantsSnap = await getDocs(qTenants);
      
      const tenantIds = tenantsSnap.docs.map(d => d.id);
      
      // 2. Delete Payments, Maintenance related to these tenants
      for (const tId of tenantIds) {
        const qPayments = query(collection(db, 'payments'), where('tenantId', '==', tId));
        const paySnap = await getDocs(qPayments);
        paySnap.forEach(d => deleteDoc(doc(db, 'payments', d.id)));

        const qMaintenance = query(collection(db, 'maintenance'), where('tenantId', '==', tId));
        const maintSnap = await getDocs(qMaintenance);
        maintSnap.forEach(d => deleteDoc(doc(db, 'maintenance', d.id)));
      }

      // 3. Delete the tenants themselves
      tenantsSnap.forEach(d => deleteDoc(doc(db, 'tenants', d.id)));

      // 4. Delete expenses of this property
      const qExpenses = query(collection(db, 'expenses'), where('propertyId', '==', propertyToDelete));
      const expSnap = await getDocs(qExpenses);
      expSnap.forEach(d => deleteDoc(doc(db, 'expenses', d.id)));

      // 5. Delete the property
      await deleteDoc(doc(db, 'properties', propertyToDelete));
      toast.success('Bien immobilier supprimé avec succès');
      
      setPropertyToDelete(null);
    } catch (error) {
      console.error("Error deleting property cascade", error);
      toast.error('Erreur lors de la suppression.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Retour au tableau de bord
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">{t('Biens Immobiliers')}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5 transition-colors">{t('Gérez vos maisons, appartements et parcelles.')}</p>
        </div>
        <button
          onClick={() => {
            if (properties.length >= 1 && subscription.tierId === 'starter') {
              toast.error("Votre abonnement Débutant permet 1 bien maximum. Passez au forfait Pro pour gérer un nombre illimité de biens.");
              openSubscriptionModal('pro');
              return;
            }
            setShowAddForm(true);
          }}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          {t('Nouveau Bien')}
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
        </div>
      ) : (
        <div className="space-y-2.5">
          {properties.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <Building2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('Aucun bien immobilier enregistré.')}</p>
            </div>
          ) : (
            properties.map(property => {
              const propTenants = tenants.filter(t => t.propertyId === property.id);
              const propTenantIds = propTenants.map(t => t.id);
              const propPayments = payments.filter(p => propTenantIds.includes(p.tenantId));
              const propExpenses = expenses.filter(e => e.propertyId === property.id);

              const totalIncome = propPayments.reduce((sum, p) => sum + Number(p.amount), 0);
              const totalExpense = propExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
              const netIncome = totalIncome - totalExpense;

              let unoccupiedText = "";
              if ((property.type === 'Appartement' || property.type === 'Immeuble')) {
                const totalUnits = property.apartmentsCount || property.levels || 1;
                const occupiedUnits = propTenants.length;
                const freeUnits = totalUnits - occupiedUnits;
                if (freeUnits > 0) {
                  unoccupiedText = `${freeUnits} libre(s)`;
                } else {
                  unoccupiedText = "Complet";
                }
              }

              return (
                <div key={property.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-xs border border-gray-100 dark:border-gray-700/80 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-blue-300 dark:hover:border-blue-600 transition-all">
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {property.photoUrl ? (
                      <img src={property.photoUrl} alt={property.name} className="w-11 h-11 rounded-xl object-cover cursor-pointer shrink-0 border border-gray-200 dark:border-gray-700" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPhoto(property.photoUrl); }} referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                        <Home className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">{property.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {property.type}
                          {(property.type === 'Appartement' || property.type === 'Immeuble') ? ` (${property.apartmentsCount || property.levels || 1} unités)` : ''}
                        </span>
                        {property.status && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            property.status === 'Libre' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                            property.status === 'Occupé' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                            'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}>
                            {property.status}
                          </span>
                        )}
                        {unoccupiedText && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${unoccupiedText === 'Complet' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {unoccupiedText}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                        {property.address}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-750">
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="text-[10px] text-gray-400">Locataires</p>
                        <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">{propTenants.length}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400">{t('Bénéfice Net')}</p>
                        <p className={`font-bold text-xs sm:text-sm ${netIncome >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {netIncome.toLocaleString()} $
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 ml-2">
                      <Link to={`/properties/${property.id}`} className="px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800/60 transition-colors">
                        {t('Détails')}
                      </Link>
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPropertyToDelete(property.id); }}
                        className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {showAddForm && (
        <AddPropertyModal onClose={() => setShowAddForm(false)} />
      )}
      {propertyToDelete && (
        <ConfirmModal 
          title="Supprimer la propriété" 
          message="Êtes-vous sûr de vouloir supprimer cette propriété ? Cette action est irréversible."
          onConfirm={handleDelete} 
          onCancel={() => setPropertyToDelete(null)} 
        />
      )}
      {showPhoto && <PhotoModal url={showPhoto} onClose={() => setShowPhoto(null)} />}
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

function AddPropertyModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    type: 'Appartement',
    address: '',
    status: 'Libre',
    levels: 1,
    apartmentsCount: 1,
    photoUrl: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const propertyData: any = {
        ...formData,
        landlordId: auth.currentUser.uid,
        createdAt: now,
        updatedAt: now
      };
      
      if (propertyData.type !== 'Appartement' && propertyData.type !== 'Immeuble') {
        delete propertyData.levels;
        delete propertyData.apartmentsCount;
      }
      
      if (!propertyData.photoUrl) {
        delete propertyData.photoUrl;
      }
      
      await addDoc(collection(db, 'properties'), propertyData);
      toast.success('Bien immobilier ajouté avec succès');
      onClose();
    } catch (error) {
      console.error("Error adding property", error);
      toast.error("Erreur lors de l'ajout.");
      setError("Erreur lors de l'ajout.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full transition-colors">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Nouveau Bien Immobilier</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom du bien</label>
            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: Résidence Les Palmiers" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option>Appartement</option>
              <option>Maison</option>
              <option>Parcelle</option>
              <option>Immeuble</option>
              <option>Autre</option>
            </select>
          </div>
          
          {(formData.type === 'Appartement' || formData.type === 'Immeuble') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre d'étages</label>
                <input required type="number" min="1" max="100" value={formData.levels} onChange={e => setFormData({...formData, levels: parseInt(e.target.value) || 1})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: 5" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre d'appartements</label>
                <input required type="number" min="1" max="1000" value={formData.apartmentsCount} onChange={e => setFormData({...formData, apartmentsCount: parseInt(e.target.value) || 1})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: 10" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse complète</label>
            <textarea required rows={2} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo (optionnelle)</label>
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
                    setFormData({...formData, photoUrl: canvas.toDataURL('image/jpeg', 0.6)});
                  };
                  img.src = reader.result as string;
                };
                reader.readAsDataURL(file);
              } else {
                setFormData({...formData, photoUrl: ''});
              }
            }} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            {formData.photoUrl && <img src={formData.photoUrl} alt="Aperçu" className="mt-2 w-full h-32 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut d'occupation</label>
            <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="Libre">Libre</option>
              <option value="Occupé">Occupé</option>
              <option value="En rénovation">En rénovation</option>
            </select>
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
