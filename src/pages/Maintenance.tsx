import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteField, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { 
  Wrench, 
  ArrowLeft, 
  Trash2, 
  UserCheck, 
  Check 
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PhotoModal } from '../components/PhotoModal';
import toast from 'react-hot-toast';

import { PreventiveMaintenanceManager } from '../components/PreventiveMaintenanceManager';
import { TechnicianManager } from '../components/TechnicianManager';

export function Maintenance() {
  const [issues, setIssues] = useState<any[]>([]);
  const [tenantsMap, setTenantsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [respondingToIssue, setRespondingToIssue] = useState<any>(null);
  const [issueToDelete, setIssueToDelete] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<'issues' | 'preventive' | 'technicians'>('issues');
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'in_progress' | 'done'>('all');

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
      data.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setIssues(data);
      setLoading(false);
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'maintenance'); });

    return () => {
      unsubTenants();
      unsubMaintenance();
    };
  }, []);

  const deleteIssue = async () => {
    if (!issueToDelete) return;
    try {
      await deleteDoc(doc(db, 'maintenance', issueToDelete));
      toast.success("Signalement supprimé avec succès.");
      setIssueToDelete(null);
    } catch (error) {
      console.error("Error deleting issue", error);
      toast.error("Erreur lors de la suppression.");
    }
  };

  const handleQuickValidate = async (issue: any) => {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'maintenance', issue.id), {
        status: 'Clôturée',
        closedAt: now,
        updatedAt: now
      });
      toast.success("Intervention validée et clôturée avec succès !");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la validation.");
    }
  };

  const filteredIssues = issues.filter(i => {
    if (filterTab === 'all') return true;
    if (filterTab === 'pending') return ['En attente', 'Nouvelle', 'En attente d\'acceptation'].includes(i.status);
    if (filterTab === 'in_progress') return ['En cours', 'Acceptée', 'En attente de pièces'].includes(i.status);
    if (filterTab === 'done') return ['Terminée', 'Clôturée', 'Résolu'].includes(i.status);
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Clôturée':
      case 'Résolu':
        return { label: status === 'Clôturée' ? 'Clôturée' : 'Résolu', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' };
      case 'Terminée':
        return { label: 'Terminée par technicien', class: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 ring-2 ring-teal-400' };
      case 'En cours':
      case 'Acceptée':
        return { label: status, class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' };
      case 'En attente de pièces':
        return { label: 'Attente pièces', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' };
      default:
        return { label: status || 'En attente', class: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' };
    }
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link to="/" className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-xs border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium text-xs sm:text-sm">
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" /> Retour au tableau de bord
        </Link>
      </div>

      {/* Main Section Navigation */}
      <div className="flex overflow-x-auto gap-2 border-b border-gray-200 dark:border-gray-700 pb-3 scrollbar-none">
        <button
          onClick={() => setMainTab('issues')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            mainTab === 'issues'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Interventions & Dépannages</span>
          <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">{issues.length}</span>
        </button>

        <button
          onClick={() => setMainTab('preventive')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            mainTab === 'preventive'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Maintenance Préventive</span>
        </button>

        <button
          onClick={() => setMainTab('technicians')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            mainTab === 'technicians'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Prestataires & Techniciens</span>
        </button>
      </div>

      {mainTab === 'preventive' ? (
        <PreventiveMaintenanceManager />
      ) : mainTab === 'technicians' ? (
        <TechnicianManager />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white transition-colors">
                Signalements & Interventions Techniques
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                Gérez les pannes, attribuez des techniciens de maintenance et validez les rapports de travaux.
              </p>
            </div>

            {/* Tab Filters */}
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
              {[
                { id: 'all', label: `Tous (${issues.length})` },
                { id: 'pending', label: 'En attente' },
                { id: 'in_progress', label: 'En cours' },
                { id: 'done', label: 'Terminés' },
              ].map((tab: any) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterTab === tab.id
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>)}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIssues.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 transition-colors">
              <Wrench className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">Aucun signalement</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Aucun problème de maintenance enregistré sous ce filtre.
              </p>
            </div>
          ) : (
            filteredIssues.map(issue => {
              const tenant = tenantsMap[issue.tenantId];
              const badge = getStatusBadge(issue.status);
              const isTerminatedByTech = issue.status === 'Terminée';
              const ticketRef = issue.ticketNumber || `INT-${issue.id.substring(0, 6).toUpperCase()}`;

              return (
                <div 
                  key={issue.id} 
                  className={`bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl shadow-xs border transition-all card-enter ${
                    isTerminatedByTech
                      ? 'border-teal-400 dark:border-teal-600 bg-teal-50/20 dark:bg-teal-950/10'
                      : 'border-gray-100 dark:border-gray-700/80 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md">
                          #{ticketRef}
                        </span>

                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${badge.class}`}>
                          {badge.label}
                        </span>

                        {issue.priority && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            {issue.priority}
                          </span>
                        )}

                        <span className="text-[11px] text-gray-400">
                          {issue.createdAt ? format(new Date(issue.createdAt), 'dd MMM yyyy', { locale: fr }) : 'Récemment'}
                        </span>

                        {issue.cost !== undefined && Number(issue.cost) > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                            Total : {issue.cost} $
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-extrabold text-gray-900 dark:text-white break-words">
                        {issue.description}
                      </h3>

                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Signalé par : <span className="font-semibold text-gray-800 dark:text-gray-200">{tenant?.name || issue.tenantName || 'Locataire'}</span> ({tenant?.address || issue.propertyName}) {tenant?.phone && `• ${tenant.phone}`}
                      </p>

                      {/* Assigned technician badge */}
                      {issue.assignedTechnicianName && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Technicien assigné : {issue.assignedTechnicianName}</span>
                          {issue.assignedTechnicianPhone && <span className="text-amber-600">({issue.assignedTechnicianPhone})</span>}
                        </div>
                      )}

                      {/* Technician report if finished */}
                      {issue.technicianNotes && (
                        <div className="p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800 text-xs text-gray-700 dark:text-gray-300 space-y-1">
                          <p className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                            <span>Rapport du technicien :</span>
                          </p>
                          <p className="italic">« {issue.technicianNotes} »</p>
                          {issue.partsUsed && (
                            <p className="text-[11px] text-gray-500">
                              <strong>Fournitures :</strong> {issue.partsUsed} {issue.partsCost ? `(${issue.partsCost} $)` : ''}
                            </p>
                          )}
                        </div>
                      )}

                      {issue.notes && !issue.technicianNotes && (
                        <p className="text-[11px] text-gray-600 dark:text-gray-300 italic bg-gray-50 dark:bg-gray-900/40 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                          <strong>Note bailleur :</strong> {issue.notes}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap md:flex-col items-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100 dark:border-gray-800">
                      {isTerminatedByTech && (
                        <button
                          onClick={() => handleQuickValidate(issue)}
                          className="px-3 py-1.5 text-xs font-black bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Valider & Clôturer</span>
                        </button>
                      )}

                      <div className="flex items-center gap-1.5">
                        {issue.photoUrl && (
                          <button
                            onClick={() => setShowPhoto(issue.photoUrl)}
                            className="px-2.5 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
                          >
                            Photo
                          </button>
                        )}

                        <button
                          onClick={() => setRespondingToIssue(issue)}
                          className="px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/60 transition-colors cursor-pointer"
                        >
                          Gérer / Assigner
                        </button>

                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIssueToDelete(issue.id); }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
      </>
      )}

      {/* Confirmation modal delete */}
      {issueToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Confirmer la suppression</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-6">
              Êtes-vous sûr de vouloir supprimer ce dossier ? Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIssueToDelete(null)} 
                className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer text-xs"
              >
                Annuler
              </button>
              <button 
                onClick={deleteIssue}
                className="flex-1 py-2.5 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors cursor-pointer text-xs"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal respond / assign technician */}
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
    priority: issue.priority || 'Moyenne',
    status: issue.status === 'En attente' ? 'En cours' : issue.status,
    assignedTechnicianName: issue.assignedTechnicianName || '',
    assignedTechnicianPhone: issue.assignedTechnicianPhone || '',
    scheduledDate: issue.scheduledDate || ''
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
        priority: formData.priority,
        assignedTechnicianName: formData.assignedTechnicianName,
        assignedTechnicianPhone: formData.assignedTechnicianPhone,
        scheduledDate: formData.scheduledDate,
        updatedAt: now
      };
      
      if (formData.status === 'Résolu' || formData.status === 'Clôturée') {
        updateData.endDate = now;
        updateData.closedAt = now;
      } else {
        updateData.endDate = deleteField();
      }
      
      if (formData.cost) updateData.cost = numCost;
      if (formData.duration) updateData.duration = formData.duration;

      // Handle guarantee deduction if resolved and has cost
      if ((formData.status === 'Résolu' || formData.status === 'Clôturée') && numCost > 0) {
        const tenantRef = doc(db, 'tenants', issue.tenantId);
        const tenantSnap = await getDoc(tenantRef);
        if (tenantSnap.exists()) {
          const tenantData = tenantSnap.data();
          const newGuarantee = (tenantData.guaranteeAmount || 0) - numCost;
          let guaranteeStatus = tenantData.guaranteeStatus;
          if (newGuarantee <= 0) guaranteeStatus = 'Non payée';
          else if (newGuarantee < (tenantData.monthlyRent * 3)) guaranteeStatus = 'Partielle';
          
          await updateDoc(tenantRef, { guaranteeAmount: newGuarantee, guaranteeStatus });
          
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
      toast.success("Dossier d'intervention mis à jour !");
      onClose();
    } catch (err) {
      console.error("Error updating issue", err);
      setError("Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 transition-colors">
        <h2 className="text-lg font-black text-gray-900 dark:text-white mb-1">
          Gestion de l'Intervention & Attribution
        </h2>
        <p className="text-xs text-gray-500 mb-4">{issue.description}</p>
        
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-xs">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Statut d'intervention</label>
              <select 
                value={formData.status} 
                onChange={e => setFormData({...formData, status: e.target.value})} 
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl outline-none"
              >
                <option value="Nouvelle">Nouvelle</option>
                <option value="En attente">En attente</option>
                <option value="En attente d'acceptation">En attente d'acceptation</option>
                <option value="Acceptée">Acceptée par technicien</option>
                <option value="En cours">En cours de travaux</option>
                <option value="En attente de pièces">En attente de pièces</option>
                <option value="Terminée">Terminée (À valider)</option>
                <option value="Clôturée">Clôturée & Validée</option>
                <option value="Résolu">Résolu (avec déduction)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Niveau d'urgence</label>
              <select 
                value={formData.priority} 
                onChange={e => setFormData({...formData, priority: e.target.value})} 
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl outline-none"
              >
                <option value="Basse">Basse</option>
                <option value="Moyenne">Moyenne</option>
                <option value="Haute">Haute</option>
                <option value="Urgente">Urgente</option>
              </select>
            </div>
          </div>

          {/* Technician Assignment */}
          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-amber-200/60 dark:border-amber-900/40 space-y-2">
            <span className="font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              Attribution du Technicien de Maintenance
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-0.5">Nom du technicien</label>
                <input 
                  type="text" 
                  value={formData.assignedTechnicianName} 
                  onChange={e => setFormData({...formData, assignedTechnicianName: e.target.value})} 
                  className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none" 
                  placeholder="Ex: David Mwamba" 
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-0.5">Téléphone / WhatsApp</label>
                <input 
                  type="text" 
                  value={formData.assignedTechnicianPhone} 
                  onChange={e => setFormData({...formData, assignedTechnicianPhone: e.target.value})} 
                  className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none" 
                  placeholder="+243..." 
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-0.5">Date prévue d'intervention</label>
              <input 
                type="date" 
                value={formData.scheduledDate} 
                onChange={e => setFormData({...formData, scheduledDate: e.target.value})} 
                className="w-full p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Coût estimé ou réel ($)</label>
              <input 
                type="number" 
                min="0" 
                value={formData.cost} 
                onChange={e => setFormData({...formData, cost: e.target.value})} 
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl outline-none" 
                placeholder="0" 
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Durée estimée</label>
              <input 
                type="text" 
                value={formData.duration} 
                onChange={e => setFormData({...formData, duration: e.target.value})} 
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl outline-none" 
                placeholder="Ex: 2 heures" 
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Instructions ou Message au locataire</label>
            <textarea 
              rows={3} 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})} 
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl outline-none resize-none" 
              placeholder="Ex: Le technicien est prévenu et interviendra avec les pièces nécessaires." 
            />
          </div>
          
          <div className="pt-3 flex gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-50 cursor-pointer"
            >
              Annuler
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
