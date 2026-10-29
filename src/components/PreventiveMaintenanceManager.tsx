import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Plus, 
  Calendar, 
  CheckCircle2, 
  Layers, 
  DollarSign, 
  X, 
  Trash2, 
  Edit3, 
  PlayCircle
} from 'lucide-react';
import { format, addMonths, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import toast from 'react-hot-toast';

export interface Equipment {
  id: string;
  landlordId: string;
  propertyId: string;
  name: string;
  category: 'Pompe à eau' | 'Groupe électrogène' | 'Ascenseur' | 'Climatiseur' | 'Tableau électrique' | 'Citerne d\'eau' | 'Extincteur' | 'Portail motorisé' | 'Autre';
  brand?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyEnd?: string;
  status: 'Opérationnel' | 'En panne' | 'En révision' | 'Remplacé';
  location?: string;
  notes?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PreventiveTask {
  id: string;
  landlordId: string;
  equipmentId: string;
  propertyId: string;
  title: string;
  frequency: 'Mensuelle' | 'Trimestrielle' | 'Semestrielle' | 'Annuelle';
  nextDueDate: string;
  lastDoneDate?: string;
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  priority: 'Basse' | 'Moyenne' | 'Haute' | 'Urgente';
  status: 'Planifiée' | 'En retard' | 'En cours' | 'Terminée';
  checklist?: string;
  estimatedCost?: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

const EQUIPMENT_CATEGORIES = [
  'Groupe électrogène',
  'Pompe à eau',
  'Ascenseur',
  'Climatiseur',
  'Tableau électrique',
  'Citerne d\'eau',
  'Extincteur',
  'Portail motorisé',
  'Autre'
];

export function PreventiveMaintenanceManager() {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [tasks, setTasks] = useState<PreventiveTask[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [maintenanceIssues, setMaintenanceIssues] = useState<any[]>([]);

  // Sub-tabs
  const [activeTab, setActiveTab] = useState<'schedule' | 'equipment' | 'costs'>('schedule');

  // Modals
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<PreventiveTask | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const qEquip = query(collection(db, 'equipment'), where('landlordId', '==', uid));
    const unsubEquip = onSnapshot(qEquip, (snap) => {
      setEquipments(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Equipment[]);
    });

    const qTasks = query(collection(db, 'preventive_maintenance'), where('landlordId', '==', uid));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })) as PreventiveTask[]);
    });

    const qProps = query(collection(db, 'properties'), where('landlordId', '==', uid));
    const unsubProps = onSnapshot(qProps, (snap) => {
      setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qTech = query(collection(db, 'technicians'), where('landlordId', '==', uid));
    const unsubTech = onSnapshot(qTech, (snap) => {
      setTechnicians(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qMaint = query(collection(db, 'maintenance'), where('landlordId', '==', uid));
    const unsubMaint = onSnapshot(qMaint, (snap) => {
      setMaintenanceIssues(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubEquip();
      unsubTasks();
      unsubProps();
      unsubTech();
      unsubMaint();
    };
  }, []);

  const propertiesMap = useMemo(() => {
    const map: Record<string, string> = {};
    properties.forEach(p => { map[p.id] = p.name; });
    return map;
  }, [properties]);

  const equipmentsMap = useMemo(() => {
    const map: Record<string, Equipment> = {};
    equipments.forEach(e => { map[e.id] = e; });
    return map;
  }, [equipments]);

  // Launch maintenance ticket from preventive task in 1 click
  const handleTriggerIntervention = async (task: PreventiveTask) => {
    if (!auth.currentUser) return;
    try {
      const now = new Date().toISOString();
      const equip = equipmentsMap[task.equipmentId];
      const propertyName = propertiesMap[task.propertyId] || 'Propriété principale';
      const ticketNumber = `PREV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Create ticket in maintenance collection
      await addDoc(collection(db, 'maintenance'), {
        landlordId: auth.currentUser.uid,
        tenantId: 'EQUIPMENT_PREVENTIVE',
        tenantName: `Entretien préventif : ${equip?.name || task.title}`,
        title: `[Préventif] ${task.title} - ${equip?.name || ''}`,
        description: `Visite d'entretien planifiée (${task.frequency}).\nÉquipement: ${equip?.name || 'N/A'} (S/N: ${equip?.serialNumber || 'N/A'})\nChecklist: ${task.checklist || 'Contrôle complet des organes vitaux'}\nEmplacement: ${equip?.location || 'Local technique'}`,
        priority: task.priority || 'Moyenne',
        status: 'En cours',
        ticketNumber,
        category: equip?.category || 'Entretien',
        propertyId: task.propertyId,
        propertyName,
        assignedTechnicianId: task.assignedTechnicianId || undefined,
        assignedTechnicianName: task.assignedTechnicianName || undefined,
        scheduledDate: task.nextDueDate,
        cost: task.estimatedCost || 0,
        createdAt: now,
        updatedAt: now
      });

      // Update task status
      await updateDoc(doc(db, 'preventive_maintenance', task.id), {
        status: 'En cours',
        lastDoneDate: now,
        updatedAt: now
      });

      toast.success(`Intervention technique ${ticketNumber} générée avec succès et assignée au technicien !`);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la génération de l'intervention.");
    }
  };

  // Mark task completed & advance to next due date according to frequency
  const handleCompleteTask = async (task: PreventiveTask) => {
    try {
      const now = new Date();
      let nextDate = new Date();
      if (task.frequency === 'Mensuelle') nextDate = addMonths(now, 1);
      else if (task.frequency === 'Trimestrielle') nextDate = addMonths(now, 3);
      else if (task.frequency === 'Semestrielle') nextDate = addMonths(now, 6);
      else nextDate = addMonths(now, 12);

      await updateDoc(doc(db, 'preventive_maintenance', task.id), {
        status: 'Planifiée',
        lastDoneDate: now.toISOString(),
        nextDueDate: nextDate.toISOString().split('T')[0],
        updatedAt: now.toISOString()
      });

      toast.success("Tâche marquée terminée ! Prochaine échéance recalculée automatiquement.");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la mise à jour.");
    }
  };

  // Cost calculation per equipment
  const equipmentCostReport = useMemo(() => {
    return equipments.map(equip => {
      // Find all maintenance tickets matching this equipment name or category
      const relatedIssues = maintenanceIssues.filter(issue => 
        (issue.description && issue.description.includes(equip.name)) ||
        (issue.title && issue.title.includes(equip.name)) ||
        (issue.category === equip.category && issue.propertyId === equip.propertyId)
      );

      const totalSpent = relatedIssues.reduce((sum, issue) => {
        const parts = Number(issue.partsCost || 0);
        const labor = Number(issue.cost || 0);
        return sum + parts + labor;
      }, 0);

      return {
        ...equip,
        interventionCount: relatedIssues.length,
        totalSpent
      };
    }).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [equipments, maintenanceIssues]);

  return (
    <div className="space-y-4">
      {/* Top action and tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'schedule'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Calendrier Préventif</span>
            <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">{tasks.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('equipment')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'equipment'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Registre Équipements</span>
            <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">{equipments.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('costs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'costs'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Rapports de Coûts d'Entretien</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'equipment' ? (
            <button
              onClick={() => setShowAddEquipment(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Nouvel Équipement
            </button>
          ) : (
            <button
              onClick={() => setShowAddTask(true)}
              disabled={equipments.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Programmer Entretien
            </button>
          )}
        </div>
      </div>

      {/* SCHEDULE VIEW */}
      {activeTab === 'schedule' && (
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-100 dark:border-gray-700 text-center">
              <Calendar className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="font-bold text-sm text-gray-800 dark:text-gray-200">Aucune tâche de maintenance préventive programmée</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                {equipments.length === 0 
                  ? "Enregistrez d'abord vos équipements (groupe électrogène, pompe, ascenseur) dans l'onglet 'Registre Équipements'."
                  : "Programmez vos visites d'entretien périodiques pour éviter les pannes imprévues."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {tasks.map(task => {
                const equip = equipmentsMap[task.equipmentId];
                const isOverdue = task.nextDueDate && isBefore(new Date(task.nextDueDate), new Date()) && task.status !== 'Terminée';

                return (
                  <div
                    key={task.id}
                    className={`bg-white dark:bg-gray-800 p-4 rounded-2xl border shadow-xs flex flex-col justify-between gap-3 transition-colors ${
                      isOverdue ? 'border-red-200 dark:border-red-900/50 bg-red-50/20' : 'border-gray-100 dark:border-gray-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                              {task.frequency}
                            </span>
                            {isOverdue && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 animate-pulse">
                                Échéance dépassée
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              task.priority === 'Urgente' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {task.priority}
                            </span>
                          </div>

                          <h3 className="font-bold text-sm text-gray-900 dark:text-white mt-1.5">
                            {task.title}
                          </h3>

                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Équipement : <strong className="text-gray-700 dark:text-gray-300">{equip?.name || 'N/A'}</strong> • {propertiesMap[task.propertyId] || 'Immeuble'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 text-gray-400">
                          <button
                            onClick={() => setEditingTask(task)}
                            className="p-1 hover:text-blue-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="Modifier"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {task.checklist && (
                        <div className="mt-2.5 p-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl text-xs text-gray-600 dark:text-gray-400">
                          <span className="font-bold block text-gray-700 dark:text-gray-300 mb-0.5">Contrôles à effectuer :</span>
                          {task.checklist}
                        </div>
                      )}

                      <div className="mt-2.5 flex items-center justify-between text-xs text-gray-500">
                        <span>Prochaine visite : <strong className={isOverdue ? 'text-red-600' : 'text-gray-800 dark:text-gray-200'}>
                          {task.nextDueDate ? format(new Date(task.nextDueDate), 'dd MMMM yyyy', { locale: fr }) : 'Non fixée'}
                        </strong></span>
                        {task.assignedTechnicianName && (
                          <span>Tech : <strong>{task.assignedTechnicianName}</strong></span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-gray-100 dark:border-gray-700/80 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleCompleteTask(task)}
                        className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Fait (Valider période)</span>
                      </button>

                      <button
                        onClick={() => handleTriggerIntervention(task)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                        title="Créer un ticket d'intervention et l'envoyer au technicien"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Déclencher Intervention</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* EQUIPMENT REGISTRY VIEW */}
      {activeTab === 'equipment' && (
        <div className="space-y-3">
          {equipments.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-100 dark:border-gray-700 text-center">
              <Layers className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="font-bold text-sm text-gray-800 dark:text-gray-200">Aucun équipement enregistré</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                Ajoutez les organes techniques de vos immeubles : pompes à eau, groupes électrogènes, ascenseurs, climatiseurs.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {equipments.map(equip => (
                <div
                  key={equip.id}
                  className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                          {equip.category}
                        </span>
                        <h3 className="font-bold text-sm text-gray-900 dark:text-white mt-1">
                          {equip.name}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {propertiesMap[equip.propertyId] || 'Propriété'} {equip.location ? `• ${equip.location}` : ''}
                        </p>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        equip.status === 'Opérationnel'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : equip.status === 'En panne'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}>
                        {equip.status}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                      {equip.brand && <p>Marque / Modèle : <strong>{equip.brand} {equip.model || ''}</strong></p>}
                      {equip.serialNumber && <p>N° Série : <strong className="font-mono">{equip.serialNumber}</strong></p>}
                      {equip.installationDate && (
                        <p>Installé le : {format(new Date(equip.installationDate), 'dd/MM/yyyy')}</p>
                      )}
                      {equip.warrantyEnd && (
                        <p>Garantie jusqu'au : {format(new Date(equip.warrantyEnd), 'dd/MM/yyyy')}</p>
                      )}
                      {equip.notes && (
                        <p className="italic text-[11px] mt-1 text-gray-600 dark:text-gray-400">"{equip.notes}"</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700/80 flex items-center justify-between text-xs">
                    <button
                      onClick={() => setEditingEquipment(equip)}
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                    >
                      Modifier
                    </button>

                    <button
                      onClick={async () => {
                        if (window.confirm("Supprimer cet équipement ?")) {
                          await deleteDoc(doc(db, 'equipment', equip.id));
                          toast.success("Équipement supprimé.");
                        }
                      }}
                      className="text-gray-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COSTS REPORT VIEW */}
      {activeTab === 'costs' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">Coûts de maintenance cumulés par équipement</h3>
              <p className="text-xs text-gray-500">Dépenses de pièces de rechange et main-d'œuvre constatées.</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-400 block">Total dépenses matériel</span>
              <span className="font-bold text-base text-gray-900 dark:text-white">
                {equipmentCostReport.reduce((s, e) => s + e.totalSpent, 0).toLocaleString()} $
              </span>
            </div>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-750">
            {equipmentCostReport.map(item => (
              <div key={item.id} className="p-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">{item.name}</p>
                  <p className="text-xs text-gray-400">
                    {item.category} • {propertiesMap[item.propertyId] || 'Propriété'} • {item.interventionCount} intervention{item.interventionCount > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right font-bold text-gray-900 dark:text-white">
                  {item.totalSpent > 0 ? (
                    <span className="text-red-600 dark:text-red-400">{item.totalSpent.toLocaleString()} $</span>
                  ) : (
                    <span className="text-gray-400">0 $</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equipment Add/Edit Modal */}
      {(showAddEquipment || editingEquipment) && (
        <EquipmentModal
          properties={properties}
          existing={editingEquipment}
          onClose={() => {
            setShowAddEquipment(false);
            setEditingEquipment(null);
          }}
        />
      )}

      {/* Task Add/Edit Modal */}
      {(showAddTask || editingTask) && (
        <TaskModal
          equipments={equipments}
          properties={properties}
          technicians={technicians}
          existing={editingTask}
          onClose={() => {
            setShowAddTask(false);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}

function EquipmentModal({ properties, existing, onClose }: { properties: any[], existing: Equipment | null, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: existing?.name || '',
    category: existing?.category || EQUIPMENT_CATEGORIES[0],
    propertyId: existing?.propertyId || (properties[0]?.id || ''),
    brand: existing?.brand || '',
    model: existing?.model || '',
    serialNumber: existing?.serialNumber || '',
    installationDate: existing?.installationDate || '',
    warrantyEnd: existing?.warrantyEnd || '',
    location: existing?.location || '',
    status: existing?.status || 'Opérationnel',
    notes: existing?.notes || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      if (existing) {
        await updateDoc(doc(db, 'equipment', existing.id), {
          ...formData,
          updatedAt: now
        });
        toast.success("Équipement mis à jour !");
      } else {
        await addDoc(collection(db, 'equipment'), {
          ...formData,
          landlordId: auth.currentUser.uid,
          createdAt: now,
          updatedAt: now
        });
        toast.success("Équipement enregistré !");
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
    <div className="fixed inset-0 bg-slate-900/10 dark:bg-black/20 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 max-w-md w-full p-6 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700 mb-4">
          <h3 className="font-bold text-gray-900 dark:text-white text-base">
            {existing ? 'Modifier l\'équipement' : 'Nouvel Équipement Technique'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Désignation de l'équipement</label>
            <input
              required
              type="text"
              placeholder="Ex: Groupe électrogène Perkins 60 kVA"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Catégorie</label>
              <select
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              >
                {EQUIPMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Propriété / Immeuble</label>
              <select
                required
                value={formData.propertyId}
                onChange={e => setFormData({ ...formData, propertyId: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              >
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Marque</label>
              <input
                type="text"
                placeholder="Ex: Perkins, Grundfos..."
                value={formData.brand}
                onChange={e => setFormData({ ...formData, brand: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">N° de Série</label>
              <input
                type="text"
                placeholder="Ex: SN-98421"
                value={formData.serialNumber}
                onChange={e => setFormData({ ...formData, serialNumber: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Date d'installation</label>
              <input
                type="date"
                value={formData.installationDate}
                onChange={e => setFormData({ ...formData, installationDate: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Fin de garantie</label>
              <input
                type="date"
                value={formData.warrantyEnd}
                onChange={e => setFormData({ ...formData, warrantyEnd: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Emplacement précis</label>
              <input
                type="text"
                placeholder="Ex: Sous-sol, Toiture, Local technique"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Statut actuel</label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              >
                <option value="Opérationnel">Opérationnel</option>
                <option value="En panne">En panne</option>
                <option value="En révision">En révision</option>
                <option value="Remplacé">Remplacé</option>
              </select>
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

function TaskModal({ 
  equipments, 
  properties, 
  technicians, 
  existing, 
  onClose 
}: { 
  equipments: Equipment[], 
  properties: any[], 
  technicians: any[], 
  existing: PreventiveTask | null, 
  onClose: () => void 
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: existing?.title || 'Vidange & Contrôle filtres',
    equipmentId: existing?.equipmentId || (equipments[0]?.id || ''),
    frequency: existing?.frequency || 'Trimestrielle',
    nextDueDate: existing?.nextDueDate || new Date().toISOString().split('T')[0],
    assignedTechnicianId: existing?.assignedTechnicianId || '',
    priority: existing?.priority || 'Moyenne',
    checklist: existing?.checklist || '1. Niveau huile\n2. Filtre à air et carburant\n3. Tension courroie\n4. Test démarrage à vide',
    estimatedCost: existing?.estimatedCost ? existing.estimatedCost.toString() : '50'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);

    try {
      const now = new Date().toISOString();
      const selectedEquip = equipments.find(e => e.id === formData.equipmentId);
      const selectedTech = technicians.find(t => t.id === formData.assignedTechnicianId);

      const taskData = {
        title: formData.title.trim(),
        equipmentId: formData.equipmentId,
        propertyId: selectedEquip?.propertyId || properties[0]?.id || '',
        frequency: formData.frequency,
        nextDueDate: formData.nextDueDate,
        assignedTechnicianId: formData.assignedTechnicianId || undefined,
        assignedTechnicianName: selectedTech?.name || undefined,
        priority: formData.priority,
        status: existing?.status || 'Planifiée',
        checklist: formData.checklist.trim(),
        estimatedCost: Number(formData.estimatedCost) || 0,
        landlordId: auth.currentUser.uid,
        updatedAt: now
      };

      if (existing) {
        await updateDoc(doc(db, 'preventive_maintenance', existing.id), taskData);
        toast.success("Tâche d'entretien mise à jour !");
      } else {
        await addDoc(collection(db, 'preventive_maintenance'), {
          ...taskData,
          createdAt: now
        });
        toast.success("Entretien périodique planifié !");
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Erreur de planification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/10 dark:bg-black/20 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 max-w-md w-full p-6 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700 mb-4">
          <h3 className="font-bold text-gray-900 dark:text-white text-base">
            {existing ? 'Modifier l\'entretien préventif' : 'Programmer un Entretien Préventif'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Équipement cible</label>
            <select
              required
              value={formData.equipmentId}
              onChange={e => setFormData({ ...formData, equipmentId: e.target.value })}
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
            >
              {equipments.map(e => <option key={e.id} value={e.id}>{e.name} ({e.category})</option>)}
            </select>
          </div>

          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Intitulé de la visite</label>
            <input
              required
              type="text"
              placeholder="Ex: Révision périodique & Vidange moteur"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Périodicité</label>
              <select
                value={formData.frequency}
                onChange={e => setFormData({ ...formData, frequency: e.target.value as any })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              >
                <option value="Mensuelle">Mensuelle</option>
                <option value="Trimestrielle">Trimestrielle</option>
                <option value="Semestrielle">Semestrielle</option>
                <option value="Annuelle">Annuelle</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Prochaine échéance</label>
              <input
                required
                type="date"
                value={formData.nextDueDate}
                onChange={e => setFormData({ ...formData, nextDueDate: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Technicien assigné</label>
              <select
                value={formData.assignedTechnicianId}
                onChange={e => setFormData({ ...formData, assignedTechnicianId: e.target.value })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              >
                <option value="">Non assigné pour l'instant</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name} ({t.specialty})</option>)}
              </select>
            </div>

            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Priorité</label>
              <select
                value={formData.priority}
                onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-gray-900 dark:text-white"
              >
                <option value="Basse">Basse</option>
                <option value="Moyenne">Moyenne</option>
                <option value="Haute">Haute</option>
                <option value="Urgente">Urgente</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Checklist & Consignes techniques</label>
            <textarea
              rows={3}
              value={formData.checklist}
              onChange={e => setFormData({ ...formData, checklist: e.target.value })}
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
              {loading ? 'Planification...' : 'Valider la Planification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
