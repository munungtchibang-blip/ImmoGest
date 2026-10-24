import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs, deleteField, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { Wrench, Plus, CheckCircle2, Clock, AlertCircle, ArrowLeft, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PhotoModal } from '../components/PhotoModal';

export function Maintenance() {
  const [issues, setIssues] = useState<any[]>([]);
  const [tenantsMap, setTenantsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [respondingToIssue, setRespondingToIssue] = useState<any>(null);
  const [issueToDelete, setIssueToDelete] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const unsubTenants = onSnapshot(query(collection(db, 'tenants'), where('landlordId', '==', uid)), (snap) => {
      const map: Record<string, any> = {};
      snap.forEach(doc => {
        map[doc.id] = { id: doc.id, ...doc.data() };
      });
      setTenantsMap(map);
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'tenants'); });

    const unsubMaintenance = onSnapshot(query(collection(db, 'maintenance'), where('landlordId', '==', uid)), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setIssues(data);
      setLoading(false);
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'maintenance'); });

    return () => {
      unsubTenants();
      unsubMaintenance();
    };
  }, []);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const updateData: any = {
        status: newStatus,
        updatedAt: new Date().toISOString()
      };
      if (newStatus === 'Résolu') {
        updateData.endDate = new Date().toISOString();
      } else {
        updateData.endDate = deleteField();
      }
      
      await updateDoc(doc(db, 'maintenance', id), updateData);
    } catch (error) {
      console.error("Error updating status", error);
    }
  };

  const deleteIssue = async () => {
    if (!issueToDelete) return;
    try {
      await deleteDoc(doc(db, 'maintenance', issueToDelete));
      setIssueToDelete(null);
    } catch (error) {
      console.error("Error deleting issue", error);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Retour au tableau de bord
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">Problèmes & Maintenance</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">Gérez les signalements de vos locataires.</p>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
        </div>
      ) : (
        <div className="space-y-2.5">
          {issues.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 transition-colors">
              <Wrench className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Aucun problème signalé.</p>
            </div>
          ) : (
            issues.map(issue => {
              const tenant = tenantsMap[issue.tenantId];
              return (
                <div key={issue.id} className="bg-white dark:bg-gray-800 p-3.5 sm:p-4 rounded-xl shadow-xs border border-gray-100 dark:border-gray-700/80 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-blue-300 dark:hover:border-blue-700 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        issue.status === 'Résolu' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                        issue.status === 'En cours' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                        'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>
                        {issue.status === 'Résolu' && <CheckCircle2 className="w-3 h-3" />}
                        {issue.status === 'En cours' && <Clock className="w-3 h-3" />}
                        {issue.status === 'En attente' && <AlertCircle className="w-3 h-3" />}
                        {issue.status}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {format(new Date(issue.createdAt), 'dd MMM yyyy', { locale: fr })}
                      </span>
                      {issue.cost !== undefined && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          Coût : {issue.cost} $
                        </span>
                      )}
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white break-words">{issue.description}</h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Signalé par : <span className="font-semibold">{tenant?.name || 'Locataire'}</span> ({tenant?.address}) {tenant?.phone && `• ${tenant.phone}`}
                    </p>
                    {issue.notes && (
                      <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 italic bg-gray-50 dark:bg-gray-900/40 p-1.5 rounded-lg border border-gray-100 dark:border-gray-800">
                        <strong>Note :</strong> {issue.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100 dark:border-gray-800 justify-end">
                    {issue.photoUrl && (
                      <button
                        onClick={() => setShowPhoto(issue.photoUrl)}
                        className="px-2.5 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        Photo
                      </button>
                    )}
                    <button
                      onClick={() => setRespondingToIssue(issue)}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800/60 transition-colors"
                    >
                      Évaluer
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIssueToDelete(issue.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {issueToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Confirmer la suppression</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Êtes-vous sûr de vouloir supprimer ce problème ? Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIssueToDelete(null)} 
                className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button 
                onClick={deleteIssue}
                className="flex-1 py-2.5 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors cursor-pointer"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {respondingToIssue && (
        <RespondModal issue={respondingToIssue} onClose={() => setRespondingToIssue(null)} />
      )}
      
      {showPhoto && <PhotoModal url={showPhoto} onClose={() => setShowPhoto(null)} />}
    </div>
  );
}

function RespondModal({ issue, onClose }: { issue: any, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    notes: issue.notes || '',
    cost: issue.cost?.toString() || '',
    duration: issue.duration || '',
    status: issue.status === 'En attente' ? 'En cours' : issue.status
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const numCost = formData.cost ? Number(formData.cost) : 0;
      
      const updateData: any = {
        notes: formData.notes,
        status: formData.status,
        updatedAt: now
      };
      
      if (formData.status === 'Résolu') {
        updateData.endDate = now;
      } else {
        updateData.endDate = deleteField();
      }
      
      if (formData.cost) updateData.cost = numCost;
      if (formData.duration) updateData.duration = formData.duration;

      // Handle guarantee deduction if resolved and has cost
      if (formData.status === 'Résolu' && numCost > 0) {
        const tenantRef = doc(db, 'tenants', issue.tenantId);
        const tenantSnap = await getDoc(tenantRef);
        if (tenantSnap.exists()) {
          const tenantData = tenantSnap.data();
          // Deduct from guarantee even if it goes negative (as requested)
          const newGuarantee = (tenantData.guaranteeAmount || 0) - numCost;
          let guaranteeStatus = tenantData.guaranteeStatus;
          if (newGuarantee <= 0) guaranteeStatus = 'Non payée';
          else if (newGuarantee < (tenantData.monthlyRent * 3)) guaranteeStatus = 'Partielle';
          
          await updateDoc(tenantRef, { guaranteeAmount: newGuarantee, guaranteeStatus });
          
          // Record the payment/deduction
          await addDoc(collection(db, 'payments'), {
            amount: numCost,
            date: now,
            method: 'Déduction Garantie',
            type: 'Dépenses / Réparations',
            notes: `Déduction pour signalement: ${issue.description}`,
            tenantId: issue.tenantId,
            landlordId: auth.currentUser.uid,
            createdAt: now
          });
        }
      }

      await updateDoc(doc(db, 'maintenance', issue.id), updateData);
      onClose();
    } catch (error) {
      console.error("Error updating issue", error);
      setError("Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 transition-colors">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Répondre au signalement</h2>
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut</label>
            <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="En attente">En attente</option>
              <option value="En cours">En cours</option>
              <option value="Résolu">Résolu (déduit de la garantie si coût &gt; 0)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Coût estimé ($)</label>
              <input type="number" min="0" value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Durée (jours/heures)</label>
              <input type="text" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ex: 2 jours" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message au locataire / Notes</label>
            <textarea rows={3} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="Ex: Un technicien passera demain matin..." />
          </div>
          
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Annuler</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {loading ? 'Envoi...' : 'Répondre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


