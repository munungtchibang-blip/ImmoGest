import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { Receipt, Plus, ArrowLeft, Trash2, X, Sparkles, TrendingDown, ChevronRight, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useSubscription } from '../context/SubscriptionContext';

import { BudgetAndSupplierManager } from '../components/BudgetAndSupplierManager';

export function Expenses() {
  const { subscription, openSubscriptionModal } = useSubscription();
  const [activeView, setActiveView] = useState<'expenses' | 'budgets'>('expenses');
  const [expenses, setExpenses] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showProRecommendModal, setShowProRecommendModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);

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

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const isPro = subscription.tierId === 'pro' || subscription.tierId === 'vip';

  const handleNewExpenseClick = () => {
    if (!isPro) {
      setShowProRecommendModal(true);
    } else {
      setShowAddForm(true);
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;
    try {
      await deleteDoc(doc(db, 'expenses', expenseToDelete));
      setExpenseToDelete(null);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la suppression de la dépense.");
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/" className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-xs border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium text-xs sm:text-sm">
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" /> Retour au tableau de bord
      </Link>

      {/* View Switcher */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        <button
          onClick={() => setActiveView('expenses')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeView === 'expenses'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Dépenses Réelles</span>
          <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">{expenses.length}</span>
        </button>

        <button
          onClick={() => setActiveView('budgets')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeView === 'budgets'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Plafonds Budgétaires & Fournisseurs</span>
        </button>
      </div>

      {activeView === 'budgets' ? (
        <BudgetAndSupplierManager expenses={expenses} properties={properties} />
      ) : (
        <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white transition-colors">Dépenses d'exploitation</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
              {expenses.length} enregistrement{expenses.length > 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-0.5 transition-colors">
            Gérez les coûts, réparations et charges de vos biens immobiliers.
          </p>
        </div>

        <button
          onClick={handleNewExpenseClick}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nouvelle Dépense
        </button>
      </div>

      {/* Pro Recommendation Banner if not Pro */}
      {!isPro && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-950 dark:text-amber-200">
                Abonnement Pro recommandé pour la gestion des dépenses
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Débloquez le suivi automatique des charges déductibles de la garantie locative et les exports fiscaux complets.
              </p>
            </div>
          </div>
          <button
            onClick={() => openSubscriptionModal('pro')}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Passer à Pro
          </button>
        </div>
      )}

      {/* Compact Total Banner */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-xs border border-gray-100 dark:border-gray-700/80 flex items-center justify-between transition-colors">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Cumul des dépenses enregistrées</p>
          <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">{totalExpenses.toLocaleString()} $</p>
        </div>
        <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
          <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
        </div>
      </div>

      {/* Compact Expenses List */}
      {loading ? (
        <div className="animate-pulse space-y-2.5">
          {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs border border-gray-100 dark:border-gray-700/80 overflow-hidden transition-colors">
          <div className="divide-y divide-gray-100 dark:divide-gray-750">
            {expenses.length === 0 ? (
              <div className="p-8 text-center">
                <Receipt className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-xs text-gray-500 dark:text-gray-400">Aucune dépense enregistrée.</p>
              </div>
            ) : (
              expenses.map(expense => {
                const isExpanded = expandedId === expense.id;
                return (
                  <div key={expense.id} className="transition-colors">
                    <div 
                      className="p-3 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40"
                      onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                          <Receipt className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                            <span>{expense.category}</span>
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {format(new Date(expense.date), 'dd MMM yyyy', { locale: fr })}
                            {expense.description && !isExpanded && ` • ${expense.description}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
                        <p className="font-bold text-red-600 dark:text-red-400 text-sm sm:text-base">
                          -{expense.amount} $
                        </p>
                        <button
                          onClick={() => setExpenseToDelete(expense.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          title="Supprimer la dépense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/40 text-xs text-gray-700 dark:text-gray-300 space-y-1.5 border-t border-gray-100 dark:border-gray-750">
                        <p><strong>Date :</strong> {format(new Date(expense.date), 'dd MMMM yyyy', { locale: fr })}</p>
                        <p><strong>Montant :</strong> {expense.amount} $</p>
                        <p><strong>Catégorie :</strong> {expense.category}</p>
                        {expense.propertyId && (
                          <p><strong>Bien immobilier :</strong> {properties.find(p => p.id === expense.propertyId)?.name || 'Inconnu'}</p>
                        )}
                        {expense.tenantId && (
                          <p><strong>Locataire déduit :</strong> {tenants.find(t => t.id === expense.tenantId)?.name || 'Inconnu'}</p>
                        )}
                        {expense.description && <p><strong>Détails :</strong> {expense.description}</p>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      </>
      )}

      {showAddForm && (
        <AddExpenseModal onClose={() => setShowAddForm(false)} />
      )}

      {/* Pro Recommendation Modal triggered when clicking Nouvelle Dépense on basic plans */}
      {showProRecommendModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base">
              Abonnement Pro Recommandé
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">
              L'enregistrement et le calcul des charges nettes nécessitent l'abonnement <strong>Professionnel (29 $/mois)</strong> pour une gestion financière et comptable complète.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setShowProRecommendModal(false);
                  openSubscriptionModal('pro');
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold shadow-md transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Débloquer l'Abonnement Pro</span>
              </button>
              <button
                onClick={() => {
                  setShowProRecommendModal(false);
                  setShowAddForm(true);
                }}
                className="w-full py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Continuer quand même
              </button>
            </div>
          </div>
        </div>
      )}

      {expenseToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">Supprimer la dépense</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Êtes-vous sûr de vouloir supprimer cette dépense ?</p>
            <div className="flex gap-3">
              <button onClick={() => setExpenseToDelete(null)} className="flex-1 py-2 px-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Annuler
              </button>
              <button onClick={handleDeleteExpense} className="flex-1 py-2 px-3 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors">
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
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
      const numAmount = Number(formData.amount);
      const expenseData = {
        amount: numAmount,
        category: formData.category,
        date: new Date(formData.date).toISOString(),
        description: formData.description,
        propertyId: formData.propertyId || null,
        tenantId: formData.tenantId || null,
        landlordId: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      };

      if (formData.deductFromGuarantee && formData.tenantId) {
        const tenantRef = doc(db, 'tenants', formData.tenantId);
        const tenantSnap = await getDoc(tenantRef);
        if (tenantSnap.exists()) {
          const currentGuarantee = tenantSnap.data().guaranteeAmount || 0;
          if (currentGuarantee < numAmount) {
             setError(`La garantie actuelle (${currentGuarantee}$) est inférieure au montant de la dépense.`);
             setLoading(false);
             return;
          }
          const newGuarantee = currentGuarantee - numAmount;
          let status = tenantSnap.data().guaranteeStatus;
          if (newGuarantee <= 0) status = 'Non payée';
          else if (newGuarantee < (tenantSnap.data().monthlyRent * 3)) status = 'Partielle';
          else status = 'Payée';
          await updateDoc(tenantRef, { guaranteeAmount: newGuarantee, guaranteeStatus: status });
        }
      }

      await addDoc(collection(db, 'expenses'), expenseData);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError("Erreur lors de l'enregistrement de la dépense.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl max-w-md w-full p-6 transition-colors">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Nouvelle dépense</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && (
          <div className="bg-red-50 text-red-600 p-2.5 rounded-xl text-xs mb-3 font-semibold">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Montant ($)</label>
            <input required type="number" min="1" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" placeholder="Ex: 50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Catégorie</label>
            <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs">
              <option>Entretien</option>
              <option>Réparation</option>
              <option>Taxes</option>
              <option>Assurance</option>
              <option>Facture Eau</option>
              <option>Facture Électricité</option>
              <option>Autre</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input required type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Bien associé (Optionnel)</label>
            <select value={formData.propertyId} onChange={e => setFormData({ ...formData, propertyId: e.target.value })} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs">
              <option value="">Aucun bien</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Locataire (Optionnel)</label>
            <select value={formData.tenantId} onChange={e => setFormData({ ...formData, tenantId: e.target.value })} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs">
              <option value="">Aucun locataire</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {formData.tenantId && (
            <div className="flex items-center gap-2 py-1">
              <input type="checkbox" id="deduct" checked={formData.deductFromGuarantee} onChange={e => setFormData({ ...formData, deductFromGuarantee: e.target.checked })} className="rounded text-blue-600 focus:ring-blue-500" />
              <label htmlFor="deduct" className="text-xs text-gray-700 dark:text-gray-300">
                Déduire de la garantie locative du locataire
              </label>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Description / Notes</label>
            <textarea rows={2} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs" placeholder="Détaillez la dépense..." />
          </div>
          <div className="pt-2 flex gap-2.5">
            <button type="button" onClick={onClose} className="flex-1 py-2 px-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={loading} className="flex-1 py-2 px-3 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
