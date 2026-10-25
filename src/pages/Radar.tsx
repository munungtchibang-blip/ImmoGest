import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { 
  Radio, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Filter, 
  Search, 
  RefreshCw, 
  MessageSquare, 
  FileSignature, 
  Wrench, 
  DollarSign, 
  Building2, 
  User, 
  Clock, 
  Check, 
  X, 
  SlidersHorizontal,
  Send
} from 'lucide-react';
import { 
  RadarAlert, 
  RadarSettings, 
  DEFAULT_RADAR_SETTINGS, 
  getRadarSettings, 
  saveRadarSettings, 
  runRadarAnalysis, 
  updateRadarAlertStatus 
} from '../services/radarEngine';
import { openWhatsAppChat, openSMSClient } from '../services/notificationService';
import toast from 'react-hot-toast';

export function Radar() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<RadarAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'active' | 'resolved' | 'dismissed' | 'all'>('active');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Settings
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<RadarSettings>(DEFAULT_RADAR_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  // Resolve Alert Modal
  const [resolvingAlert, setResolvingAlert] = useState<RadarAlert | null>(null);
  const [resolveComment, setResolveComment] = useState('');
  const [submittingResolve, setSubmittingResolve] = useState(false);

  // Load Settings and Alerts
  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    // Load custom settings
    getRadarSettings(uid).then(setSettings);

    // Realtime alerts listener
    const q = query(collection(db, 'radar_alerts'), where('landlordId', '==', uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as RadarAlert[];
      // Sort: Active first, then by priority (Critique > Haute > Moyenne > Info), then latest
      const priorityOrder: Record<string, number> = { 'Critique': 4, 'Haute': 3, 'Moyenne': 2, 'Info': 1 };
      items.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        const pDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (pDiff !== 0) return pDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setAlerts(items);
      setLoading(false);
    }, (err) => {
      console.error("Radar subscription error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Trigger Instant Analysis
  const handleRunScan = async () => {
    if (!auth.currentUser) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await runRadarAnalysis(auth.currentUser.uid);
      setScanResult(`Scan terminé : ${res.newAlertsCount} nouvelle(s) situation(s) identifiée(s), ${res.totalActiveAlerts} alerte(s) active(s) surveillée(s).`);
      toast.success(res.newAlertsCount > 0 ? `${res.newAlertsCount} nouvelle(s) alerte(s) détectée(s)` : "Toutes les situations sont sous contrôle !");
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur d'analyse Radar : " + (err.message || "Erreur"));
    } finally {
      setScanning(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setSavingSettings(true);
    try {
      await saveRadarSettings({ ...settings, landlordId: auth.currentUser.uid });
      setShowSettingsModal(false);
      toast.success("Paramètres et seuils Radar enregistrés.");
      handleRunScan(); // Re-scan with new thresholds
    } catch (err: any) {
      toast.error("Erreur d'enregistrement : " + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Resolve Alert Action
  const handleConfirmResolve = async () => {
    if (!resolvingAlert) return;
    setSubmittingResolve(true);
    try {
      await updateRadarAlertStatus(resolvingAlert.id, 'resolved', resolveComment);
      toast.success("Alerte marquée comme traitée.");
      setResolvingAlert(null);
      setResolveComment('');
    } catch (err: any) {
      toast.error("Erreur : " + err.message);
    } finally {
      setSubmittingResolve(false);
    }
  };

  // Dismiss / Ignore Alert Action
  const handleDismissAlert = async (alert: RadarAlert) => {
    try {
      await updateRadarAlertStatus(alert.id, 'dismissed', 'Alerte ignorée par le gestionnaire.');
      toast.success("Alerte archivée.");
    } catch (err: any) {
      toast.error("Erreur : " + err.message);
    }
  };

  // Contextual Action Handler
  const handleExecuteAction = (alert: RadarAlert) => {
    switch (alert.actionType) {
      case 'contact_whatsapp':
        if (alert.tenantPhone) {
          const msg = `Bonjour ${alert.tenantName || 'cher locataire'}, concernant votre logement ImmoGest : ${alert.title}. ${alert.description}`;
          openWhatsAppChat(alert.tenantPhone, msg);
        } else {
          toast.error("Aucun numéro de téléphone enregistré pour ce locataire.");
        }
        break;
      case 'contact_sms':
        if (alert.tenantPhone) {
          openSMSClient(alert.tenantPhone, `ImmoGest : ${alert.title}. Merci de consulter votre espace.`);
        }
        break;
      case 'view_contract':
        navigate('/contracts');
        break;
      case 'assign_tech':
        navigate('/maintenance');
        break;
      case 'review_transaction':
        navigate('/payments');
        break;
      case 'view_property':
        navigate(alert.propertyId ? `/properties/${alert.propertyId}` : '/properties');
        break;
      case 'view_tenant':
        navigate(alert.tenantId ? `/tenants/${alert.tenantId}` : '/tenants');
        break;
      default:
        navigate('/');
    }
  };

  // Metrics
  const activeAlerts = useMemo(() => alerts.filter(a => a.status === 'active'), [alerts]);
  const criticalCount = useMemo(() => activeAlerts.filter(a => a.priority === 'Critique').length, [activeAlerts]);
  const highCount = useMemo(() => activeAlerts.filter(a => a.priority === 'Haute').length, [activeAlerts]);
  const resolvedCount = useMemo(() => alerts.filter(a => a.status === 'resolved').length, [alerts]);

  // Filtered list
  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = a.title.toLowerCase().includes(q);
        const matchDesc = a.description.toLowerCase().includes(q);
        const matchProp = a.propertyName?.toLowerCase().includes(q);
        const matchTenant = a.tenantName?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchProp && !matchTenant) return false;
      }
      return true;
    });
  }, [alerts, statusFilter, priorityFilter, categoryFilter, searchQuery]);

  return (
    <div className="space-y-6 page-enter pb-16">
      {/* Radar HUD Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 text-white p-6 sm:p-8 shadow-xl border border-indigo-900/60">
        {/* Radar Sweep Effect Background */}
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full border border-indigo-500/20 pointer-events-none flex items-center justify-center animate-pulse">
          <div className="w-60 h-60 rounded-full border border-indigo-400/20 flex items-center justify-center">
            <div className="w-40 h-40 rounded-full border border-cyan-400/30 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-cyan-500/10"></div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 tracking-wider uppercase">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                Surveillance Active
              </span>
              <span className="text-xs text-indigo-200">Centre d'analyse décisionnelle</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              <Radio className="w-8 h-8 text-cyan-400" />
              Imomgest Radar
            </h1>
            <p className="text-xs sm:text-sm text-indigo-100/80 leading-relaxed">
              Détecte proactivement les retards de loyer, expirations de baux, vacances de logements, dérives budgétaires et anomalies de données sans jamais altérer vos contrats unilatéralement.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="px-4 py-3 bg-white/10 hover:bg-white/15 text-white border border-white/20 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer backdrop-blur-sm"
            >
              <SlidersHorizontal className="w-4 h-4 text-cyan-300" />
              <span>Seuils & Règles</span>
            </button>

            <button
              onClick={handleRunScan}
              disabled={scanning}
              className="px-5 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-cyan-500/25 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Scan en cours...' : 'Lancer le Scan Radar'}</span>
            </button>
          </div>
        </div>

        {scanResult && (
          <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-400/30 rounded-xl text-xs text-cyan-200 flex items-center justify-between">
            <span>{scanResult}</span>
            <button onClick={() => setScanResult(null)} className="text-cyan-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs card-enter">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Alertes Actives</span>
            <span className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Radio className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">{activeAlerts.length}</span>
            <span className="text-xs text-gray-400">situations</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs card-enter">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Critiques</span>
            <span className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">{criticalCount}</span>
            <span className="text-xs text-rose-500 font-semibold">Priorité absolue</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs card-enter">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Hautes</span>
            <span className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <AlertCircle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">{highCount}</span>
            <span className="text-xs text-amber-500 font-semibold">À traiter rapidement</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs card-enter">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Traitées</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">{resolvedCount}</span>
            <span className="text-xs text-emerald-500 font-semibold">Résolues</span>
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-1">
            {[
              { id: 'active', label: 'Actives', count: activeAlerts.length },
              { id: 'resolved', label: 'Traitées', count: resolvedCount },
              { id: 'dismissed', label: 'Ignorées', count: alerts.filter(a => a.status === 'dismissed').length },
              { id: 'all', label: 'Toutes', count: alerts.length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher par mot-clé, bien ou locataire..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Priority & Category Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60 text-xs">
          <span className="text-gray-400 font-bold flex items-center gap-1">
            <Filter className="w-3 h-3" /> Priorité :
          </span>
          {['all', 'Critique', 'Haute', 'Moyenne', 'Info'].map(p => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                priorityFilter === p
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
              }`}
            >
              {p === 'all' ? 'Toutes' : p}
            </button>
          ))}

          <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>

          <span className="text-gray-400 font-bold">Catégorie :</span>
          {['all', 'Finances', 'Baux', 'Technique', 'Patrimoine', 'Données'].map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                categoryFilter === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
              }`}
            >
              {c === 'all' ? 'Toutes' : c}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs">Chargement des alertes Radar...</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-100 dark:border-gray-700 shadow-xs space-y-3">
            <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Aucune alerte correspondante</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {statusFilter === 'active' 
                ? "Excellent ! Aucun incident opérationnel, retard ou anomalie détecté avec les seuils actuels."
                : "Aucune alerte enregistrée sous ces critères de recherche."}
            </p>
            {statusFilter === 'active' && (
              <button
                onClick={handleRunScan}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-100"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Forcer une vérification maintenant
              </button>
            )}
          </div>
        ) : (
          filteredAlerts.map(alert => {
            const isCritical = alert.priority === 'Critique';
            const isHigh = alert.priority === 'Haute';
            const isResolved = alert.status === 'resolved';

            return (
              <div
                key={alert.id}
                className={`bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border shadow-xs transition-all card-enter ${
                  isResolved
                    ? 'border-gray-100 dark:border-gray-700/60 opacity-80'
                    : isCritical
                    ? 'border-rose-300 dark:border-rose-900/60 bg-gradient-to-r from-white via-rose-50/20 to-white dark:from-gray-800 dark:via-rose-950/20'
                    : isHigh
                    ? 'border-amber-300 dark:border-amber-900/60'
                    : 'border-gray-100 dark:border-gray-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Priority Tag */}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        alert.priority === 'Critique'
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200'
                          : alert.priority === 'Haute'
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200'
                          : alert.priority === 'Moyenne'
                          ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}>
                        {alert.priority}
                      </span>

                      {/* Anomaly vs Alert Distinction */}
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        alert.isAnomaly 
                          ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300' 
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}>
                        {alert.isAnomaly ? 'Anomalie Détectée' : 'Situation de Gestion'}
                      </span>

                      {/* Category Tag */}
                      <span className="text-[11px] font-bold text-gray-400">
                        • {alert.category}
                      </span>

                      {/* Timestamp */}
                      <span className="text-[11px] text-gray-400 ml-auto sm:ml-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(alert.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-white break-words">
                      {alert.title}
                    </h3>

                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {alert.description}
                    </p>

                    {/* Associated Property and Tenant Badges */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      {alert.propertyName && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 font-semibold border border-gray-100 dark:border-gray-700">
                          <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                          {alert.propertyName}
                        </span>
                      )}
                      {alert.tenantName && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 font-semibold border border-gray-100 dark:border-gray-700">
                          <User className="w-3.5 h-3.5 text-blue-600" />
                          {alert.tenantName} {alert.tenantPhone ? `(${alert.tenantPhone})` : ''}
                        </span>
                      )}
                    </div>

                    {/* Resolution Note if resolved */}
                    {alert.resolutionComment && (
                      <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2 mt-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Commentaire de clôture :</span> {alert.resolutionComment}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-2 sm:pt-0">
                    {alert.status === 'active' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleExecuteAction(alert)}
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          {alert.actionType === 'contact_whatsapp' && <Send className="w-3.5 h-3.5" />}
                          {alert.actionType === 'contact_sms' && <MessageSquare className="w-3.5 h-3.5" />}
                          {alert.actionType === 'view_contract' && <FileSignature className="w-3.5 h-3.5" />}
                          {alert.actionType === 'assign_tech' && <Wrench className="w-3.5 h-3.5" />}
                          {alert.actionType === 'review_transaction' && <DollarSign className="w-3.5 h-3.5" />}
                          <span>{alert.suggestedActionLabel}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setResolvingAlert(alert);
                            setResolveComment('');
                          }}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Marquer traitée</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDismissAlert(alert)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
                          title="Ignorer cette alerte"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {alert.status === 'resolved' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Traitée
                      </span>
                    )}

                    {alert.status === 'dismissed' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        Ignorée
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Paramètres et seuils Radar */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-lg w-full space-y-5 border border-gray-100 dark:border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Seuils & Règles du Radar</h3>
                  <p className="text-xs text-gray-500">Personnalisez les déclencheurs de détection</p>
                </div>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Tolérance des loyers (Jour d'exigibilité)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={settings.rentGraceDays}
                    onChange={e => setSettings({ ...settings, rentGraceDays: Number(e.target.value) })}
                    className="w-24 p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold"
                  />
                  <span className="text-gray-500">du mois (alerte si impayé après ce jour)</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Alerte fin de contrat (Baux expirants)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={7}
                    max={180}
                    value={settings.contractExpiryAlertDays}
                    onChange={e => setSettings({ ...settings, contractExpiryAlertDays: Number(e.target.value) })}
                    className="w-24 p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold"
                  />
                  <span className="text-gray-500">jours avant l'échéance du bail</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Alerte vacance prolongée de logement
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={365}
                    value={settings.vacancyAlertDays}
                    onChange={e => setSettings({ ...settings, vacancyAlertDays: Number(e.target.value) })}
                    className="w-24 p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold"
                  />
                  <span className="text-gray-500">jours consécutifs sans locataire</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Plafond mensuel de dépenses ($)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={100}
                    value={settings.monthlyBudgetLimit}
                    onChange={e => setSettings({ ...settings, monthlyBudgetLimit: Number(e.target.value) })}
                    className="w-32 p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold"
                  />
                  <span className="text-gray-500">$ / mois (alerte si total dépenses dépasse ce seuil)</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Seuil de hausse anormale d'entretien (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={settings.maintenanceCostSpikePercentage}
                    onChange={e => setSettings({ ...settings, maintenanceCostSpikePercentage: Number(e.target.value) })}
                    className="w-24 p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold"
                  />
                  <span className="text-gray-500">% d'augmentation par rapport à la moyenne trimestrielle</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Délai maximal de prise en charge réparation urgente
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={6}
                    max={168}
                    value={settings.urgentMaintenanceMaxHours}
                    onChange={e => setSettings({ ...settings, urgentMaintenanceMaxHours: Number(e.target.value) })}
                    className="w-24 p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold"
                  />
                  <span className="text-gray-500">heures sans technicien ou sans résolution</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Délai de rappel d'invitation non activée
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={2}
                    max={60}
                    value={settings.invitationTimeoutDays}
                    onChange={e => setSettings({ ...settings, invitationTimeoutDays: Number(e.target.value) })}
                    className="w-24 p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl font-bold"
                  />
                  <span className="text-gray-500">jours avant rappel du portail locataire</span>
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingSettings ? 'Enregistrement...' : 'Enregistrer & Scanner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Résoudre Alerte avec commentaire */}
      {resolvingAlert && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-sm w-full space-y-4 border border-gray-100 dark:border-gray-700 shadow-2xl">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Clôturer l'Alerte</h3>
              <p className="text-xs text-gray-500 mt-1">{resolvingAlert.title}</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Commentaire de résolution (optionnel)
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Le locataire a effectué un virement, quittance validée..."
                value={resolveComment}
                onChange={e => setResolveComment(e.target.value)}
                className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResolvingAlert(null)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-xl"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmResolve}
                disabled={submittingResolve}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                {submittingResolve ? 'Traitement...' : 'Confirmer la clôture'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
