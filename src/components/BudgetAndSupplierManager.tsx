import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  DollarSign, 
  Plus, 
  AlertTriangle, 
  Phone, 
  Mail, 
  Star, 
  Briefcase, 
  Edit3, 
  Trash2, 
  X 
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface BudgetCeiling {
  id: string;
  landlordId: string;
  propertyId: string;
  category: string;
  year: number;
  month?: number; // 0 = annual, 1-12 = monthly
  ceilingAmount: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  landlordId: string;
  companyName: string;
  contactName?: string;
  phone: string;
  email?: string;
  specialty: string;
  address?: string;
  rating?: number;
  notes?: string;
  createdAt: string;
}

const EXPENSE_CATEGORIES = [
  'Entretien & Réparations',
  'Taxes & Impôts fonciers',
  'Assurance incendie / multirisque',
  'Facture Eau Regideso',
  'Facture Électricité Snel',
  'Frais de syndic & sécurité',
  'Fournitures & Petit matériel',
  'Autre'
];

export function BudgetAndSupplierManager({ 
  expenses, 
  properties 
}: { 
  expenses: any[], 
  properties: any[] 
}) {
  const [subTab, setSubTab] = useState<'budgets' | 'suppliers'>('budgets');
  const [budgets, setBudgets] = useState<BudgetCeiling[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedProperty, setSelectedProperty] = useState<string>('all');

  // Modals
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetCeiling | null>(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const qBud = query(collection(db, 'budgets'), where('landlordId', '==', uid));
    const unsubBud = onSnapshot(qBud, (snap) => {
      setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() })) as BudgetCeiling[]);
    });

    const qSup = query(collection(db, 'suppliers'), where('landlordId', '==', uid));
    const unsubSup = onSnapshot(qSup, (snap) => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Supplier[]);
    });

    return () => {
      unsubBud();
      unsubSup();
    };
  }, []);


  // Compute spent amount per category & property for the chosen year
  const budgetAnalysis = useMemo(() => {
    return EXPENSE_CATEGORIES.map(category => {
      // Find matching budget ceiling if any
      const matchingBudget = budgets.find(b => 
        b.year === selectedYear &&
        (b.category === category || b.category.includes(category.slice(0, 8))) &&
        (selectedProperty === 'all' || b.propertyId === selectedProperty)
      );

      // Compute actual spend from expenses
      const actualSpend = expenses.filter(e => {
        const d = new Date(e.date || e.createdAt);
        if (d.getFullYear() !== selectedYear) return false;
        if (selectedProperty !== 'all' && e.propertyId !== selectedProperty) return false;
        return e.category === category || (category.includes(e.category) && e.category.length > 3);
      }).reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const ceiling = matchingBudget ? matchingBudget.ceilingAmount : 0;
      const percentage = ceiling > 0 ? Math.round((actualSpend / ceiling) * 100) : 0;
      const isExceeded = ceiling > 0 && actualSpend > ceiling;
      const isWarning = ceiling > 0 && actualSpend >= ceiling * 0.8 && !isExceeded;

      return {
        category,
        ceiling,
        actualSpend,
        percentage,
        isExceeded,
        isWarning,
        budgetId: matchingBudget?.id
      };
    });
  }, [budgets, expenses, selectedYear, selectedProperty]);

  const totalCeiling = budgetAnalysis.reduce((s, b) => s + b.ceiling, 0);
  const totalSpent = budgetAnalysis.reduce((s, b) => s + b.actualSpend, 0);
  const globalPercentage = totalCeiling > 0 ? Math.round((totalSpent / totalCeiling) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Sub Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab('budgets')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              subTab === 'budgets'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Plafonds & Dépassements</span>
          </button>

          <button
            onClick={() => setSubTab('suppliers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              subTab === 'suppliers'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Annuaire Fournisseurs</span>
            <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">{suppliers.length}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'budgets' ? (
            <button
              onClick={() => setShowAddBudget(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Fixer un Plafond
            </button>
          ) : (
            <button
              onClick={() => setShowAddSupplier(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouveau Fournisseur
            </button>
          )}
        </div>
      </div>

      {/* BUDGET TAB */}
      {subTab === 'budgets' && (
        <div className="space-y-4">
          {/* Filters & Overall Summary */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedProperty}
                onChange={e => setSelectedProperty(e.target.value)}
                className="p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none"
              >
                <option value="all">Toutes les propriétés</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white outline-none"
              >
                {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-gray-400 block text-[10px]">Budget alloué total</span>
                <span className="font-bold text-gray-900 dark:text-white text-sm">{totalCeiling.toLocaleString()} $</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">Dépenses réelles</span>
                <span className="font-bold text-red-600 dark:text-red-400 text-sm">{totalSpent.toLocaleString()} $</span>
              </div>
              <div className="text-right">
                <span className="text-gray-400 block text-[10px]">Taux d'engagement</span>
                <span className={`font-bold text-sm ${globalPercentage > 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {globalPercentage}%
                </span>
              </div>
            </div>
          </div>

          {/* Budget Gauges List */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-xs divide-y divide-gray-100 dark:divide-gray-750">
            {budgetAnalysis.map(b => (
              <div key={b.category} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 dark:text-white">{b.category}</span>
                    {b.isExceeded && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 animate-pulse">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Plafond dépassé
                      </span>
                    )}
                    {b.isWarning && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                        Attention (≥80%)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs">
                      <span className="font-bold text-gray-900 dark:text-white">{b.actualSpend.toLocaleString()} $</span>
                      <span className="text-gray-400"> / {b.ceiling > 0 ? `${b.ceiling.toLocaleString()} $` : 'Non plafonné'}</span>
                    </div>

                    {b.budgetId && (
                      <button
                        onClick={async () => {
                          if (window.confirm("Supprimer ce plafond budgétaire ?")) {
                            await deleteDoc(doc(db, 'budgets', b.budgetId!));
                            toast.success("Plafond supprimé.");
                          }
                        }}
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="Supprimer ce plafond"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar gauge */}
                {b.ceiling > 0 ? (
                  <div className="w-full bg-gray-100 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        b.isExceeded 
                          ? 'bg-red-500' 
                          : b.isWarning 
                            ? 'bg-amber-500' 
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, b.percentage)}%` }}
                    />
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400 italic">
                    Aucun plafond fixé pour ce poste de dépense.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUPPLIERS TAB */}
      {subTab === 'suppliers' && (
        <div className="space-y-3">
          {suppliers.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-100 dark:border-gray-700 text-center">
              <Briefcase className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="font-bold text-sm text-gray-800 dark:text-gray-200">Aucun fournisseur enregistré</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                Constituez votre carnet d'adresses d'artisans, entreprises de nettoyage, quincailleries et distributeurs d'énergie.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {suppliers.map(sup => (
                <div 
                  key={sup.id}
                  className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white">{sup.companyName}</h4>
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{sup.specialty}</p>
                        {sup.contactName && (
                          <p className="text-xs text-gray-500 mt-0.5">Contact : {sup.contactName}</p>
                        )}
                      </div>

                      {sup.rating ? (
                        <div className="flex items-center gap-0.5 text-amber-500 text-xs font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                          <span>{sup.rating}/5</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-gray-400" />
                        <span>{sup.phone}</span>
                      </div>
                      {sup.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-gray-400" />
                          <span>{sup.email}</span>
                        </div>
                      )}
                      {sup.notes && (
                        <p className="italic text-[11px] mt-1 text-gray-600 dark:text-gray-400">"{sup.notes}"</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700/80 flex items-center justify-between text-xs">
                    <a
                      href={`tel:${sup.phone}`}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3" /> Appeler
                    </a>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingSupplier(sup)}
                        className="p-1 hover:text-blue-600 text-gray-400"
                        title="Modifier"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm("Supprimer ce fournisseur ?")) {
                            await deleteDoc(doc(db, 'suppliers', sup.id));
                            toast.success("Fournisseur supprimé.");
                          }
                        }}
                        className="p-1 hover:text-red-600 text-gray-400"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Budget Modal */}
      {(showAddBudget || editingBudget) && (
        <BudgetModal
          properties={properties}
          existing={editingBudget}
          onClose={() => {
            setShowAddBudget(false);
            setEditingBudget(null);
          }}
        />
      )}

      {/* Add Supplier Modal */}
      {(showAddSupplier || editingSupplier) && (
        <SupplierModal
          existing={editingSupplier}
          onClose={() => {
            setShowAddSupplier(false);
            setEditingSupplier(null);
          }}
        />
      )}
    </div>
  );
}

function BudgetModal({ properties, existing, onClose }: { properties: any[], existing: BudgetCeiling | null, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    propertyId: existing?.propertyId || (properties[0]?.id || ''),
    category: existing?.category || EXPENSE_CATEGORIES[0],
    year: existing?.year || new Date().getFullYear(),
    ceilingAmount: existing?.ceilingAmount ? existing.ceilingAmount.toString() : '500'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);

    try {
      const now = new Date().toISOString();
      const budgetData = {
        landlordId: auth.currentUser.uid,
        propertyId: formData.propertyId,
        category: formData.category,
        year: Number(formData.year),
        ceilingAmount: Number(formData.ceilingAmount),
        updatedAt: now
      };

      if (existing) {
        await updateDoc(doc(db, 'budgets', existing.id), budgetData);
        toast.success("Plafond budgétaire mis à jour !");
      } else {
        await addDoc(collection(db, 'budgets'), {
          ...budgetData,
          createdAt: now
        });
        toast.success("Plafond budgétaire enregistré !");
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Erreur d'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700 mb-4">
          <h3 className="font-bold text-gray-900 dark:text-white text-base">
            Fixer un Plafond Budgétaire
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs sm:text-sm">
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Poste de dépense</label>
            <select
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
            >
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Propriété cible</label>
            <select
              value={formData.propertyId}
              onChange={e => setFormData({ ...formData, propertyId: e.target.value })}
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
            >
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Année</label>
              <input
                type="number"
                value={formData.year}
                onChange={e => setFormData({ ...formData, year: Number(e.target.value) })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Plafond maxi ($)</label>
              <input
                required
                type="number"
                min="10"
                value={formData.ceilingAmount}
                onChange={e => setFormData({ ...formData, ceilingAmount: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="pt-3 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-3 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-xs disabled:opacity-50"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SupplierModal({ existing, onClose }: { existing: Supplier | null, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    companyName: existing?.companyName || '',
    contactName: existing?.contactName || '',
    phone: existing?.phone || '',
    email: existing?.email || '',
    specialty: existing?.specialty || 'Fourniture & Électricité',
    address: existing?.address || '',
    rating: existing?.rating ? existing.rating.toString() : '5',
    notes: existing?.notes || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);

    try {
      const now = new Date().toISOString();
      const supData = {
        landlordId: auth.currentUser.uid,
        companyName: formData.companyName.trim(),
        contactName: formData.contactName.trim() || undefined,
        phone: formData.phone.trim(),
        email: formData.email.trim() || undefined,
        specialty: formData.specialty,
        address: formData.address.trim() || undefined,
        rating: Number(formData.rating) || 5,
        notes: formData.notes.trim() || undefined,
        updatedAt: now
      };

      if (existing) {
        await updateDoc(doc(db, 'suppliers', existing.id), supData);
        toast.success("Fournisseur mis à jour !");
      } else {
        await addDoc(collection(db, 'suppliers'), {
          ...supData,
          createdAt: now
        });
        toast.success("Fournisseur ajouté au répertoire !");
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Erreur d'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-100 dark:border-gray-700 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700 mb-4">
          <h3 className="font-bold text-gray-900 dark:text-white text-base">
            {existing ? 'Modifier le Fournisseur' : 'Nouveau Fournisseur / Prestataire'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Nom entreprise ou artisan</label>
            <input
              required
              type="text"
              placeholder="Ex: Quincaillerie du Boulevard, Ets Congo Froid"
              value={formData.companyName}
              onChange={e => setFormData({ ...formData, companyName: e.target.value })}
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Téléphone</label>
              <input
                required
                type="tel"
                placeholder="+243 82..."
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Nom contact</label>
              <input
                type="text"
                placeholder="Ex: Gérant Patrick"
                value={formData.contactName}
                onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Spécialité</label>
              <input
                type="text"
                placeholder="Ex: Pièces détachées Perkins, Peinture"
                value={formData.specialty}
                onChange={e => setFormData({ ...formData, specialty: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Note de satisfaction</label>
              <select
                value={formData.rating}
                onChange={e => setFormData({ ...formData, rating: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              >
                <option value="5">⭐⭐⭐⭐⭐ (5/5)</option>
                <option value="4">⭐⭐⭐⭐ (4/5)</option>
                <option value="3">⭐⭐⭐ (3/5)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse / Ville</label>
            <input
              type="text"
              placeholder="Ex: Av. du Commerce, Gombe"
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Notes / Devis habituels</label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Tarifs négociés, délais de livraison..."
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white resize-none"
            />
          </div>

          <div className="pt-3 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-3 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-xs disabled:opacity-50"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
