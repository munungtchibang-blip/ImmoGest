import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteField, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { 
  Wrench, 
  ArrowLeft, 
  Trash2, 
  UserCheck, 
  Check,
  Plus,
  CreditCard,
  DollarSign,
  FileText,
  AlertTriangle,
  X,
  Smartphone
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PhotoModal } from '../components/PhotoModal';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { PreventiveMaintenanceManager } from '../components/PreventiveMaintenanceManager';
import { TechnicianManager } from '../components/TechnicianManager';

export function Maintenance() {
  const [issues, setIssues] = useState<any[]>([]);
  const [tenantsMap, setTenantsMap] = useState<Record<string, any>>({});
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingToIssue, setRespondingToIssue] = useState<any>(null);
  const [payingIssue, setPayingIssue] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [issueToDelete, setIssueToDelete] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<'issues' | 'preventive' | 'technicians'>('issues');
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'in_progress' | 'quotes' | 'done'>('all');

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

    const unsubTechnicians = onSnapshot(query(collection(db, 'technicians'), where('landlordId', '==', uid)), (snap) => {
      const tData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTechnicians(tData);
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'technicians'); });

    const unsubProperties = onSnapshot(query(collection(db, 'properties'), where('landlordId', '==', uid)), (snap) => {
      const pData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProperties(pData);
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'properties'); });

    const unsubMaintenance = onSnapshot(query(collection(db, 'maintenance'), where('landlordId', '==', uid)), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      data.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setIssues(data);
      setLoading(false);
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'maintenance'); });

    return () => {
      unsubTenants();
      unsubTechnicians();
      unsubProperties();
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

  const handleApproveQuote = async (issue: any) => {
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'maintenance', issue.id), {
        'quote.status': 'Approuvé',
        'quote.approvedAt': now,
        status: 'Devis approuvé',
        cost: issue.quote?.total || issue.cost || 0,
        updatedAt: now
      });
      toast.success("Devis approuvé avec succès ! Vous pouvez maintenant procéder au règlement.");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'approbation du devis.");
    }
  };

  const handleRefuseQuote = async (issue: any) => {
    const reason = prompt("Indiquez le motif du refus ou de la demande de révision :");
    if (reason === null) return;
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'maintenance', issue.id), {
        'quote.status': 'Refusé',
        'quote.refusalReason': reason,
        'quote.refusedAt': now,
        status: 'Devis refusé',
        updatedAt: now
      });
      toast.success("Devis refusé. Le technicien en a été notifié.");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du refus du devis.");
    }
  };

  const filteredIssues = issues.filter(i => {
    if (filterTab === 'all') return true;
    if (filterTab === 'pending') return ['En attente', 'Nouvelle', 'En attente d\'acceptation'].includes(i.status);
    if (filterTab === 'quotes') return ['Devis soumis', 'Devis approuvé'].includes(i.status) || Boolean(i.quote);
    if (filterTab === 'in_progress') return ['En cours', 'Acceptée', 'En attente de pièces', 'Devis approuvé'].includes(i.status);
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
      case 'Devis soumis':
        return { label: 'Devis à approuver', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 font-bold' };
      case 'Devis approuvé':
        return { label: 'Devis approuvé (À payer)', class: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 font-bold' };
      case 'Payé':
        return { label: 'Payé en ligne', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' };
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

        {mainTab === 'issues' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all btn-interact cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Déclarer une réparation / Déclarer un coût</span>
          </button>
        )}
      </div>

      {/* Main Section Navigation */}
      <div className="flex overflow-x-auto gap-2 border-b border-gray-200 dark:border-gray-700 pb-3 scrollbar-none">
        <button
          onClick={() => setMainTab('issues')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
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
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
            mainTab === 'preventive'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span>Maintenance Préventive</span>
        </button>

        <button
          onClick={() => setMainTab('technicians')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
            mainTab === 'technicians'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Prestataires & Techniciens ({technicians.length})</span>
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
                Gérez les pannes, attribuez des techniciens parmi vos prestataires enregistrés et validez les devis.
              </p>
            </div>

            {/* Tab Filters */}
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto scrollbar-none">
              {[
                { id: 'all', label: `Tous (${issues.length})` },
                { id: 'pending', label: 'En attente' },
                { id: 'quotes', label: `Devis (${issues.filter(i => Boolean(i.quote)).length})` },
                { id: 'in_progress', label: 'En cours' },
                { id: 'done', label: 'Terminés' },
              ].map((tab: any) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
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
              const hasQuote = Boolean(issue.quote);

              return (
                <div 
                  key={issue.id} 
                  className={`bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl shadow-xs border transition-all card-enter ${
                    isTerminatedByTech
                      ? 'border-teal-400 dark:border-teal-600 bg-teal-50/20 dark:bg-teal-950/10'
                      : hasQuote && issue.status === 'Devis soumis'
                      ? 'border-purple-300 dark:border-purple-800 bg-purple-50/20 dark:bg-purple-950/10'
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

                        {issue.category && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {issue.category}
                          </span>
                        )}

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
                            Coût : {issue.cost} $
                          </span>
                        )}

                        {issue.paidOffline && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            Réglé hors plateforme
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-extrabold text-gray-900 dark:text-white break-words">
                        {issue.description || issue.title}
                      </h3>

                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Bien concerné : <span className="font-semibold text-gray-800 dark:text-gray-200">{issue.propertyName || tenant?.address || 'Immeuble'}</span>
                        {tenant?.name && ` • Locataire : ${tenant.name}`}
                      </p>

                      {/* Assigned technician badge */}
                      {issue.assignedTechnicianName ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Technicien assigné : {issue.assignedTechnicianName}</span>
                          {issue.assignedTechnicianSpecialty && <span className="text-amber-700">({issue.assignedTechnicianSpecialty})</span>}
                          {issue.assignedTechnicianPhone && <span className="text-amber-600">({issue.assignedTechnicianPhone})</span>}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Aucun technicien assigné</span>
                        </div>
                      )}

                      {/* Quote preview card if submitted */}
                      {hasQuote && (
                        <div className="p-3 bg-purple-50/70 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-900/40 text-xs space-y-1.5 mt-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5" />
                              Devis Technicien : {issue.quote.reference || 'Devis'}
                            </span>
                            <span className="font-mono font-black text-purple-900 dark:text-purple-100 text-sm">
                              {issue.quote.total} $ USD
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-600 dark:text-gray-300">
                            <div>Matériaux : <strong>{issue.quote.materialsCost || 0} $</strong></div>
                            <div>Main d'œuvre : <strong>{issue.quote.laborCost || 0} $</strong></div>
                            <div>Déplacement : <strong>{issue.quote.travelCost || 0} $</strong></div>
                            <div>Délai : <strong>{issue.quote.duration || 'N/A'}</strong></div>
                          </div>
                          {issue.quote.diagnostic && (
                            <p className="text-[11px] text-gray-500 italic">« {issue.quote.diagnostic} »</p>
                          )}
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
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap md:flex-col items-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100 dark:border-gray-800">
                      {/* Quote actions */}
                      {hasQuote && issue.status === 'Devis soumis' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleApproveQuote(issue)}
                            className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                          >
                            Approuver devis
                          </button>
                          <button
                            onClick={() => handleRefuseQuote(issue)}
                            className="px-2.5 py-1 text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 rounded-lg transition-colors cursor-pointer"
                          >
                            Refuser
                          </button>
                        </div>
                      )}

                      {/* Pay repair button if approved */}
                      {issue.status === 'Devis approuvé' && (
                        <button
                          onClick={() => setPayingIssue(issue)}
                          className="px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer btn-interact"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Payer la réparation ({issue.cost || issue.quote?.total || 0} $)</span>
                        </button>
                      )}

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
        <RespondModal 
          issue={respondingToIssue} 
          technicians={technicians}
          onClose={() => setRespondingToIssue(null)} 
        />
      )}

      {/* Modal declare new repair by landlord */}
      {showCreateModal && (
        <CreateRepairModal 
          properties={properties}
          technicians={technicians}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Modal Pay repair */}
      {payingIssue && (
        <PayRepairModal 
          issue={payingIssue} 
          onClose={() => setPayingIssue(null)} 
        />
      )}
      
      {showPhoto && <PhotoModal url={showPhoto} onClose={() => setShowPhoto(null)} />}
    </div>
  );
}

// ----------------------------------------------------
// MODAL: RESPOND & ASSIGN TECHNICIAN (WITH REGISTERED TECHNICIAN SELECTION)
// ----------------------------------------------------
function RespondModal({ issue, technicians, onClose }: { issue: any, technicians: any[], onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTechId, setSelectedTechId] = useState(issue.assignedTechnicianId || '');
  const [formData, setFormData] = useState({
    notes: issue.notes || '',
    cost: issue.cost?.toString() || '',
    duration: issue.duration || '',
    priority: issue.priority || 'Moyenne',
    status: issue.status === 'En attente' ? 'En cours' : issue.status,
    assignedTechnicianName: issue.assignedTechnicianName || '',
    assignedTechnicianPhone: issue.assignedTechnicianPhone || '',
    assignedTechnicianSpecialty: issue.assignedTechnicianSpecialty || '',
    scheduledDate: issue.scheduledDate || ''
  });

  // When technician selection changes, auto-fill details from registered technician list
  const handleTechSelect = (techId: string) => {
    setSelectedTechId(techId);
    if (!techId) {
      setFormData(prev => ({
        ...prev,
        assignedTechnicianName: '',
        assignedTechnicianPhone: '',
        assignedTechnicianSpecialty: ''
      }));
      return;
    }
    const tech = technicians.find(t => t.id === techId);
    if (tech) {
      setFormData(prev => ({
        ...prev,
        assignedTechnicianName: tech.name || '',
        assignedTechnicianPhone: tech.phone || '',
        assignedTechnicianSpecialty: tech.specialty || ''
      }));
    }
  };

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
        assignedTechnicianId: selectedTechId || deleteField(),
        assignedTechnicianName: formData.assignedTechnicianName,
        assignedTechnicianPhone: formData.assignedTechnicianPhone,
        assignedTechnicianSpecialty: formData.assignedTechnicianSpecialty,
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
      if ((formData.status === 'Résolu' || formData.status === 'Clôturée') && numCost > 0 && issue.tenantId) {
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
            notes: `Déduction pour signalement: ${issue.description || issue.title}`,
            tenantId: issue.tenantId,
            landlordId: auth.currentUser.uid,
            createdAt: now
          });
        }
      }

      await updateDoc(doc(db, 'maintenance', issue.id), updateData);
      toast.success("Dossier d'intervention et attribution mis à jour !");
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
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 transition-colors modal-enter">
        <h2 className="text-lg font-black text-gray-900 dark:text-white mb-1">
          Gestion de l'Intervention & Attribution
        </h2>
        <p className="text-xs text-gray-500 mb-4">{issue.description || issue.title}</p>
        
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
                <option value="Devis soumis">Devis soumis</option>
                <option value="Devis approuvé">Devis approuvé</option>
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

          {/* TECHNICIAN ATTRIBUTION FROM REGISTERED TECHNICIANS LIST */}
          <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 rounded-2xl border border-amber-200/80 dark:border-amber-900/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                Choisir parmi vos techniciens enregistrés
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold">
                {technicians.length} prestataire(s)
              </span>
            </div>

            {/* Dropdown with registered technicians */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                Sélectionner un technicien agréé
              </label>
              <select
                value={selectedTechId}
                onChange={e => handleTechSelect(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 text-gray-900 dark:text-white rounded-xl outline-none font-medium"
              >
                <option value="">-- Aucun technicien assigné (ou saisie manuelle) --</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} • {t.specialty || 'Tous corps'} {t.phone ? `(${t.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

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

// ----------------------------------------------------
// MODAL: CREATE REPAIR / DECLARE REPAIR COST BY LANDLORD
// ----------------------------------------------------
function CreateRepairModal({ properties, technicians, onClose }: { properties: any[], technicians: any[], onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [propertyId, setPropertyId] = useState(properties[0]?.id || '');
  const [category, setCategory] = useState('Plomberie');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('Moyenne');
  const [cost, setCost] = useState('');
  const [selectedTechId, setSelectedTechId] = useState('');
  const [paidOffline, setPaidOffline] = useState(false);
  const [offlineMethod, setOfflineMethod] = useState('Espèces');
  const [photoUrl, setPhotoUrl] = useState('');

  const REPAIR_CATEGORIES = [
    'Plomberie',
    'Électricité',
    'Menuiserie',
    'Serrurerie',
    'Maçonnerie',
    'Peinture',
    'Climatisation',
    'Toiture',
    'Installations sanitaires',
    'Équipement & Électroménager',
    'Autre réparation'
  ];

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!title.trim()) {
      toast.error("Veuillez renseigner une description des travaux.");
      return;
    }

    setLoading(true);
    try {
      const now = new Date().toISOString();
      const numCost = Number(cost) || 0;
      const prop = properties.find(p => p.id === propertyId);
      const tech = technicians.find(t => t.id === selectedTechId);

      const ticketNumber = `INT-${Date.now().toString().slice(-6)}`;

      const newIssue: any = {
        ticketNumber,
        title: `${category} - ${title.slice(0, 30)}`,
        description: title.trim(),
        category,
        priority,
        propertyId: propertyId || '',
        propertyName: prop?.name || 'Bien immobilier',
        tenantId: '',
        landlordId: auth.currentUser.uid,
        status: paidOffline ? 'Clôturée' : selectedTechId ? 'En cours' : 'Nouvelle',
        cost: numCost,
        paidOffline: paidOffline,
        offlinePaymentMethod: paidOffline ? offlineMethod : undefined,
        assignedTechnicianId: tech?.id || '',
        assignedTechnicianName: tech?.name || '',
        assignedTechnicianPhone: tech?.phone || '',
        assignedTechnicianSpecialty: tech?.specialty || '',
        photoUrl: photoUrl || undefined,
        createdAt: now,
        updatedAt: now
      };

      await addDoc(collection(db, 'maintenance'), newIssue);

      // If declared as already paid offline, also register it in expenses
      if (paidOffline && numCost > 0) {
        await addDoc(collection(db, 'expenses'), {
          amount: numCost,
          category: 'Travaux & Réparations',
          description: `Réparation #${ticketNumber} : ${title} (${category})`,
          date: now,
          landlordId: auth.currentUser.uid,
          propertyId: propertyId || '',
          method: offlineMethod,
          createdAt: now
        });
      }

      toast.success("Réparation enregistrée avec succès !");
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 transition-colors modal-enter">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Déclarer une réparation</h2>
              <p className="text-xs text-gray-500">Attribuez un technicien ou enregistrez un coût de travaux</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Bien immobilier</label>
              <select
                value={propertyId}
                onChange={e => setPropertyId(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl outline-none"
              >
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Catégorie de travaux</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl outline-none"
              >
                {REPAIR_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Description détaillée du problème / des travaux</label>
            <textarea
              rows={3}
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Remplacement du robinet mitigeur de la salle de bain et étanchéité du siphon."
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl outline-none resize-none"
            />
          </div>

          {/* TECHNICIAN ASSIGNMENT DROPDOWN */}
          <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 rounded-2xl border border-amber-200/80 dark:border-amber-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                Choisir le technicien à qui donner la tâche
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-300">
                {technicians.length} prestataire(s) enregistrés
              </span>
            </div>
            
            <select
              value={selectedTechId}
              onChange={e => setSelectedTechId(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 text-gray-900 dark:text-white rounded-xl outline-none font-medium"
            >
              <option value="">-- Aucun technicien assigné pour le moment --</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} • {t.specialty || 'Tous corps'} {t.phone ? `(${t.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Niveau d'urgence</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl outline-none"
              >
                <option value="Basse">Basse</option>
                <option value="Moyenne">Moyenne</option>
                <option value="Haute">Haute</option>
                <option value="Urgente">Urgente</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Coût des travaux ($ USD)</label>
              <input
                type="number"
                min="0"
                value={cost}
                onChange={e => setCost(e.target.value)}
                placeholder="Ex: 45"
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl outline-none"
              />
            </div>
          </div>

          {/* Option: Dépense déjà réglée personnellement hors plateforme */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800 dark:text-gray-200">
              <input
                type="checkbox"
                checked={paidOffline}
                onChange={e => setPaidOffline(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Dépense déjà payée personnellement hors plateforme</span>
            </label>
            {paidOffline && (
              <div className="pt-1 flex items-center gap-3">
                <span className="text-[11px] text-gray-500">Moyen de règlement :</span>
                {['Espèces', 'Virement', 'Airtel Money direct', 'M-Pesa direct'].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setOfflineMethod(m)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                      offlineMethod === m
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">Photo justificative (optionnelle)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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
              {loading ? 'Enregistrement...' : 'Enregistrer la réparation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// MODAL: PAY REPAIR (ONLINE MOBILE MONEY / VISA / OFFLINE)
// ----------------------------------------------------
function PayRepairModal({ issue, onClose }: { issue: any, onClose: () => void }) {
  const [method, setMethod] = useState<'mobile' | 'visa' | 'offline'>('mobile');
  const [provider, setProvider] = useState('M-Pesa');
  const [phone, setPhone] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [offlineNote, setOfflineNote] = useState('');
  const [loading, setLoading] = useState(false);

  const amountToPay = Number(issue.cost || issue.quote?.total || 0);

  const downloadRepairReceiptPDF = (payRef: string, payMethod: string) => {
    const docPdf = new jsPDF();
    docPdf.setFillColor(30, 58, 138);
    docPdf.rect(0, 0, 210, 40, 'F');
    
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(20);
    docPdf.text("REÇU OFFICIEL DE RÉPARATION", 105, 25, { align: "center" });

    docPdf.setTextColor(31, 41, 55);
    docPdf.setFontSize(10);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(`Réf Paiement: ${payRef}`, 14, 50);
    docPdf.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 140, 50);

    autoTable(docPdf, {
      startY: 65,
      head: [['Désignation', 'Intervention', 'Bénéficiaire / Technicien', 'Moyen', 'Montant Payé']],
      body: [[
        issue.title || issue.description,
        issue.ticketNumber || issue.id,
        issue.assignedTechnicianName || 'Prestataire agréé',
        payMethod,
        `${amountToPay} $ USD`
      ]],
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] }
    });

    const finalY = (docPdf as any).lastAutoTable?.finalY || 120;
    docPdf.setFontSize(10);
    docPdf.text("Paiement certifié et enregistré dans l'application ImmoGest Kinshasa.", 14, finalY + 15);
    docPdf.save(`recu_reparation_${payRef}.pdf`);
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);

    try {
      const now = new Date().toISOString();
      const payRef = `REC-REP-${Date.now().toString().slice(-6)}`;
      const selectedMethodLabel = method === 'mobile' ? `Mobile Money (${provider})` : method === 'visa' ? 'Carte VISA' : 'Règlement hors plateforme';

      // 1. Update maintenance ticket
      await updateDoc(doc(db, 'maintenance', issue.id), {
        status: 'Payé',
        paidAt: now,
        paymentReference: payRef,
        paymentMethod: selectedMethodLabel,
        cost: amountToPay,
        updatedAt: now
      });

      // 2. Add expense record
      await addDoc(collection(db, 'expenses'), {
        amount: amountToPay,
        category: 'Travaux & Réparations',
        description: `Paiement réparation #${issue.ticketNumber || issue.id.substring(0, 6)} : ${issue.title || issue.description}`,
        date: now,
        landlordId: auth.currentUser.uid,
        propertyId: issue.propertyId || '',
        paymentMethod: selectedMethodLabel,
        reference: payRef,
        createdAt: now
      });

      // 3. Notify technician if assigned
      if (issue.assignedTechnicianId) {
        await addDoc(collection(db, 'notifications'), {
          userId: issue.assignedTechnicianId,
          landlordId: auth.currentUser.uid,
          type: 'maintenance',
          title: `Paiement confirmé : ${amountToPay} $`,
          message: `Le propriétaire a réglé les frais de ${amountToPay} $ pour l'intervention #${issue.ticketNumber || issue.id.substring(0, 6)}. Les travaux peuvent démarrer.`,
          createdAt: now,
          read: false
        });
      }

      toast.success("Paiement validé avec succès ! Reçu généré.");
      downloadRepairReceiptPDF(payRef, selectedMethodLabel);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de la validation du paiement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl max-w-md w-full p-6 transition-colors modal-enter space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Règlement de la réparation</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-center">
          <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Montant à régler :</span>
          <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100 mt-0.5">{amountToPay} $ USD</div>
          <p className="text-[11px] text-gray-500 mt-1 truncate">{issue.title || issue.description}</p>
        </div>

        {/* Method selection */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMethod('mobile')}
            className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
              method === 'mobile'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                : 'border-gray-200 dark:border-gray-700 text-gray-600'
            }`}
          >
            <Smartphone className="w-4 h-4 mx-auto mb-1" />
            <span>Mobile Money</span>
          </button>

          <button
            type="button"
            onClick={() => setMethod('visa')}
            className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
              method === 'visa'
                ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                : 'border-gray-200 dark:border-gray-700 text-gray-600'
            }`}
          >
            <CreditCard className="w-4 h-4 mx-auto mb-1" />
            <span>Carte VISA</span>
          </button>

          <button
            type="button"
            onClick={() => setMethod('offline')}
            className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
              method === 'offline'
                ? 'border-amber-600 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                : 'border-gray-200 dark:border-gray-700 text-gray-600'
            }`}
          >
            <DollarSign className="w-4 h-4 mx-auto mb-1" />
            <span>Déjà réglé</span>
          </button>
        </div>

        <form onSubmit={handleProcessPayment} className="space-y-3 text-xs">
          {method === 'mobile' && (
            <div className="space-y-2">
              <label className="block font-bold text-gray-700 dark:text-gray-300">Opérateur Mobile Money (RDC)</label>
              <div className="grid grid-cols-4 gap-1.5">
                {['M-Pesa', 'Airtel Money', 'Orange Money', 'Afrimoney'].map(op => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => setProvider(op)}
                    className={`p-1.5 rounded-lg border text-center text-[10px] font-bold ${
                      provider === op
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {op}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Numéro de téléphone payeur</label>
                <input
                  type="tel"
                  required
                  placeholder="0812345678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none"
                />
              </div>
            </div>
          )}

          {method === 'visa' && (
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Numéro de Carte VISA</label>
                <input
                  type="text"
                  required
                  maxLength={19}
                  placeholder="4000 1234 5678 9010"
                  value={cardNumber}
                  onChange={e => setCardNumber(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Expiration</label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    placeholder="MM/AA"
                    value={cardExpiry}
                    onChange={e => setCardExpiry(e.target.value)}
                    className="w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-center"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">CVV</label>
                  <input
                    type="password"
                    required
                    maxLength={4}
                    placeholder="123"
                    value={cardCvv}
                    onChange={e => setCardCvv(e.target.value)}
                    className="w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none text-center"
                  />
                </div>
              </div>
            </div>
          )}

          {method === 'offline' && (
            <div>
              <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">Remarques ou mode de règlement en direct</label>
              <textarea
                rows={2}
                value={offlineNote}
                onChange={e => setOfflineNote(e.target.value)}
                placeholder="Ex: Payé en espèces de la main à la main au technicien après fin des travaux."
                className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none resize-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 btn-interact"
          >
            {loading ? "Traitement..." : `Confirmer le règlement (${amountToPay} $)`}
          </button>
        </form>
      </div>
    </div>
  );
}
