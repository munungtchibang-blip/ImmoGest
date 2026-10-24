import { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  Users, 
  CreditCard, 
  AlertCircle, 
  TrendingUp, 
  MessageCircle, 
  Calculator, 
  Wrench, 
  X, 
  Home, 
  LayoutDashboard, 
  PieChart, 
  Building2, 
  ArrowUpRight, 
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSubscription } from '../context/SubscriptionContext';

type DashboardTab = 'overview' | 'finances' | 'occupations';

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { subscription, openSubscriptionModal } = useSubscription();

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [tenants, setTenants] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalTenants: 0,
    monthlyRevenue: 0,
    monthlyWater: 0,
    monthlyElectricity: 0,
    monthlyExpenses: 0,
    pendingIssues: 0
  });
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showLateModal, setShowLateModal] = useState(false);
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [showUnoccupiedModal, setShowUnoccupiedModal] = useState(false);
  const [hiddenNotifications, setHiddenNotifications] = useState<string[]>([]);

  useEffect(() => {
    const handleStorageChange = () => {
      const hidden = JSON.parse(localStorage.getItem('hiddenNotifications') || '[]');
      setHiddenNotifications(hidden);
    };
    handleStorageChange();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    // Listen to tenants
    const qTenants = query(collection(db, 'tenants'), where('landlordId', '==', uid));
    const unsubTenants = onSnapshot(qTenants, (snapshot) => {
      const tData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTenants(tData);
      setStats(prev => ({ ...prev, totalTenants: snapshot.size }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tenants');
    });

    // Listen to properties
    const qProperties = query(collection(db, 'properties'), where('landlordId', '==', uid));
    const unsubProperties = onSnapshot(qProperties, (snapshot) => {
      const pData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProperties(pData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'properties');
    });

    // Listen to payments this month
    const start = startOfMonth(new Date()).toISOString();
    const end = endOfMonth(new Date()).toISOString();
    const qPayments = query(
      collection(db, 'payments'),
      where('landlordId', '==', uid)
    );
    const unsubPayments = onSnapshot(qPayments, (snapshot) => {
      const pData = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setPayments(pData);
      
      let total = 0;
      let totalWater = 0;
      let totalElectricity = 0;
      pData.forEach(p => {
        if (p.date >= start && p.date <= end) {
          if (p.type === 'Loyer') total += p.amount;
          if (p.type === 'Eau') totalWater += p.amount;
          if (p.type === 'Électricité') totalElectricity += p.amount;
        }
      });
      setStats(prev => ({ 
        ...prev, 
        monthlyRevenue: total,
        monthlyWater: totalWater,
        monthlyElectricity: totalElectricity
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payments');
    });

    // Listen to maintenance issues
    const qIssues = query(
      collection(db, 'maintenance'),
      where('landlordId', '==', uid),
      where('status', 'in', ['En attente', 'En cours'])
    );
    const unsubIssues = onSnapshot(qIssues, (snapshot) => {
      setStats(prev => ({ ...prev, pendingIssues: snapshot.size }));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'maintenance');
    });

    // Listen to expenses this month
    const qExpenses = query(collection(db, 'expenses'), where('landlordId', '==', uid));
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      let totalExpenses = 0;
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.date >= start && data.date <= end) {
          totalExpenses += data.amount || 0;
        }
      });
      setStats(prev => ({ ...prev, monthlyExpenses: totalExpenses }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });

    return () => {
      unsubTenants();
      unsubProperties();
      unsubPayments();
      unsubIssues();
      unsubExpenses();
    };
  }, []);

  // Memoize heavy calculations
  const { lateTenants, expectedRevenue, totalGuarantees, unoccupiedStatus } = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const isLastDayOfMonth = today.getDate() === new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const previousMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    const late = tenants.filter(tenant => {
      const isHidden = hiddenNotifications.includes(`late_tenant_${tenant.id}`);
      if (isHidden) return false;

      const tenantPayments = payments.filter(p => p.tenantId === tenant.id && p.type === 'Loyer');
      
      const hasPaidCurrentMonth = tenantPayments.some(p => {
        const d = new Date(p.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      const hasPaidPreviousMonth = tenantPayments.some(p => {
        const d = new Date(p.date);
        return d.getMonth() === previousMonth && d.getFullYear() === previousMonthYear;
      });

      if (!hasPaidCurrentMonth && isLastDayOfMonth) return true;
      if (!hasPaidPreviousMonth) return true;

      return false;
    });

    const expected = tenants.reduce((sum, t) => sum + (Number(t.monthlyRent) || 0), 0);
    const guarantees = tenants.reduce((sum, t) => sum + (Number(t.guaranteeAmount) || 0), 0);

    let totalUnoccupiedFloors = 0;
    const unoccupiedData: any[] = [];

    properties.forEach(property => {
      if (property.type === 'Appartement' || property.type === 'Immeuble') {
        const totalLevels = property.apartmentsCount || property.levels || 1;
        const occupiedLevels = tenants
          .filter(t => t.propertyId === property.id && t.level !== undefined && t.level !== null)
          .map(t => t.level);
        
        const unoccupiedCount = Math.max(0, totalLevels - occupiedLevels.length);
        if (unoccupiedCount > 0) {
          totalUnoccupiedFloors += unoccupiedCount;
          const unoccupiedLevelsList = [];
          for (let i = 0; i < totalLevels; i++) {
            if (!occupiedLevels.includes(i)) {
              unoccupiedLevelsList.push(i === 0 ? 'RDC' : `Étage ${i}`);
            }
          }
          unoccupiedData.push({
            id: property.id,
            name: property.name,
            type: property.type,
            unoccupiedCount,
            totalLevels,
            unoccupiedLevelsList
          });
        }
      } else if (property.status === 'Libre') {
        totalUnoccupiedFloors += 1;
        unoccupiedData.push({
          id: property.id,
          name: property.name,
          type: property.type,
          unoccupiedCount: 1,
          totalLevels: 1
        });
      }
    });

    return { 
      lateTenants: late, 
      expectedRevenue: expected, 
      totalGuarantees: guarantees,
      unoccupiedStatus: { total: totalUnoccupiedFloors, list: unoccupiedData }
    };
  }, [tenants, payments, properties, hiddenNotifications]);

  const sendWhatsAppReminder = (tenant: any) => {
    const phone = tenant.phone.replace(/\D/g, '');
    const message = `Bonjour ${tenant.name}, sauf erreur de notre part, le loyer de ce mois n'a pas encore été réglé. Merci de nous tenir informés.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const last12MonthsData = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      const d = subMonths(today, 11 - i);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      const total = payments.reduce((sum, p) => {
        if (p.type === 'Loyer' && p.date && p.date.startsWith(monthKey)) {
          return sum + Number(p.amount);
        }
        return sum;
      }, 0);

      const monthStr = d.toLocaleString('fr-FR', { month: 'short' });
      return {
        name: monthStr.charAt(0).toUpperCase() + monthStr.slice(1),
        Revenu: total
      };
    });
  }, [payments]);

  // Is Pro subscription recommended?
  const isProRecommended = (tenants.length >= 2 || properties.length >= 2) && subscription.tierId !== 'pro' && subscription.tierId !== 'vip';
  const netRevenue = stats.monthlyRevenue - stats.monthlyExpenses;
  const collectionRate = expectedRevenue > 0 ? Math.min(100, Math.round((stats.monthlyRevenue / expectedRevenue) * 100)) : 100;
  const totalUnits = properties.reduce((acc, p) => acc + (p.apartmentsCount || p.levels || 1), 0);
  const occupancyRate = totalUnits > 0 ? Math.round(((totalUnits - unoccupiedStatus.total) / totalUnits) * 100) : (tenants.length > 0 ? 100 : 0);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
        </div>
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3 } }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tab navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">
              {t('Dashboard')}
            </h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              subscription.tierId === 'pro' || subscription.tierId === 'vip'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            }`}>
              Forfait {subscription.tierId}
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            {t('Welcome, here is a summary of your properties.')}
          </p>
        </div>

        {/* Thematic Tabs switcher */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl border border-gray-200 dark:border-gray-700 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'overview'
                ? 'text-blue-600 dark:text-white bg-white dark:bg-gray-700 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Vue d'ensemble</span>
          </button>

          <button
            onClick={() => setActiveTab('finances')}
            className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'finances'
                ? 'text-emerald-600 dark:text-white bg-white dark:bg-gray-700 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <PieChart className="w-4 h-4" />
            <span>Finances</span>
          </button>

          <button
            onClick={() => setActiveTab('occupations')}
            className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeTab === 'occupations'
                ? 'text-indigo-600 dark:text-white bg-white dark:bg-gray-700 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Occupations</span>
          </button>
        </div>
      </div>

      {/* Pro recommendation banner if reached 2 tenants */}
      {isProRecommended && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-300 dark:border-amber-700/50 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">
                  Abonnement Pro Recommandé
                </h3>
                <span className="text-[10px] font-bold bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full">
                  Recommandé dès 2 locataires
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                Vous gérez actuellement {tenants.length} locataire(s) et {properties.length} bien(s). Débloquez la gestion illimitée, les quittances WhatsApp automatiques et les rapports comptables.
              </p>
            </div>
          </div>
          <button
            onClick={() => openSubscriptionModal('pro')}
            className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all"
          >
            <Sparkles className="w-4 h-4" />
            Passer à l'abonnement Pro
          </button>
        </motion.div>
      )}

      {/* Tab 1: Vue d'ensemble */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="space-y-6"
          >
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
              <motion.div
                variants={cardVariants}
                whileHover={{ y: -3, scale: 1.01 }}
                onClick={() => navigate('/tenants')}
                className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 hover:border-blue-300 dark:hover:border-blue-700/60 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Locataires Actifs</span>
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalTenants}</p>
                  <ArrowUpRight className="w-4 h-4 text-gray-400" />
                </div>
              </motion.div>

              <motion.div
                variants={cardVariants}
                whileHover={{ y: -3, scale: 1.01 }}
                onClick={() => setShowMonthlyModal(true)}
                className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Revenus du mois</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.monthlyRevenue.toLocaleString()} $</p>
                  <span className="text-[10px] text-gray-400">{collectionRate}% reçus</span>
                </div>
              </motion.div>

              <motion.div
                variants={cardVariants}
                whileHover={{ y: -3, scale: 1.01 }}
                onClick={() => setShowLateModal(true)}
                className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 hover:border-red-300 dark:hover:border-red-700/60 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Loyers en retard</span>
                  <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className={`text-2xl font-bold ${lateTenants.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                    {lateTenants.length}
                  </p>
                  {lateTenants.length > 0 && (
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400">À relancer</span>
                  )}
                </div>
              </motion.div>

              <motion.div
                variants={cardVariants}
                whileHover={{ y: -3, scale: 1.01 }}
                onClick={() => setShowUnoccupiedModal(true)}
                className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 hover:border-teal-300 dark:hover:border-teal-700/60 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Espaces Libres</span>
                  <div className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
                    <Home className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">{unoccupiedStatus.total}</p>
                  <span className="text-[10px] text-gray-400">{occupancyRate}% occupé</span>
                </div>
              </motion.div>

              <motion.div
                variants={cardVariants}
                whileHover={{ y: -3, scale: 1.01 }}
                onClick={() => navigate('/maintenance')}
                className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 hover:border-orange-300 dark:hover:border-orange-700/60 transition-all cursor-pointer flex flex-col justify-between col-span-2 sm:col-span-1"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Incidents en cours</span>
                  <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                    <Wrench className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.pendingIssues}</p>
                  <ArrowUpRight className="w-4 h-4 text-gray-400" />
                </div>
              </motion.div>
            </div>

            {/* Late Tenants WhatsApp Alert Banner */}
            {lateTenants.length > 0 && (
              <motion.div
                variants={cardVariants}
                className="bg-red-50/70 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-2xl p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-red-950 dark:text-red-300">
                        {lateTenants.length} loyer(s) en retard ce mois-ci
                      </h2>
                      <p className="text-xs text-red-700 dark:text-red-400">
                        Relancez rapidement vos locataires directement par message WhatsApp.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {lateTenants.slice(0, 4).map(tenant => (
                    <div
                      key={tenant.id}
                      className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-xl border border-red-100 dark:border-red-900/30 shadow-xs gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                          {tenant.name}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {tenant.address} • <span className="font-semibold text-red-600 dark:text-red-400">{tenant.monthlyRent} $</span>
                        </p>
                      </div>
                      <button
                        onClick={() => sendWhatsAppReminder(tenant)}
                        className="shrink-0 flex items-center gap-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Rappel WhatsApp</span>
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Quick Actions & Recent Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                to="/tenants"
                className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 hover:border-blue-400 dark:hover:border-blue-600 transition-all group flex items-center justify-between"
              >
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    Nouveau Locataire
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Créer contrat & portail d'accès
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Users className="w-5 h-5" />
                </div>
              </Link>

              <Link
                to="/payments"
                className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all group flex items-center justify-between"
              >
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    Encaisser un Paiement
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Loyer, eau, élec & quittance PDF
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <CreditCard className="w-5 h-5" />
                </div>
              </Link>

              <Link
                to="/expenses"
                className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80 hover:border-red-400 dark:hover:border-red-600 transition-all group flex items-center justify-between"
              >
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                    Enregistrer Dépense
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Travaux, charges, factures
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Calculator className="w-5 h-5" />
                </div>
              </Link>
            </div>
          </motion.div>
        )}

        {/* Tab 2: Finances */}
        {activeTab === 'finances' && (
          <motion.div
            key="finances"
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="space-y-6"
          >
            {/* Financial metrics grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
              <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Revenu Encaissé</span>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.monthlyRevenue.toLocaleString()} $</p>
                <span className="text-[10px] text-gray-400">Ce mois</span>
              </motion.div>

              <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Revenu Estimé</span>
                <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{expectedRevenue.toLocaleString()} $</p>
                <span className="text-[10px] text-gray-400">Prévisionnel</span>
              </motion.div>

              <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Dépenses</span>
                <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{stats.monthlyExpenses.toLocaleString()} $</p>
                <span className="text-[10px] text-gray-400">Charges du mois</span>
              </motion.div>

              <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Bénéfice Net</span>
                <p className={`text-xl font-bold mt-1 ${netRevenue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {netRevenue.toLocaleString()} $
                </p>
                <span className="text-[10px] text-gray-400">Recettes - Dépenses</span>
              </motion.div>

              <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Eau & Élec.</span>
                <p className="text-xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">
                  {(stats.monthlyWater + stats.monthlyElectricity).toLocaleString()} $
                </p>
                <span className="text-[10px] text-gray-400">Eau: {stats.monthlyWater}$ | Elec: {stats.monthlyElectricity}$</span>
              </motion.div>

              <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Garanties Détenues</span>
                <p className="text-xl font-bold text-pink-600 dark:text-pink-400 mt-1">{totalGuarantees.toLocaleString()} $</p>
                <span className="text-[10px] text-gray-400">Cautions locatives</span>
              </motion.div>
            </div>

            {/* 12-Month Revenue Evolution Chart */}
            <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">
                    Évolution des Loyers (12 derniers mois)
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Historique des encaissements mensuels
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-xl">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Taux de recouvrement: {collectionRate}%</span>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={last12MonthsData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" opacity={0.5} />
                    <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}$`} />
                    <Tooltip 
                      formatter={(val: any) => [`${Number(val).toLocaleString()} $`, 'Loyer Encaissé']}
                      contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    />
                    <Bar dataKey="Revenu" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Tab 3: Occupations */}
        {activeTab === 'occupations' && (
          <motion.div
            key="occupations"
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="space-y-6"
          >
            {/* Occupancy summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Biens Immobiliers</span>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{properties.length}</p>
                <span className="text-[10px] text-gray-400">Total patrimoine</span>
              </motion.div>

              <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Capacité Totale</span>
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{totalUnits} unités</p>
                <span className="text-[10px] text-gray-400">Appartements & maisons</span>
              </motion.div>

              <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Unités Occupées</span>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {Math.max(0, totalUnits - unoccupiedStatus.total)}
                </p>
                <span className="text-[10px] text-gray-400">{occupancyRate}% d'occupation</span>
              </motion.div>

              <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700/80">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Unités Libres / Vacantes</span>
                <p className="text-2xl font-bold text-teal-600 dark:text-teal-400 mt-1">{unoccupiedStatus.total}</p>
                <span className="text-[10px] text-gray-400">Prêtes à louer</span>
              </motion.div>
            </div>

            {/* List of Vacant or Occupied Properties */}
            <motion.div variants={cardVariants} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-xs border border-gray-100 dark:border-gray-700/80">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 dark:text-white text-base">
                  Répartition des Espaces & Biens
                </h3>
                <Link to="/properties" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  Voir tous les biens →
                </Link>
              </div>

              {properties.length === 0 ? (
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                  Aucun bien enregistré pour le moment.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {properties.map(property => {
                    const propTenants = tenants.filter(t => t.propertyId === property.id);
                    const totalUnitsProp = property.apartmentsCount || property.levels || 1;
                    const freeCount = Math.max(0, totalUnitsProp - propTenants.length);
                    const isFullyOccupied = freeCount === 0;

                    return (
                      <div
                        key={property.id}
                        className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                              {property.name}
                            </h4>
                            <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                              {property.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {property.address}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isFullyOccupied
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300'
                          }`}>
                            {isFullyOccupied ? 'Complet' : `${freeCount} unité(s) libre(s)`}
                          </span>
                          <p className="text-[10px] text-gray-400 mt-1">
                            {propTenants.length} / {totalUnitsProp} loué(s)
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modals */}
      {showLateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                Loyers en retard ({lateTenants.length})
              </h2>
              <button onClick={() => setShowLateModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              {lateTenants.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Aucun retard de loyer ce mois-ci.</p>
              ) : (
                lateTenants.map(tenant => (
                  <div key={tenant.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="font-bold text-sm text-gray-900 dark:text-white">{tenant.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{tenant.address}</p>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <span className="font-bold text-red-600 dark:text-red-400 text-sm">{tenant.monthlyRent} $</span>
                      <button
                        onClick={() => sendWhatsAppReminder(tenant)}
                        className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Relancer
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showMonthlyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                Revenus du mois ({stats.monthlyRevenue} $)
              </h2>
              <button onClick={() => setShowMonthlyModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2.5">
              {payments.filter(p => {
                const d = new Date(p.date);
                return p.type === 'Loyer' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
              }).map(payment => {
                const tenant = tenants.find(t => t.id === payment.tenantId);
                return (
                  <div key={payment.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">{tenant?.name || 'Locataire'}</p>
                      <p className="text-[11px] text-gray-500">{new Date(payment.date).toLocaleDateString()} • {payment.method}</p>
                    </div>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">+{payment.amount} $</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showUnoccupiedModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Home className="w-5 h-5 text-teal-500" />
                Espaces Libres ({unoccupiedStatus.total})
              </h2>
              <button onClick={() => setShowUnoccupiedModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2.5">
              {unoccupiedStatus.list.map(prop => (
                <div key={prop.id} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">{prop.name}</p>
                    <p className="text-[11px] text-gray-500">{prop.type}</p>
                  </div>
                  <span className="text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-1 rounded-lg">
                    {prop.unoccupiedCount} libre(s)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
