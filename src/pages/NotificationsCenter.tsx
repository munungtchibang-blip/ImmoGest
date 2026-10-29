import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  getDocs, 
  limit 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  Smartphone, 
  Send, 
  RefreshCw, 
  Archive, 
  Trash2, 
  Check, 
  Filter, 
  Search, 
  ExternalLink, 
  SlidersHorizontal, 
  FileText, 
  DollarSign, 
  Wrench, 
  FileSignature, 
  X, 
  Layers 
} from 'lucide-react';
import { 
  NotificationChannel, 
  NotificationEvent, 
  NotificationLog, 
  DEFAULT_TEMPLATES, 
  renderTemplate, 
  sendAutomatedNotification, 
  retryNotificationLog, 
  openWhatsAppChat 
} from '../services/notificationService';
import toast from 'react-hot-toast';

export function NotificationsCenter() {
  const [activeTab, setActiveTab] = useState<'inbox' | 'logs' | 'templates' | 'preferences'>('inbox');
  const [loading, setLoading] = useState(true);

  // 1. In-App Notifications State
  const [inAppNotifs, setInAppNotifs] = useState<any[]>([]);
  const [inboxFilter, setInboxFilter] = useState<'unread' | 'all' | 'archived'>('unread');
  const [typeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 2. Dispatch Logs State
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [logChannelFilter, setLogChannelFilter] = useState<string>('all');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('all');
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);

  // 3. Templates State
  const [templates, setTemplates] = useState<Record<string, { title: string; body: string; channels: NotificationChannel[] }>>(DEFAULT_TEMPLATES);
  const [selectedEventKey, setSelectedEventKey] = useState<string>('rent_reminder');
  const [editingTitle, setEditingTitle] = useState(() => DEFAULT_TEMPLATES.rent_reminder.title);
  const [editingBody, setEditingBody] = useState(() => DEFAULT_TEMPLATES.rent_reminder.body);
  const [previewVars] = useState({
    destinataire: 'Jean Mukendi',
    montant: '350',
    logement: 'Appartement B2 - Résidence La Plage',
    date_echeance: '05 Novembre 2026',
    lien: window.location.origin + '/pay/demo',
    ticket: 'INT-2026-042',
    technicien: 'Alain Luboya',
    telephone_tech: '+243 812 345 678',
    date_prevue: '28 Octobre 2026',
    categorie: 'Plomberie',
    description: 'Fuite d\'eau sous l\'évier',
    statut: 'En cours',
    notes: 'Remplacement du joint en cours',
    type_frais: 'Loyer Mensuel',
    jours_retard: '4',
    date_fin: '31 Décembre 2026',
    immeuble: 'Immeuble Le Flamboyant',
    message_annonce: 'Des travaux de coupure d\'eau auront lieu ce jeudi de 10h à 14h',
    mois: 'Octobre 2026'
  });

  // 4. Communication Preferences
  const [prefs, setPrefs] = useState({
    inAppEnabled: true,
    emailEnabled: true,
    smsEnabled: true,
    whatsappEnabled: true,
    subscribedEvents: Object.keys(DEFAULT_TEMPLATES)
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // 5. Broadcast / Manual Notification Modal
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [tenantsList, setTenantsList] = useState<any[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('all');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastChannels, setBroadcastChannels] = useState<NotificationChannel[]>(['in_app', 'whatsapp']);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Load In-App Notifications, Dispatch Logs, and Tenants
  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    // Load In-App Notifications
    const qNotifs = query(collection(db, 'notifications'), where('userId', '==', uid));
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setInAppNotifs(items);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    // Load Multi-Channel Dispatch Logs
    const qLogs = query(collection(db, 'notification_logs'), where('landlordId', '==', uid));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as NotificationLog[];
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setLogs(items);
    }, (err) => {
      console.error(err);
    });

    // Load Tenants for broadcasting
    const qTenants = query(collection(db, 'tenants'), where('landlordId', '==', uid));
    getDocs(qTenants).then(snap => {
      setTenantsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Load Preferences
    const qPref = query(collection(db, 'notification_preferences'), where('userId', '==', uid), limit(1));
    getDocs(qPref).then(snap => {
      if (!snap.empty) {
        setPrefs(snap.docs[0].data() as any);
      }
    });

    return () => {
      unsubNotifs();
      unsubLogs();
    };
  }, []);

  // Select template event key
  const handleSelectEventKey = (eventKey: string) => {
    setSelectedEventKey(eventKey);
    const t = templates[eventKey] || DEFAULT_TEMPLATES[eventKey as NotificationEvent];
    if (t) {
      setEditingTitle(t.title);
      setEditingBody(t.body);
    }
  };

  // Mark in-app notification as read
  const handleMarkAsRead = async (id: string, isRead = true) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { isRead });
    } catch {
      toast.error("Erreur de mise à jour");
    }
  };

  // Archive in-app notification
  const handleArchiveNotif = async (id: string, isArchived = true) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { isArchived });
      toast.success(isArchived ? "Notification archivée" : "Notification désarchivée");
    } catch {
      toast.error("Erreur");
    }
  };

  // Delete in-app notification
  const handleDeleteNotif = async (id: string) => {
    if (!window.confirm("Supprimer définitivement cette notification ?")) return;
    try {
      await deleteDoc(doc(db, 'notifications', id));
      toast.success("Notification supprimée");
    } catch {
      toast.error("Erreur de suppression");
    }
  };

  // Mark all unread as read
  const handleMarkAllRead = async () => {
    const unread = inAppNotifs.filter(n => !n.isRead && !n.isArchived);
    try {
      await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id), { isRead: true })));
      toast.success("Toutes les notifications marquées comme lues.");
    } catch {
      toast.error("Erreur");
    }
  };

  // Retry failed dispatch log
  const handleRetryLog = async (logItem: NotificationLog) => {
    setRetryingLogId(logItem.id);
    await retryNotificationLog(logItem);
    setRetryingLogId(null);
  };

  // Save Preferences
  const handleSavePreferences = async () => {
    if (!auth.currentUser) return;
    setSavingPrefs(true);
    try {
      const uid = auth.currentUser.uid;
      const q = query(collection(db, 'notification_preferences'), where('userId', '==', uid));
      const snap = await getDocs(q);
      const payload = { ...prefs, userId: uid, updatedAt: new Date().toISOString() };
      if (!snap.empty) {
        await updateDoc(doc(db, 'notification_preferences', snap.docs[0].id), payload);
      } else {
        await addDoc(collection(db, 'notification_preferences'), payload);
      }
      toast.success("Préférences de communication enregistrées.");
    } catch (err: any) {
      toast.error("Erreur : " + err.message);
    } finally {
      setSavingPrefs(false);
    }
  };

  // Save Template
  const handleSaveTemplate = () => {
    setTemplates({
      ...templates,
      [selectedEventKey]: {
        ...templates[selectedEventKey],
        title: editingTitle,
        body: editingBody
      }
    });
    toast.success("Modèle de notification mis à jour.");
  };

  // Send Broadcast / Multi-channel manual alert
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      toast.error("Veuillez renseigner un titre et un message.");
      return;
    }
    if (broadcastChannels.length === 0) {
      toast.error("Veuillez sélectionner au moins un canal.");
      return;
    }

    setSendingBroadcast(true);
    const uid = auth.currentUser.uid;

    try {
      const targets = selectedRecipientId === 'all'
        ? tenantsList
        : tenantsList.filter(t => t.id === selectedRecipientId);

      if (targets.length === 0) {
        // Send to landlord himself as test or note
        await sendAutomatedNotification({
          landlordId: uid,
          recipientId: uid,
          recipientName: auth.currentUser.displayName || 'Gestionnaire',
          recipientEmail: auth.currentUser.email || undefined,
          channels: broadcastChannels,
          event: 'tenant_announcement',
          title: broadcastTitle,
          message: broadcastMessage
        });
      } else {
        for (const t of targets) {
          await sendAutomatedNotification({
            landlordId: uid,
            recipientId: t.id,
            recipientName: t.name,
            recipientEmail: t.email,
            recipientPhone: t.phone,
            channels: broadcastChannels,
            event: 'tenant_announcement',
            title: broadcastTitle,
            message: broadcastMessage,
            idempotencySuffix: `broadcast_${Date.now()}_${t.id}`
          });
        }
      }

      toast.success(`Message diffusé avec succès sur ${broadcastChannels.join(', ').toUpperCase()} !`);
      setShowBroadcastModal(false);
      setBroadcastTitle('');
      setBroadcastMessage('');
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur de diffusion : " + err.message);
    } finally {
      setSendingBroadcast(false);
    }
  };

  // Test Dispatch Action
  const handleTestDispatch = async (channel: NotificationChannel) => {
    if (!auth.currentUser) return;
    try {
      const uid = auth.currentUser.uid;
      const res = await sendAutomatedNotification({
        landlordId: uid,
        recipientId: uid,
        recipientName: auth.currentUser.displayName || 'Gestionnaire',
        recipientEmail: auth.currentUser.email || undefined,
        recipientPhone: '+243810000000',
        channels: [channel],
        event: 'tenant_announcement',
        title: `Test de notification ${channel.toUpperCase()}`,
        message: `Ceci est un test d'envoi réussi via le canal ${channel.toUpperCase()} depuis ImmoGest.`,
        idempotencySuffix: `test_${channel}_${Date.now()}`
      });

      if (res.errors.length > 0) {
        toast.error(`Erreur test ${channel} : ${res.errors.join(', ')}`);
      } else {
        toast.success(`Test ${channel.toUpperCase()} transmis avec succès.`);
      }
    } catch (err: any) {
      toast.error("Erreur de test : " + err.message);
    }
  };

  // Filtered In-App Notifs
  const filteredInApp = useMemo(() => {
    return inAppNotifs.filter(n => {
      if (inboxFilter === 'unread' && (n.isRead || n.isArchived)) return false;
      if (inboxFilter === 'archived' && !n.isArchived) return false;
      if (inboxFilter === 'all' && n.isArchived) return false;
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!n.title?.toLowerCase().includes(q) && !n.message?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [inAppNotifs, inboxFilter, typeFilter, searchQuery]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (logChannelFilter !== 'all' && l.channel !== logChannelFilter) return false;
      if (logStatusFilter !== 'all' && l.status !== logStatusFilter) return false;
      return true;
    });
  }, [logs, logChannelFilter, logStatusFilter]);

  const unreadCount = useMemo(() => inAppNotifs.filter(n => !n.isRead && !n.isArchived).length, [inAppNotifs]);

  return (
    <div className="space-y-6 page-enter pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden border border-indigo-800/60">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white">
                Système Multicanal Idempotent
              </span>
              <span className="text-xs text-indigo-200">Anti-doublon garanti</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
              <Bell className="w-8 h-8 text-amber-400" />
              Centre de Notifications Automatiques
            </h1>
            <p className="text-xs sm:text-sm text-indigo-100/80">
              Gérez les alertes In-App, emails, SMS et WhatsApp Business avec journalisation complète, statuts de délivrabilité et modèles configurables.
            </p>
          </div>

          <button
            onClick={() => setShowBroadcastModal(true)}
            className="px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-indigo-950 font-black rounded-2xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <Send className="w-4 h-4" />
            <span>Diffuser une Notification</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 overflow-x-auto hide-scrollbar pb-1">
          {[
            { id: 'inbox', label: 'Boîte de Réception In-App', icon: Bell, badge: unreadCount },
            { id: 'logs', label: 'Journal d\'Expédition Multicanal', icon: Layers, badge: logs.filter(l => l.status === 'failed').length || undefined },
            { id: 'templates', label: 'Modèles de Messages (10 Événements)', icon: FileText },
            { id: 'preferences', label: 'Préférences & Canaux', icon: SlidersHorizontal },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-indigo-950 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    tab.id === 'logs' ? 'bg-rose-500 text-white' : 'bg-amber-400 text-indigo-950'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: BOÎTE DE RÉCEPTION IN-APP */}
      {/* ======================================================== */}
      {activeTab === 'inbox' && (
        <div className="space-y-4 tab-enter">
          {/* Controls Bar */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
              {[
                { id: 'unread', label: `Non lues (${unreadCount})` },
                { id: 'all', label: `Toutes (${inAppNotifs.filter(n => !n.isArchived).length})` },
                { id: 'archived', label: `Archivées (${inAppNotifs.filter(n => n.isArchived).length})` },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setInboxFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    inboxFilter === f.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}

              {unreadCount > 0 && inboxFilter === 'unread' && (
                <button
                  onClick={handleMarkAllRead}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors cursor-pointer ml-auto"
                >
                  Tout marquer comme lu
                </button>
              )}
            </div>

            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrer les notifications..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* List of In-App notifications */}
          <div className="space-y-2.5">
            {loading && inAppNotifs.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs">Chargement des notifications...</p>
              </div>
            ) : filteredInApp.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-xs space-y-2">
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto text-gray-400">
                  <Bell className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Aucune notification</h3>
                <p className="text-xs text-gray-400">Votre boîte de réception est complètement à jour.</p>
              </div>
            ) : (
              filteredInApp.map(item => (
                <div
                  key={item.id}
                  className={`bg-white dark:bg-gray-800 p-4 rounded-2xl border transition-all flex items-start gap-3 shadow-xs card-enter ${
                    item.isRead ? 'border-gray-100 dark:border-gray-700/60 opacity-80' : 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/20'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    item.type === 'payment' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60' :
                    item.type === 'maintenance' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60' :
                    item.type === 'contract' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/60' :
                    'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60'
                  }`}>
                    {item.type === 'payment' ? <DollarSign className="w-5 h-5" /> :
                     item.type === 'maintenance' ? <Wrench className="w-5 h-5" /> :
                     item.type === 'contract' ? <FileSignature className="w-5 h-5" /> :
                     <Bell className="w-5 h-5" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-extrabold text-gray-900 dark:text-white">{item.title}</h4>
                        {!item.isRead && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {new Date(item.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                      {item.message}
                    </p>

                    <div className="flex items-center gap-3 pt-2 text-[11px]">
                      {!item.isRead ? (
                        <button
                          onClick={() => handleMarkAsRead(item.id, true)}
                          className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> Marquer comme lue
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMarkAsRead(item.id, false)}
                          className="text-gray-500 hover:underline cursor-pointer"
                        >
                          Marquer non lue
                        </button>
                      )}

                      {!item.isArchived ? (
                        <button
                          onClick={() => handleArchiveNotif(item.id, true)}
                          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 cursor-pointer"
                        >
                          <Archive className="w-3 h-3" /> Archiver
                        </button>
                      ) : (
                        <button
                          onClick={() => handleArchiveNotif(item.id, false)}
                          className="text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" /> Restaurer
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteNotif(item.id)}
                        className="text-rose-500 hover:text-rose-700 ml-auto flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: JOURNAL D'EXPÉDITION MULTICANAL */}
      {/* ======================================================== */}
      {activeTab === 'logs' && (
        <div className="space-y-4 tab-enter">
          {/* Filters Bar */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-500 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Canal :
              </span>
              {['all', 'in_app', 'email', 'sms', 'whatsapp'].map(c => (
                <button
                  key={c}
                  onClick={() => setLogChannelFilter(c)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    logChannelFilter === c
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {c === 'all' ? 'Tous' : c.toUpperCase()}
                </button>
              ))}

              <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>

              <span className="font-bold text-gray-500">Statut :</span>
              {['all', 'delivered', 'sent', 'pending', 'failed'].map(s => (
                <button
                  key={s}
                  onClick={() => setLogStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    logStatusFilter === s
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {s === 'all' ? 'Tous' : s === 'delivered' ? 'Délivrée' : s === 'sent' ? 'Envoyée' : s === 'pending' ? 'En attente' : 'Échec'}
                </button>
              ))}
            </div>

            <span className="text-gray-400 font-bold">
              {filteredLogs.length} envoi(s) enregistré(s)
            </span>
          </div>

          {/* Table / Cards of logs */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs overflow-hidden">
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs">
                  Aucun log d'envoi sous ces filtres.
                </div>
              ) : (
                filteredLogs.map(log => {
                  const isFailed = log.status === 'failed';

                  return (
                    <div key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Channel Badge */}
                          <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase ${
                            log.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                            log.channel === 'sms' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                            log.channel === 'email' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                            'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          }`}>
                            {log.channel}
                          </span>

                          {/* Status Badge */}
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            log.status === 'delivered' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            log.status === 'sent' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            log.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {log.status === 'delivered' ? 'Délivrée' : log.status === 'sent' ? 'Envoyée' : log.status === 'pending' ? 'En attente' : 'Échec d\'envoi'}
                          </span>

                          {/* Idempotency Key Tag */}
                          <span className="font-mono text-[9px] text-gray-400 bg-gray-50 dark:bg-gray-900 px-1.5 py-0.5 rounded">
                            {log.idempotencyKey.substring(0, 24)}...
                          </span>

                          <span className="text-gray-400 ml-auto sm:ml-0">
                            {new Date(log.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <p className="font-bold text-gray-900 dark:text-white">{log.title}</p>
                        <p className="text-gray-500 dark:text-gray-400 truncate">{log.message}</p>

                        <div className="flex items-center gap-3 text-gray-400 text-[11px] pt-0.5">
                          <span>Destinataire : <strong>{log.recipientName}</strong> ({log.recipientContact || 'In-App'})</span>
                          {log.retryCount > 0 && (
                            <span className="text-amber-600 font-bold">Tentatives : {log.retryCount}</span>
                          )}
                        </div>

                        {log.errorDetails && (
                          <p className="text-rose-600 dark:text-rose-400 text-[11px] bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg mt-1">
                            Erreur prestataire : {log.errorDetails}
                          </p>
                        )}
                      </div>

                      {/* Direct Action or Retry */}
                      <div className="flex items-center gap-2 shrink-0">
                        {log.channel === 'whatsapp' && log.recipientContact && (
                          <button
                            onClick={() => openWhatsAppChat(log.recipientContact, log.message)}
                            className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg font-bold text-[11px] flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Ouvrir WhatsApp
                          </button>
                        )}

                        {isFailed && (
                          <button
                            onClick={() => handleRetryLog(log)}
                            disabled={retryingLogId === log.id}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                          >
                            <RefreshCw className={`w-3 h-3 ${retryingLogId === log.id ? 'animate-spin' : ''}`} />
                            <span>Réessayer</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: MODÈLES DE MESSAGES (10 ÉVÉNEMENTS) */}
      {/* ======================================================== */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 tab-enter">
          {/* Events Sidebar */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 border border-gray-100 dark:border-gray-700 shadow-xs space-y-1">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-2">10 Événements Pris en Charge</h3>
            {Object.keys(DEFAULT_TEMPLATES).map(eventKey => {
              const isSelected = selectedEventKey === eventKey;
              return (
                <button
                  key={eventKey}
                  onClick={() => handleSelectEventKey(eventKey)}
                  className={`w-full text-left p-3 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="truncate">{DEFAULT_TEMPLATES[eventKey as NotificationEvent].title}</span>
                  <span className="text-[10px] opacity-75 font-mono ml-2">#{eventKey.split('_')[0]}</span>
                </button>
              );
            })}
          </div>

          {/* Template Editor & Preview */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-gray-100 dark:border-gray-700 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                    Modèle : {DEFAULT_TEMPLATES[selectedEventKey as NotificationEvent]?.title}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">ID Événement : {selectedEventKey}</p>
                </div>
                <button
                  onClick={handleSaveTemplate}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 shadow-xs cursor-pointer"
                >
                  Sauvegarder le modèle
                </button>
              </div>

              {/* Title input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Titre / Objet du message
                </label>
                <input
                  type="text"
                  value={editingTitle}
                  onChange={e => setEditingTitle(e.target.value)}
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500"
                />
              </div>

              {/* Body input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Corps du message (Supporte les balises dynamiques)
                </label>
                <textarea
                  rows={4}
                  value={editingBody}
                  onChange={e => setEditingBody(e.target.value)}
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs leading-relaxed outline-none focus:border-indigo-500"
                />
              </div>

              {/* Variable placeholders cheatsheet */}
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900 text-xs text-indigo-950 dark:text-indigo-200 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Balises disponibles pour ce modèle :
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['{destinataire}', '{montant}', '{logement}', '{date_echeance}', '{lien}', '{ticket}', '{technicien}', '{telephone_tech}', '{type_frais}', '{jours_retard}', '{date_fin}', '{immeuble}'].map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-white dark:bg-gray-800 rounded-md font-mono text-[10px] font-bold border border-indigo-200 dark:border-gray-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900/60 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Aperçu Réel Rendu au Destinataire</span>
                <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/80 dark:border-gray-700 text-xs space-y-1.5 shadow-xs">
                  <p className="font-extrabold text-gray-900 dark:text-white">
                    {renderTemplate(editingTitle, previewVars)}
                  </p>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    {renderTemplate(editingBody, previewVars)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: PRÉFÉRENCES & CANAUX DE COMMUNICATION */}
      {/* ======================================================== */}
      {activeTab === 'preferences' && (
        <div className="max-w-3xl mx-auto space-y-6 tab-enter">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-gray-100 dark:border-gray-700 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Canaux de Communication Autorisés</h3>
                <p className="text-xs text-gray-500">Activez ou désactivez les canaux pour l'expédition automatique</p>
              </div>
              <button
                onClick={handleSavePreferences}
                disabled={savingPrefs}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
              >
                {savingPrefs ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>

            {/* Channels toggles with Test Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* In-App */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 flex items-center justify-center font-bold">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-gray-900 dark:text-white">Notifications In-App</p>
                      <p className="text-[11px] text-gray-500">Cloche, badges & centre d'alertes</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.inAppEnabled}
                    onChange={e => setPrefs({ ...prefs, inAppEnabled: e.target.checked })}
                    className="w-5 h-5 accent-indigo-600 cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleTestDispatch('in_app')}
                  className="w-full py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 cursor-pointer"
                >
                  Tester l'envoi In-App
                </button>
              </div>

              {/* WhatsApp */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-gray-900 dark:text-white">WhatsApp Business</p>
                      <p className="text-[11px] text-gray-500">Click-to-chat & API Cloud intégrée</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.whatsappEnabled}
                    onChange={e => setPrefs({ ...prefs, whatsappEnabled: e.target.checked })}
                    className="w-5 h-5 accent-emerald-600 cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleTestDispatch('whatsapp')}
                  className="w-full py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 cursor-pointer"
                >
                  Tester l'envoi WhatsApp
                </button>
              </div>

              {/* SMS */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center font-bold">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-gray-900 dark:text-white">SMS Direct</p>
                      <p className="text-[11px] text-gray-500">Fournisseur compatible télécom</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.smsEnabled}
                    onChange={e => setPrefs({ ...prefs, smsEnabled: e.target.checked })}
                    className="w-5 h-5 accent-amber-600 cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleTestDispatch('sms')}
                  className="w-full py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 cursor-pointer"
                >
                  Tester l'envoi SMS
                </button>
              </div>

              {/* Email */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center font-bold">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-gray-900 dark:text-white">Courriel (Email)</p>
                      <p className="text-[11px] text-gray-500">Quittances & avis de loyer</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.emailEnabled}
                    onChange={e => setPrefs({ ...prefs, emailEnabled: e.target.checked })}
                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleTestDispatch('email')}
                  className="w-full py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 cursor-pointer"
                >
                  Tester l'envoi Email
                </button>
              </div>
            </div>

            {/* Granular event subscriptions */}
            <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <h4 className="text-xs font-extrabold text-gray-900 dark:text-white uppercase tracking-wider">
                Abonnements aux événements
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {Object.keys(DEFAULT_TEMPLATES).map(eventKey => {
                  const isChecked = prefs.subscribedEvents.includes(eventKey);
                  return (
                    <label key={eventKey} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setPrefs({ ...prefs, subscribedEvents: [...prefs.subscribedEvents, eventKey] });
                          } else {
                            setPrefs({ ...prefs, subscribedEvents: prefs.subscribedEvents.filter(k => k !== eventKey) });
                          }
                        }}
                        className="w-4 h-4 accent-indigo-600 rounded"
                      />
                      <span className="font-semibold text-gray-700 dark:text-gray-300">
                        {DEFAULT_TEMPLATES[eventKey as NotificationEvent].title}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Diffuser une notification manuelle / annonce */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-slate-900/10 dark:bg-black/20 flex items-center justify-center p-4 z-50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-lg w-full space-y-4 border border-gray-100 dark:border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Diffuser une Notification</h3>
                  <p className="text-xs text-gray-500">Envoi multicanal immédiat avec anti-doublon</p>
                </div>
              </div>
              <button onClick={() => setShowBroadcastModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Destinataires ciblés
                </label>
                <select
                  value={selectedRecipientId}
                  onChange={e => setSelectedRecipientId(e.target.value)}
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold outline-none"
                >
                  <option value="all">Tous les locataires enregistrés ({tenantsList.length})</option>
                  {tenantsList.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} • {t.address || 'Logement'} {t.phone ? `(${t.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Canaux d'envoi simultanés
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'in_app', label: 'In-App' },
                    { id: 'whatsapp', label: 'WhatsApp' },
                    { id: 'sms', label: 'SMS' },
                    { id: 'email', label: 'Email' },
                  ].map(c => {
                    const active = broadcastChannels.includes(c.id as any);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          if (active) {
                            setBroadcastChannels(broadcastChannels.filter(ch => ch !== c.id));
                          } else {
                            setBroadcastChannels([...broadcastChannels, c.id as any]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                          active
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Titre du message
                </label>
                <input
                  type="text"
                  placeholder="Ex: Information importante - Travaux d'immeuble"
                  value={broadcastTitle}
                  onChange={e => setBroadcastTitle(e.target.value)}
                  required
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Contenu du message
                </label>
                <textarea
                  rows={3}
                  placeholder="Saisissez votre communiqué..."
                  value={broadcastMessage}
                  onChange={e => setBroadcastMessage(e.target.value)}
                  required
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl leading-relaxed outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={sendingBroadcast}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {sendingBroadcast ? 'Diffusion...' : 'Envoyer la notification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
