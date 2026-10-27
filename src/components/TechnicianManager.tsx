import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Wrench, 
  Plus, 
  Phone, 
  Mail, 
  Copy, 
  Check, 
  Trash2, 
  Edit3, 
  X, 
  MessageCircle, 
  KeyRound 
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface TechnicianAccount {
  id: string;
  landlordId: string;
  name: string;
  phone: string;
  email?: string;
  specialty: string;
  status: 'Actif' | 'Inactif' | 'Suspendu';
  accessCode: string;
  hourlyRate?: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

const SPECIALTIES = [
  'Plomberie & Canalisation',
  'Électricité & Éclairage',
  'Froid & Climatisation',
  'Groupes électrogènes & Énergie',
  'Pompes à eau & Citernes',
  'Ascenseurs & Automatismes',
  'Serrurerie & Métallerie',
  'Peinture & Rénovation',
  'Polyvalent / Multi-services'
];

export function TechnicianManager() {
  const [technicians, setTechnicians] = useState<TechnicianAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTech, setEditingTech] = useState<TechnicianAccount | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [technicianDispatch, setTechnicianDispatch] = useState<any>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const q = query(collection(db, 'technicians'), where('landlordId', '==', uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as TechnicianAccount[];
      data.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setTechnicians(data);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const copyAccessLink = (tech: TechnicianAccount) => {
    const origin = window.location.origin;
    const link = `${origin}/tech?code=${tech.accessCode}`;
    navigator.clipboard.writeText(link);
    setCopiedId(tech.id);
    toast.success("Lien d'accès copié dans le presse-papier !");
    setTimeout(() => setCopiedId(null), 2500);
  };

  const shareViaWhatsApp = (tech: TechnicianAccount) => {
    const origin = window.location.origin;
    const link = `${origin}/tech?code=${tech.accessCode}`;
    const text = encodeURIComponent(
      `Bonjour ${tech.name},\nVoici votre lien d'accès sécurisé à l'Espace Technicien ImmoGest pour gérer vos interventions et contrats :\n${link}\n\nVotre code d'accès : ${tech.accessCode}`
    );
    const cleanPhone = tech.phone.replace(/[^0-9]/g, '');
    window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${text}`, '_blank');
  };

  const shareViaGmail = (tech: TechnicianAccount) => {
    if (!tech.email) {
      toast.error("Aucune adresse email enregistrée pour ce technicien.");
      return;
    }
    const origin = window.location.origin;
    const link = `${origin}/tech?code=${tech.accessCode}`;
    const subject = encodeURIComponent(`Votre accès Technicien ImmoGest - ${tech.name}`);
    const body = encodeURIComponent(
      `Bonjour ${tech.name},\n\nVotre compte de prestataire technique a été créé sur ImmoGest.\n\nVous pouvez accéder à vos interventions, saisir vos rapports et suivre vos contrats via le lien sécurisé suivant :\n${link}\n\nVotre code d'accès direct : ${tech.accessCode}\n\nBien cordialement,\nLe Gestionnaire ImmoGest`
    );
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(tech.email)}&su=${subject}&body=${body}`, '_blank');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir révoquer l'accès de ce technicien ?")) return;
    try {
      await deleteDoc(doc(db, 'technicians', id));
      toast.success("Technicien supprimé et accès révoqué.");
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de la suppression.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 p-4 rounded-2xl">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-600" />
            Gestion des Techniciens & Prestataires Agréés
          </h2>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Vous contrôlez l'accès : enregistrez vos prestataires et transmettez-leur leur lien d'accès dédié vers l'Espace Technicien indépendant.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          Enregistrer un Technicien
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map(i => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
        </div>
      ) : technicians.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-100 dark:border-gray-700 text-center">
          <Wrench className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="font-bold text-sm text-gray-800 dark:text-gray-200">Aucun technicien enregistré pour le moment</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
            Ajoutez vos plombiers, électriciens ou réparateurs pour leur assigner des interventions et leur donner accès à leur portail dédié.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {technicians.map(tech => (
            <div
              key={tech.id}
              className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col justify-between gap-3 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                      {tech.name}
                      <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                        tech.status === 'Actif'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {tech.status}
                      </span>
                    </h3>
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                      {tech.specialty}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 text-gray-400">
                    <button
                      onClick={() => setEditingTech(tech)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg hover:text-blue-600 transition-colors"
                      title="Modifier"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(tech.id)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg hover:text-red-600 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-gray-400" />
                    <span>{tech.phone}</span>
                  </div>
                  {tech.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3 h-3 text-gray-400" />
                      <span>{tech.email}</span>
                    </div>
                  )}
                  {tech.hourlyRate ? (
                    <p className="text-[11px] text-gray-500">Tarif moyen : {tech.hourlyRate}$ / intervention</p>
                  ) : null}
                </div>
              </div>

              {/* Access code & Sharing Bar */}
              <div className="pt-2.5 border-t border-gray-100 dark:border-gray-700/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[11px] text-gray-400">Code :</span>
                  <span className="font-mono font-bold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700/80 px-2 py-0.5 rounded-md text-[11px]">
                    {tech.accessCode}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => copyAccessLink(tech)}
                    className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                    title="Copier le lien d'accès"
                  >
                    {copiedId === tech.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span className="text-[11px]">Copier</span>
                  </button>

                  <button
                    onClick={() => shareViaWhatsApp(tech)}
                    className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs"
                    title="Envoyer l'accès sur WhatsApp"
                  >
                    <MessageCircle className="w-3 h-3" />
                    <span className="text-[11px]">WhatsApp</span>
                  </button>

                  {tech.email && (
                    <button
                      onClick={() => shareViaGmail(tech)}
                      className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs"
                      title="Ouvrir dans Gmail"
                    >
                      <Mail className="w-3 h-3" />
                      <span className="text-[11px]">Gmail</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Technician Modal */}
      {(showAddModal || editingTech) && (
        <TechnicianModal
          existing={editingTech}
          onClose={() => {
            setShowAddModal(false);
            setEditingTech(null);
          }}
          onSuccess={(info) => {
            setShowAddModal(false);
            setEditingTech(null);
            setTechnicianDispatch(info);
          }}
        />
      )}

      {/* Immediate Technician Access Dispatch Modal (WhatsApp / Gmail) */}
      {technicianDispatch && (
        <TechnicianAccessDispatchModal
          info={technicianDispatch}
          onClose={() => setTechnicianDispatch(null)}
        />
      )}
    </div>
  );
}

function TechnicianModal({ 
  existing, 
  onClose, 
  onSuccess 
}: { 
  existing: TechnicianAccount | null; 
  onClose: () => void;
  onSuccess?: (info: any) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: existing?.name || '',
    phone: existing?.phone || '',
    email: existing?.email || '',
    specialty: existing?.specialty || SPECIALTIES[0],
    hourlyRate: existing?.hourlyRate ? existing.hourlyRate.toString() : '',
    notes: existing?.notes || '',
    status: existing?.status || 'Actif'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!formData.name.trim() || !formData.phone.trim()) {
      setError('Veuillez renseigner le nom et le numéro de téléphone.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const now = new Date().toISOString();
      if (existing) {
        await updateDoc(doc(db, 'technicians', existing.id), {
          ...formData,
          hourlyRate: formData.hourlyRate ? Number(formData.hourlyRate) : undefined,
          updatedAt: now
        });
        toast.success("Informations du technicien mises à jour !");
        onClose();
      } else {
        // Generate random access code TECH-XXXX
        const randomDigits = Math.floor(1000 + Math.random() * 9000);
        const accessCode = `TECH-${randomDigits}`;

        await addDoc(collection(db, 'technicians'), {
          landlordId: auth.currentUser.uid,
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim() || undefined,
          specialty: formData.specialty,
          status: formData.status,
          accessCode,
          hourlyRate: formData.hourlyRate ? Number(formData.hourlyRate) : undefined,
          notes: formData.notes.trim() || undefined,
          createdAt: now,
          updatedAt: now
        });
        toast.success(`Technicien enregistré ! Code d'accès généré : ${accessCode}`);

        if (onSuccess) {
          onSuccess({
            name: formData.name.trim(),
            phone: formData.phone.trim(),
            email: formData.email.trim(),
            specialty: formData.specialty,
            accessCode
          });
        } else {
          onClose();
        }
      }
    } catch (e: any) {
      console.error(e);
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-7 border border-gray-100 dark:border-gray-700 my-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-base">
                {existing ? 'Modifier le Technicien' : 'Enregistrer un Technicien'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Génération de code d'accès et partage immédiat
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Nom complet du prestataire</label>
            <input
              required
              type="text"
              placeholder="Ex: Michel Kalonji"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Numéro WhatsApp / Téléphone</label>
              <input
                required
                type="tel"
                placeholder="+243 81 234 5678"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Adresse Email (optionnelle)</label>
              <input
                type="email"
                placeholder="technicien@gmail.com"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Corps de métier / Spécialité</label>
            <select
              value={formData.specialty}
              onChange={e => setFormData({ ...formData, specialty: e.target.value })}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            >
              {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Tarif moyen indicatif ($)</label>
              <input
                type="number"
                placeholder="Ex: 25"
                value={formData.hourlyRate}
                onChange={e => setFormData({ ...formData, hourlyRate: e.target.value })}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Statut d'accès</label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="Actif">Actif (Accès autorisé)</option>
                <option value="Inactif">Inactif</option>
                <option value="Suspendu">Suspendu (Accès bloqué)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Notes internes (optionnel)</label>
            <textarea
              rows={2}
              placeholder="Zone d'intervention, équipement disponible, remarques..."
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          <div className="pt-3 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-all shadow-md disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Enregistrement...' : (existing ? 'Mettre à jour' : 'Générer Accès Technicien')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal to automatically dispatch portal link to technician via WhatsApp or Gmail
 */
function TechnicianAccessDispatchModal({ info, onClose }: { info: any; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const portalUrl = `${window.location.origin}/tech?code=${info.accessCode}`;
  const cleanPhone = (info.phone || '').replace(/[^0-9]/g, '');

  const whatsappMessage = `Bonjour ${info.name},\nVotre bailleur/gestionnaire vous a enregistré comme technicien sur ImmoGest.\nVoici votre lien d'accès direct et sécurisé à votre espace d'interventions et de rapports techniques :\n${portalUrl}\n\nVotre code d'accès : ${info.accessCode}`;

  const mailSubject = `Votre espace Technicien Pro ImmoGest - ${info.name}`;
  const mailBody = `Bonjour ${info.name},\n\nVotre compte de prestataire technique a été configuré sur ImmoGest.\n\nVous pouvez accéder à vos interventions, saisir vos rapports avec photos avant/après et suivre vos contrats via le lien suivant :\n${portalUrl}\n\nVotre code d'accès exclusif : ${info.accessCode}\n\nBien cordialement,\nImmoGest Kinshasa`;

  const handleCopy = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    toast.success("Lien d'accès copié !");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsApp = () => {
    const directUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessage)}`;
    window.open(directUrl, '_blank');
  };

  const handleGmail = () => {
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(info.email || '')}&su=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;
    window.open(gmailUrl, '_blank');
  };

  const handleDefaultMail = () => {
    window.location.href = `mailto:${info.email}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-7 border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-base">
                Accès Technicien Activé !
              </h3>
              <p className="text-xs text-gray-500">Pour {info.name} ({info.specialty})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Access Code Display */}
        <div className="my-4 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-900/50 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium block">Code d'accès sécurisé</span>
            <span className="font-mono text-xl font-black text-amber-900 dark:text-amber-200 tracking-wider">
              {info.accessCode}
            </span>
          </div>
          <span className="px-2.5 py-1 bg-amber-200 dark:bg-amber-800 text-amber-950 dark:text-amber-100 text-xs font-bold rounded-lg">
            Actif
          </span>
        </div>

        {/* Portal URL box */}
        <div className="bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 mb-4">
          <input
            type="text"
            readOnly
            value={portalUrl}
            className="bg-transparent text-xs text-gray-700 dark:text-gray-300 font-mono w-full outline-none select-all truncate"
          />
          <button
            onClick={handleCopy}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 text-gray-700 dark:text-gray-200 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copié' : 'Copier'}</span>
          </button>
        </div>

        {/* 1-Click Fast Dispatch Buttons */}
        <div className="space-y-2.5">
          {info.phone && (
            <button
              onClick={handleWhatsApp}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-sm font-bold shadow-md transition-all cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Ouvrir WhatsApp directement ({info.phone})</span>
            </button>
          )}

          {info.email && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={handleGmail}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span>Ouvrir Gmail Web</span>
              </button>
              <button
                onClick={handleDefaultMail}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span>Application Mail</span>
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
