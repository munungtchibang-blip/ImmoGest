import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { ArrowLeft, Home, Users, CreditCard, Receipt, TrendingUp, Edit2, Building2, DollarSign, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PhotoModal } from '../components/PhotoModal';

export function PropertyDetail() {
  const { id } = useParams();
  const [property, setProperty] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'tenants' | 'finances'>('overview');
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

  const totalIncome = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const netIncome = totalIncome - totalExpense;

  const totalUnits = Math.max(1, property.apartmentsCount || property.levels || 1);
  const occupiedUnits = tenants.length;
  const vacantUnits = Math.max(0, totalUnits - occupiedUnits);
  const occupancyRate = Math.min(100, Math.round((occupiedUnits / totalUnits) * 100));
  const expectedMonthlyRent = tenants.reduce((acc, t) => acc + Number(t.monthlyRent || 0), 0);

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-center justify-between">
        <Link to="/properties" className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium text-sm">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Retour aux biens
        </Link>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowEdit(true)} 
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium text-sm btn-interact"
          >
            <Edit2 className="w-4 h-4" /> Modifier le bien
          </button>
        </div>
      </div>

      {/* Property Hero Card */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sm:p-8 transition-colors card-enter">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-5">
            {property.photoUrl ? (
              <img 
                src={property.photoUrl} 
                alt={property.name} 
                className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-gray-200 dark:border-gray-700 cursor-pointer shadow-sm hover:opacity-90 transition-opacity" 
                onClick={() => setShowPhoto(property.photoUrl)} 
                referrerPolicy="no-referrer" 
              />
            ) : (
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 shadow-sm">
                <Home className="w-10 h-10" />
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">{property.name}</h1>
                {property.status && (
                  <button 
                    onClick={togglePropertyStatus}
                    className={`text-xs uppercase tracking-wider font-bold px-3 py-1 rounded-full flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity ${
                      property.status === 'Libre' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                      property.status === 'Occupé' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' :
                      'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                    }`}
                  >
                    {property.status} <Edit2 className="w-3 h-3 ml-1" />
                  </button>
                )}
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm sm:text-base">
                {property.type} 
                {(property.type === 'Appartement' || property.type === 'Immeuble') ? ` • ${property.apartmentsCount || property.levels || 1} unité(s)` : ''} • {property.address}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Enregistré le {property.createdAt ? format(new Date(property.createdAt), 'dd MMMM yyyy', { locale: fr }) : 'Non précisé'}
              </p>
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 shrink-0">
            <Link 
              to="/tenants" 
              state={{ prefillPropertyId: property.id }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm btn-interact"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau locataire</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 card-enter">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Taux d'occupation</p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-2xl font-black text-gray-900 dark:text-white">{occupancyRate}%</p>
            <span className="text-xs text-gray-500 font-medium">{occupiedUnits}/{totalUnits} unités</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${occupancyRate}%` }}></div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 card-enter">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Loyer mensuel prévu</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{expectedMonthlyRent.toLocaleString()} $</p>
          <p className="text-xs text-gray-400 mt-1">Généré par les baux actifs</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 card-enter">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Revenus perçus</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white mt-2">{totalIncome.toLocaleString()} $</p>
          <p className="text-xs text-gray-400 mt-1">{payments.length} paiements enregistrés</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 card-enter">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Résultat net</p>
          <p className={`text-2xl font-black mt-2 ${netIncome >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>
            {netIncome.toLocaleString()} $
          </p>
          <p className="text-xs text-gray-400 mt-1">Dépenses: {totalExpense.toLocaleString()} $</p>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 space-x-4">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'overview'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Vue d'ensemble
        </button>
        <button
          onClick={() => setActiveTab('tenants')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'tenants'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Locataires ({tenants.length})
        </button>
        <button
          onClick={() => setActiveTab('finances')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'finances'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Dépenses & Finances ({expenses.length})
        </button>
      </div>

      {/* Tab contents */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 tab-enter">
          {/* Tenants summary */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Locataires installés ({tenants.length})
              </h2>
              <button 
                onClick={() => setActiveTab('tenants')} 
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                Tout voir
              </button>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {tenants.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Aucun locataire installé dans ce bien.</div>
              ) : (
                tenants.slice(0, 5).map(tenant => (
                  <Link 
                    key={tenant.id} 
                    to={`/tenants/${tenant.id}`} 
                    className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div>
                      <p className="font-bold text-sm text-gray-900 dark:text-white">{tenant.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{tenant.housingType} • Porte {tenant.address || '-'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-gray-900 dark:text-white">{tenant.monthlyRent} $ / mois</p>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Voir dossier →</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Expenses summary */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-red-500" />
                Dépenses & Travaux récents ({expenses.length})
              </h2>
              <button 
                onClick={() => setActiveTab('finances')} 
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                Tout voir
              </button>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {expenses.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Aucune dépense enregistrée pour ce bien.</div>
              ) : (
                expenses.slice(0, 5).map(expense => (
                  <div key={expense.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div>
                      <p className="font-bold text-sm text-gray-900 dark:text-white">{expense.category}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(expense.date), 'dd MMM yyyy', { locale: fr })} {expense.description ? `• ${expense.description}` : ''}</p>
                    </div>
                    <p className="font-bold text-sm text-red-600 dark:text-red-400">-{expense.amount} $</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tenants' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden tab-enter">
          <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Liste complète des locataires</h2>
            <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2.5 py-1 rounded-full font-bold">
              {tenants.length} actif(s)
            </span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {tenants.length === 0 ? (
              <div className="p-10 text-center text-gray-400">Aucun locataire enregistré pour le moment.</div>
            ) : (
              tenants.map(tenant => (
                <Link key={tenant.id} to={`/tenants/${tenant.id}`} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold">
                      {tenant.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900 dark:text-white">{tenant.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{tenant.phone} • {tenant.housingType}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-gray-900 dark:text-white">{tenant.monthlyRent} $</p>
                    <p className="text-xs text-gray-400">Garantie: {tenant.guaranteeAmount || 0} $</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'finances' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden tab-enter">
          <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Historique financier du bien</h2>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="text-emerald-600">Revenus : +{totalIncome} $</span>
              <span className="text-red-600">Dépenses : -{totalExpense} $</span>
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {expenses.length === 0 ? (
              <div className="p-10 text-center text-gray-400">Aucune dépense enregistrée pour ce bien.</div>
            ) : (
              expenses.map(expense => (
                <div key={expense.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div>
                    <p className="font-bold text-sm text-gray-900 dark:text-white">{expense.category}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(expense.date), 'dd MMMM yyyy', { locale: fr })} {expense.description ? `• ${expense.description}` : ''}
                    </p>
                  </div>
                  <p className="font-bold text-sm text-red-600 dark:text-red-400">-{expense.amount} $</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
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
