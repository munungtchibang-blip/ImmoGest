import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { ArrowLeft, Home, Users, CreditCard, Receipt, TrendingUp, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PhotoModal } from '../components/PhotoModal';

export function PropertyDetail() {
  const { id } = useParams();
  const [property, setProperty] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showPhoto, setShowPhoto] = useState<string | null>(null);

  const togglePropertyStatus = async () => {
    if (!property || !id) return;
    const currentStatus = property.status || 'Libre';
    let newStatus = 'Libre';
    if (currentStatus === 'Libre') newStatus = 'Occupé';
    else if (currentStatus === 'Occupé') newStatus = 'En rénovation';
    else newStatus = 'Libre';

    try {
      await updateDoc(doc(db, 'properties', id), { status: newStatus });
      setProperty({ ...property, status: newStatus });
    } catch (e) {
      console.error('Failed to toggle status', e);
    }
  };

  useEffect(() => {
    if (!id || !auth.currentUser) return;
    const uid = auth.currentUser.uid;

    let unsubPayments: (() => void) | undefined;
    
    const fetchProperty = async () => {
      const docRef = doc(db, 'properties', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().landlordId === uid) {
        setProperty({ id: docSnap.id, ...docSnap.data() });
      }
    };
    fetchProperty();

    const unsubTenants = onSnapshot(query(collection(db, 'tenants'), where('landlordId', '==', uid), where('propertyId', '==', id)), (snap) => {
      const t = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTenants(t);
      
      if (unsubPayments) {
        unsubPayments();
        unsubPayments = undefined;
      }

      if (t.length > 0) {
        const tenantIds = t.map(tenant => tenant.id);
        unsubPayments = onSnapshot(query(collection(db, 'payments'), where('landlordId', '==', uid)), (paySnap) => {
          const allPayments = paySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setPayments(allPayments.filter((p: any) => tenantIds.includes(p.tenantId)));
        }, (error) => { handleFirestoreError(error, OperationType.LIST, 'payments'); });
      } else {
        setPayments([]);
      }
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'tenants'); });

    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), where('landlordId', '==', uid), where('propertyId', '==', id)), (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'expenses'); });

    return () => {
      unsubTenants();
      unsubExpenses();
      if (unsubPayments) unsubPayments();
    };
  }, [id]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>)}
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Propriété introuvable.</p>
        <Link to="/properties" className="text-blue-600 hover:underline mt-4 inline-block">Retour aux biens</Link>
      </div>
    );
  }

  const totalIncome = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netIncome = totalIncome - totalExpense;

  return (
    <div className="space-y-6">
      <Link to="/properties" className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Retour aux biens
      </Link>

      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            {property.photoUrl ? (
              <img src={property.photoUrl} alt={property.name} className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-gray-200 dark:border-gray-700 cursor-pointer" onClick={() => setShowPhoto(property.photoUrl)} referrerPolicy="no-referrer" />
            ) : (
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center shrink-0">
                <Home className="w-10 h-10 text-blue-600 dark:text-blue-400" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{property.name}</h1>
                {property.status && (
                  <button 
                    onClick={togglePropertyStatus}
                    className={`text-xs uppercase tracking-wider font-bold px-3 py-1 rounded-full flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity ${
                    property.status === 'Libre' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                    property.status === 'Occupé' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' :
                    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                  }`}>
                    {property.status} <Edit2 className="w-3 h-3 ml-1" />
                  </button>
                )}
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-lg">
                {property.type} 
                {(property.type === 'Appartement' || property.type === 'Immeuble') ? ` • ${property.apartmentsCount || property.levels || 1} unité(s)` : ''} • {property.address}
              </p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
             <button onClick={() => setShowEdit(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium">
               <Edit2 className="w-4 h-4" /> Modifier
             </button>
             <div>
               <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Date d'ajout</p>
               <p className="font-medium text-gray-900 dark:text-white">{property.createdAt ? format(new Date(property.createdAt), 'dd MMMM yyyy', { locale: fr }) : 'Non définie'}</p>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4 transition-colors">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center shrink-0">
            <CreditCard className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Revenus totaux</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalIncome.toLocaleString()} $</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4 transition-colors">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0">
            <Receipt className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Dépenses totales</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalExpense.toLocaleString()} $</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4 transition-colors">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${netIncome >= 0 ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
            <TrendingUp className={`w-6 h-6 ${netIncome >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`} />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Bénéfice net</p>
            <p className={`text-2xl font-bold ${netIncome >= 0 ? 'text-gray-900 dark:text-white' : 'text-orange-600 dark:text-orange-400'}`}>
              {netIncome.toLocaleString()} $
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-400" />
              Locataires ({tenants.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {tenants.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">Aucun locataire.</div>
            ) : (
              tenants.map(tenant => (
                <Link key={tenant.id} to={`/tenants/${tenant.id}`} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{tenant.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{tenant.housingType}</p>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-white">{tenant.monthlyRent} $</p>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-gray-400" />
              Dépenses récentes
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {expenses.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">Aucune dépense.</div>
            ) : (
              expenses.slice(0, 5).map(expense => (
                <div key={expense.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{expense.category}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{format(new Date(expense.date), 'dd MMM yyyy', { locale: fr })}</p>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-white">{expense.amount} $</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {showEdit && property && (
        <EditPropertyModal property={property} onClose={() => setShowEdit(false)} onSaved={(updatedData) => setProperty({...property, ...updatedData})} />
      )}
      {showPhoto && <PhotoModal url={showPhoto} onClose={() => setShowPhoto(null)} />}
    </div>
  );
}

function EditPropertyModal({ property, onClose, onSaved }: { property: any, onClose: () => void, onSaved: (data: any) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: property.name || '',
    type: property.type || 'Appartement',
    address: property.address || '',
    status: property.status || 'Libre',
    levels: property.levels || 1,
    apartmentsCount: property.apartmentsCount || 1,
    photoUrl: property.photoUrl || ''
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
        updatedAt: now
      };
      
      if (propertyData.type !== 'Appartement' && propertyData.type !== 'Immeuble') {
        propertyData.levels = deleteField();
        propertyData.apartmentsCount = deleteField();
      }
      
      if (!propertyData.photoUrl) {
        delete propertyData.photoUrl;
      }
      
      await updateDoc(doc(db, 'properties', property.id), propertyData);
      onSaved(propertyData);
      onClose();
    } catch (error) {
      console.error("Error updating property", error);
      setError("Erreur lors de la modification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full transition-colors overflow-y-auto max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Modifier le bien immobilier</h2>
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
              {loading ? 'Enregistrement...' : 'Modifier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
