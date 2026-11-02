import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  Building, 
  AlertTriangle, 
  Search, 
  CheckCircle2, 
  Trash2, 
  RefreshCw,
  Sparkles,
  Activity,
  Server
} from 'lucide-react';
import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  limit 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import toast from 'react-hot-toast';

interface LandlordUser {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  subscriptionPlan?: string;
  createdAt?: string;
  lastLogin?: string;
  disabled?: boolean;
}

interface AppErrorLog {
  id: string;
  message?: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userId?: string;
  userEmail?: string;
  createdAt?: string;
  resolved?: boolean;
}

export function Admin() {
  const [activeTab, setActiveTab] = useState<'overview' | 'landlords' | 'errors' | 'subscriptions'>('overview');
  const [loading, setLoading] = useState(true);
  
  // Platform stats
  const [stats, setStats] = useState({
    totalLandlords: 0,
    totalTenants: 0,
    totalProperties: 0,
    totalPayments: 0,
    unresolvedErrors: 0,
    proSubscribers: 0
  });

  // Data lists
  const [landlords, setLandlords] = useState<LandlordUser[]>([]);
  const [errors, setErrors] = useState<AppErrorLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorSearch, setErrorSearch] = useState('');

  // Check admin authorization
  const currentUserEmail = auth.currentUser?.email?.toLowerCase() || '';
  const isSuperAdmin = currentUserEmail === 'mushitujacques3@gmail.com' || currentUserEmail.includes('admin');

  // Manual refresh helper
  const handleManualRefresh = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const loadedLandlords: LandlordUser[] = [];
      let proCount = 0;

      usersSnap.forEach((d) => {
        const u = { id: d.id, ...d.data() } as LandlordUser;
        if (u.role === 'landlord' || (!u.role && !u.email?.includes('locataire'))) {
          loadedLandlords.push(u);
          if (u.subscriptionPlan === 'pro' || u.subscriptionPlan === 'enterprise') {
            proCount++;
          }
        }
      });
      setLandlords(loadedLandlords);

      const [tenantsSnap, propSnap, paySnap] = await Promise.all([
        getDocs(collection(db, 'tenants')),
        getDocs(collection(db, 'properties')),
        getDocs(collection(db, 'payments'))
      ]);

      setStats(prev => ({
        ...prev,
        totalLandlords: loadedLandlords.length,
        totalTenants: tenantsSnap.size,
        totalProperties: propSnap.size,
        totalPayments: paySnap.size,
        proSubscribers: proCount
      }));
      toast.success("Données actualisées");
    } catch (err: any) {
      console.warn("Erreur chargement données admin:", err);
      toast.error("Échec de l'actualisation");
    } finally {
      setLoading(false);
    }
  };

  // Real-time listener for app errors and initial load
  useEffect(() => {
    let isMounted = true;

    async function fetchPlatformData() {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        if (!isMounted) return;
        const loadedLandlords: LandlordUser[] = [];
        let proCount = 0;

        usersSnap.forEach((d) => {
          const u = { id: d.id, ...d.data() } as LandlordUser;
          if (u.role === 'landlord' || (!u.role && !u.email?.includes('locataire'))) {
            loadedLandlords.push(u);
            if (u.subscriptionPlan === 'pro' || u.subscriptionPlan === 'enterprise') {
              proCount++;
            }
          }
        });
        setLandlords(loadedLandlords);

        const [tenantsSnap, propSnap, paySnap] = await Promise.all([
          getDocs(collection(db, 'tenants')),
          getDocs(collection(db, 'properties')),
          getDocs(collection(db, 'payments'))
        ]);
        if (!isMounted) return;

        setStats(prev => ({
          ...prev,
          totalLandlords: loadedLandlords.length,
          totalTenants: tenantsSnap.size,
          totalProperties: propSnap.size,
          totalPayments: paySnap.size,
          proSubscribers: proCount
        }));
      } catch (err: any) {
        console.warn("Erreur chargement données admin:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchPlatformData();

    const qErrors = query(collection(db, 'app_errors'), limit(50));
    const unsubErrors = onSnapshot(qErrors, (snapshot) => {
      if (!isMounted) return;
      const errs: AppErrorLog[] = [];
      snapshot.forEach((d) => {
        errs.push({ id: d.id, ...d.data() } as AppErrorLog);
      });
      // Sort newest first
      errs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setErrors(errs);
      const unresolved = errs.filter(e => !e.resolved).length;
      setStats(s => ({ ...s, unresolvedErrors: unresolved }));
    }, (err) => {
      console.warn("Erreur écoute app_errors:", err);
    });

    return () => {
      isMounted = false;
      unsubErrors();
    };
  }, []);

  // Toggle resolve error
  const handleToggleResolveError = async (errorId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'app_errors', errorId), {
        resolved: !currentStatus,
        resolvedAt: new Date().toISOString(),
        resolvedBy: auth.currentUser?.email || 'admin'
      });
      toast.success(currentStatus ? 'Erreur marquée comme non résolue' : 'Incident marqué comme résolu');
    } catch (err: any) {
      console.warn(err);
      toast.error("Impossible de mettre à jour l'incident");
    }
  };

  // Delete error log
  const handleDeleteError = async (errorId: string) => {
    if (!window.confirm("Supprimer définitivement ce log d'erreur ?")) return;
    try {
      await deleteDoc(doc(db, 'app_errors', errorId));
      toast.success("Rapport d'erreur supprimé");
    } catch (err: any) {
      console.warn(err);
      toast.error("Erreur lors de la suppression");
    }
  };

  // Filtered landlords
  const filteredLandlords = landlords.filter(l => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      l.name?.toLowerCase().includes(s) ||
      l.email?.toLowerCase().includes(s) ||
      l.phone?.includes(s)
    );
  });

  // Filtered errors
  const filteredErrors = errors.filter(e => {
    if (!errorSearch) return true;
    const s = errorSearch.toLowerCase();
    return (
      e.message?.toLowerCase().includes(s) ||
      e.url?.toLowerCase().includes(s) ||
      e.userEmail?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            Console d'Administration Système • ImmoGest
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Supervision & Contrôle Plateforme
          </h1>
          <p className="text-slate-300 text-sm max-w-2xl">
            Gestion globale des bailleurs inscrits, surveillance de l'intégrité applicative, audit des journaux d'erreurs et des abonnements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 text-white border border-white/20">
            {isSuperAdmin ? 'Super-Administrateur (Autorisé)' : 'Supervision Système'}
          </span>
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-xs transition border border-white/15"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('overview')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
            activeTab === 'overview'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          Vue d'ensemble
        </button>

        <button
          onClick={() => setActiveTab('landlords')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
            activeTab === 'landlords'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Bailleurs & Comptes ({landlords.length})
        </button>

        <button
          onClick={() => setActiveTab('errors')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
            activeTab === 'errors'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Journal d'Erreurs ({stats.unresolvedErrors > 0 ? `${stats.unresolvedErrors} non résolues` : '0'})
        </button>
      </div>

      {/* TAB 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase">Bailleurs Actifs</span>
                <Users className="w-5 h-5 text-indigo-500" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {stats.totalLandlords}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">Comptes propriétaires enregistrés</span>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase">Locataires Suivis</span>
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {stats.totalTenants}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">Locataires dans le système</span>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase">Biens & Immeubles</span>
                <Building className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {stats.totalProperties}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">Parcelles et appartements gérés</span>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase">Incidents Système</span>
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                {stats.unresolvedErrors}
              </div>
              <span className="text-xs text-rose-500 font-medium mt-1 block">Rapports d'erreurs en attente</span>
            </div>
          </div>

          {/* Quick System Status Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-500" />
              État de Santé des Services ImmoGest
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Base de Données Firestore</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Opérationnelle
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Projet : <code className="font-mono text-indigo-600 dark:text-indigo-400">ai-studio-92db0aef</code>
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Firebase Authentication</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Actif (Email + Google)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Validation des rôles et sessions clients actifs.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Stockage des Justificatifs</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Max 10 Mo
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Preuves de paiement, devis et états des lieux protégés.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Landlords Management */}
      {activeTab === 'landlords' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Comptes Bailleurs Enregistrés ({filteredLandlords.length})
              </h2>
              <p className="text-xs text-slate-500">
                Supervision des profils bailleurs et de leur niveau d'abonnement.
              </p>
            </div>

            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher nom, email, tél..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 uppercase font-semibold text-slate-500 border-y border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Bailleur</th>
                  <th className="py-3 px-4">Coordonnées</th>
                  <th className="py-3 px-4">Forfait Actif</th>
                  <th className="py-3 px-4">Rôle</th>
                  <th className="py-3 px-4">Date de Création</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLandlords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Aucun compte bailleur trouvé correspondant aux critères.
                    </td>
                  </tr>
                ) : (
                  filteredLandlords.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-slate-400" />
                          {l.name || 'Bailleur sans nom'}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">UID: {l.id.slice(0, 8)}...</span>
                      </td>
                      <td className="py-3.5 px-4 space-y-0.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{l.email || 'Pas d\'email'}</div>
                        <div className="text-[11px] text-slate-400">{l.phone || 'Pas de numéro'}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                          l.subscriptionPlan === 'pro'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : l.subscriptionPlan === 'enterprise'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          <Sparkles className="w-3 h-3" />
                          {l.subscriptionPlan ? l.subscriptionPlan.toUpperCase() : 'FREE (Standard)'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          {l.role || 'landlord'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {l.createdAt ? new Date(l.createdAt).toLocaleDateString('fr-FR') : 'Non renseignée'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: System Error Logs */}
      {activeTab === 'errors' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Journal des Incidents & Exceptions Capturées ({filteredErrors.length})
              </h2>
              <p className="text-xs text-slate-500">
                Événements enregistrés automatiquement par le composant <code className="font-mono">ErrorBoundary</code> dans la collection <code className="font-mono">app_errors</code>.
              </p>
            </div>

            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrer message, url..."
                value={errorSearch}
                onChange={(e) => setErrorSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredErrors.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2 opacity-60" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">Aucun incident système répertorié</p>
                <p className="text-xs text-slate-500">L'application fonctionne actuellement sans plantage capturé.</p>
              </div>
            ) : (
              filteredErrors.map((err) => (
                <div 
                  key={err.id}
                  className={`p-4 rounded-xl border transition ${
                    err.resolved
                      ? 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 opacity-60'
                      : 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/40'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        err.resolved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-600 text-white'
                      }`}>
                        {err.resolved ? 'RÉSOLU' : 'EN COURS'}
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {err.message || 'Erreur non spécifiée'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">
                        {err.createdAt ? new Date(err.createdAt).toLocaleString('fr-FR') : 'Date inconnue'}
                      </span>
                      <button
                        onClick={() => handleToggleResolveError(err.id, !!err.resolved)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 font-medium"
                      >
                        {err.resolved ? 'Marquer actif' : 'Marquer résolu'}
                      </button>
                      <button
                        onClick={() => handleDeleteError(err.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500"
                        title="Supprimer le log"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {err.url && (
                    <div className="mt-2 text-xs text-slate-500 font-mono">
                      URL : {err.url}
                    </div>
                  )}

                  {err.stack && (
                    <pre className="mt-2 p-2.5 rounded-lg bg-slate-900 text-slate-300 font-mono text-[11px] overflow-x-auto max-h-32">
                      {err.stack}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
