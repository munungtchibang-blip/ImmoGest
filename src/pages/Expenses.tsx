import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { Receipt, Plus, ArrowLeft, Trash2, X, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function Expenses() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const q = query(collection(db, 'expenses'), where('landlordId', '==', uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(data);
      setLoading(false);
    });

    const qProps = query(collection(db, 'properties'), where('landlordId', '==', uid));
    const unsubProps = onSnapshot(qProps, (snapshot) => {
       setProperties(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qTenants = query(collection(db, 'tenants'), where('landlordId', '==', uid));
    const unsubTenants = onSnapshot(qTenants, (snapshot) => {
       setTenants(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
       unsub();
       unsubProps();
       unsubTenants();
    };
  }, []);

  const [error, setError] = useState('');

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);



  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Retour au tableau de bord
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">Dépenses</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">Gérez les coûts liés à vos propriétés.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nouvelle Dépense
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between transition-colors">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total des dépenses</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalExpenses.toLocaleString()} $</p>
        </div>
        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <Receipt className="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {expenses.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">Aucune dépense enregistrée.</p>
              </div>
            ) : (
              expenses.map(expense => {
                const isExpanded = expandedId === expense.id;
                return (
                <div key={expense.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors" onClick={() => setExpandedId(isExpanded ? null : expense.id)}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                      <Receipt className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        {expense.category}
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {format(new Date(expense.date), 'dd MMM yyyy', { locale: fr })}
                      </p>
                      {expense.description && !isExpanded && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic truncate max-w-xs md:max-w-md">"{expense.description}"</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pl-16 sm:pl-0" onClick={e => e.stopPropagation()}>
                    <p className="font-bold text-gray-900 dark:text-white text-lg">{expense.amount} $</p>

                  </div>
                </div>
                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 bg-gray-50 dark:bg-gray-800/50 text-sm text-gray-700 dark:text-gray-300 space-y-2 border-t border-gray-100 dark:border-gray-700">
                    <p><strong>Date:</strong> {format(new Date(expense.date), 'dd MMMM yyyy', { locale: fr })}</p>
                    <p><strong>Montant:</strong> {expense.amount} $</p>
                    <p><strong>Catégorie:</strong> {expense.category}</p>
                    {expense.propertyId && <p><strong>Propriété:</strong> {properties.find(p => p.id === expense.propertyId)?.name || 'Inconnue'}</p>}
                    {expense.tenantId && <p><strong>Locataire déduit:</strong> {tenants.find(t => t.id === expense.tenantId)?.name || 'Inconnu'}</p>}
                    {expense.description && <p><strong>Détails:</strong> {expense.description}</p>}
                  </div>
                )}
                </div>
              )})
            )}
          </div>
        </div>
      )}

      {showAddForm && (
        <AddExpenseModal onClose={() => setShowAddForm(false)} />
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 flex justify-between items-center shadow-lg">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-4 text-red-700 hover:text-red-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
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

function AddExpenseModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    amount: '',
    category: 'Entretien',
    date: new Date().toISOString().split('T')[0],
    description: '',
    propertyId: '',
    tenantId: '',
    deductFromGuarantee: false
  });

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubProps = onSnapshot(query(collection(db, 'properties'), where('landlordId', '==', auth.currentUser.uid)), (snap) => {
      setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubTenants = onSnapshot(query(collection(db, 'tenants'), where('landlordId', '==', auth.currentUser.uid)), (snap) => {
      setTenants(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => {
      unsubProps();
      unsubTenants();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    try {
      const amount = Number(formData.amount);
      const now = new Date().toISOString();
      const expenseData: any = {
        amount: amount,
        category: formData.category,
        date: new Date(formData.date).toISOString(),
        description: formData.description,
        landlordId: auth.currentUser.uid,
        createdAt: now
      };
      if (formData.propertyId) expenseData.propertyId = formData.propertyId;
      if (formData.tenantId) expenseData.tenantId = formData.tenantId;

      if (formData.tenantId) {
        const tenantRef = doc(db, 'tenants', formData.tenantId);
        const tSnap = await getDoc(tenantRef);
        if (tSnap.exists()) {
          const tData = tSnap.data();
          const currentGuarantee = Number(tData.guaranteeAmount || 0);
          const newGuarantee = currentGuarantee - amount;
          let guaranteeStatus = tData.guaranteeStatus || 'Payée';
          if (newGuarantee <= 0) guaranteeStatus = 'Non payée';
          else if (newGuarantee < (tData.monthlyRent * 3)) guaranteeStatus = 'Partielle';
          
          await updateDoc(tenantRef, { guaranteeAmount: newGuarantee, guaranteeStatus });
        } else {
          setError("Locataire introuvable pour la déduction.");
          setLoading(false);
          return;
        }
      }

      await addDoc(collection(db, 'expenses'), expenseData);
      onClose();
    } catch (error) {
      console.error("Error adding expense", error);
      setError("Erreur lors de l'ajout.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full transition-colors">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Nouvelle Dépense</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bien Immobilier (Optionnel)</label>
            <select value={formData.propertyId} onChange={e => {
              setFormData({...formData, propertyId: e.target.value, tenantId: '', deductFromGuarantee: false});
            }} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">Aucun bien sélectionné</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {formData.propertyId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Locataire (Optionnel)</label>
              <select value={formData.tenantId} onChange={e => setFormData({...formData, tenantId: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Aucun locataire</option>
                {tenants.filter(t => t.propertyId === formData.propertyId).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          {formData.tenantId && (
            <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-lg">
              <span className="text-sm font-medium text-red-700">Le montant sera automatiquement déduit de la garantie locataire ({tenants.find(t => t.id === formData.tenantId)?.guaranteeAmount || 0} $).</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Montant ($)</label>
            <input required type="number" min="1" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catégorie</label>
            <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option>Taxes</option>
              <option>Assurance</option>
              <option>Entretien</option>
              <option>Eau</option>
              <option>Électricité / Lumière</option>
              <option>Frais syndics</option>
              <option>Internet / Networks</option>
              <option>Ventilation / Climatisation</option>
              <option>Plomberies</option>
              <option>Canalisation</option>
              <option>Autre</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optionnel)</label>
            <textarea rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
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
