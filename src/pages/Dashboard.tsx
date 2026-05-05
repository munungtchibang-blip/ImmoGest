import { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Users, CreditCard, AlertCircle, TrendingUp, MessageCircle, Calculator, Wrench, X, ShieldCheck, Home, Droplet, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function Dashboard() {
  const { t } = useTranslation();
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
  const [showLateModal, setShowLateModal] = useState(false);
  const [showExpectedModal, setShowExpectedModal] = useState(false);
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [showWaterModal, setShowWaterModal] = useState(false);
  const [showElecModal, setShowElecModal] = useState(false);
  const [showGuaranteeModal, setShowGuaranteeModal] = useState(false);
  const [showUnoccupiedModal, setShowUnoccupiedModal] = useState(false);
  const [hiddenNotifications, setHiddenNotifications] = useState<string[]>([]);
  const navigate = useNavigate();

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
      
      // Check if paid for current month
      const hasPaidCurrentMonth = tenantPayments.some(p => {
        const d = new Date(p.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      // Check if paid for previous month
      const hasPaidPreviousMonth = tenantPayments.some(p => {
        const d = new Date(p.date);
        return d.getMonth() === previousMonth && d.getFullYear() === previousMonthYear;
      });

      // Check if tenant moved in after the previous month
      const entryDate = new Date(tenant.entryDate || today);
      const movedInAfterPreviousMonth = entryDate.getFullYear() > previousMonthYear || 
                                       (entryDate.getFullYear() === previousMonthYear && entryDate.getMonth() > previousMonth);

      // Tenant is late if they haven't paid previous month (and they lived there), OR if it's the last day of current month and they haven't paid
      return (!hasPaidPreviousMonth && !movedInAfterPreviousMonth) || (isLastDayOfMonth && !hasPaidCurrentMonth);
    });

    const expected = tenants.reduce((sum, t) => sum + Number(t.monthlyRent || 0), 0);
    const guarantees = tenants.reduce((sum, t) => sum + Number(t.guaranteeAmount || 0), 0);

    // Calculate unoccupied floors
    const unoccupiedData: any[] = [];
    let totalUnoccupiedFloors = 0;

    properties.forEach(property => {
      if ((property.type === 'Appartement' || property.type === 'Immeuble') && property.levels) {
        // Count tenants associated with this property
        const propertyTenants = tenants.filter(t => t.propertyId === property.id);
        const occupiedLevels = propertyTenants.map(t => t.level);
        const allLevels = Array.from({ length: property.levels }, (_, i) => i);
        // Identify which exact levels are unoccupied
        const unoccupiedLevelsList = allLevels.filter(lvl => !occupiedLevels.includes(lvl));

        const unoccupiedCount = unoccupiedLevelsList.length;
        
        if (unoccupiedCount > 0) {
          totalUnoccupiedFloors += unoccupiedCount;
          unoccupiedData.push({
            id: property.id,
            name: property.name,
            type: property.type,
            unoccupiedCount,
            totalLevels: property.levels,
            unoccupiedLevelsList // newly added exact levels unoccupied
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

  const statCards = [
    { label: t('Locataires Actifs'), value: stats.totalTenants, icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', onClick: () => navigate('/tenants') },
    { label: t('Revenus du mois'), value: `${stats.monthlyRevenue.toLocaleString()} $`, icon: TrendingUp, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', onClick: () => setShowMonthlyModal(true) },
    { label: t('Dépenses'), value: `${stats.monthlyExpenses.toLocaleString()} $`, icon: Calculator, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', onClick: () => navigate('/expenses') },
    { label: t('Paiements Eau'), value: `${stats.monthlyWater.toLocaleString()} $`, icon: Droplet, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-100 dark:bg-cyan-900/30', onClick: () => setShowWaterModal(true) },
    { label: t('Paiements Élec.'), value: `${stats.monthlyElectricity.toLocaleString()} $`, icon: Zap, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', onClick: () => setShowElecModal(true) },
    { label: t('Revenu estimé'), value: `${expectedRevenue.toLocaleString()} $`, icon: Calculator, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/30', onClick: () => setShowExpectedModal(true) },
    { label: t('Garanties reçues'), value: `${totalGuarantees.toLocaleString()} $`, icon: ShieldCheck, color: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-100 dark:bg-pink-900/30', onClick: () => setShowGuaranteeModal(true) },
    { label: t('Espaces Libres'), value: unoccupiedStatus.total, icon: Home, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-100 dark:bg-teal-900/30', onClick: () => setShowUnoccupiedModal(true) },
    { label: t('Problèmes en cours'), value: stats.pendingIssues, icon: Wrench, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', onClick: () => navigate('/maintenance') },
    { label: t('Loyers en retard'), value: lateTenants.length, icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', onClick: () => setShowLateModal(true) },
  ];

  const sendWhatsAppReminder = (tenant: any) => {
    const phone = tenant.phone.replace(/\D/g, '');
    const message = `Bonjour ${tenant.name}, sauf erreur de notre part, le loyer de ce mois n'a pas encore été réglé. Merci de nous tenir informés.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const last12MonthsData = Array.from({ length: 12 }).map((_, i) => {
    const d = subMonths(today, 11 - i);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    
    const total = payments.reduce((sum, p) => {
      // Consider only payments marked as 'Loyer' and matching the current month being iterated
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

  if (loading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>)}
      </div>
    </div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">{t('Dashboard')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">{t('Welcome, here is a summary of your properties.')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((stat, idx) => (
          <motion.div 
            key={idx} 
            whileHover={{ y: -4 }}
            onClick={stat.onClick}
            className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4 transition-colors cursor-pointer hover:border-blue-200 dark:hover:border-blue-900/50"
          >
            <motion.div 
              whileHover={{ scale: 1.1, rotate: 5 }}
              className={`w-12 h-12 rounded-full flex items-center justify-center ${stat.bg}`}
            >
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </motion.div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {lateTenants.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            <h2 className="text-lg font-bold text-red-900 dark:text-red-400">Alertes de retard ({lateTenants.length})</h2>
          </div>
          <div className="space-y-3">
            {lateTenants.map(tenant => (
              <div key={tenant.id} className="relative flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-red-100 dark:border-red-900/20 gap-4 group">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const hidden = JSON.parse(localStorage.getItem('hiddenNotifications') || '[]');
                    const lockId = `late_tenant_${tenant.id}`;
                    if (!hidden.includes(lockId)) {
                      hidden.push(lockId);
                      localStorage.setItem('hiddenNotifications', JSON.stringify(hidden));
                      window.dispatchEvent(new Event('storage'));
                    }
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 text-red-400 opacity-0 group-hover:opacity-100 transition-all z-10"
                  title="Masquer l'alerte"
                >
                  <X className="w-4 h-4" />
                </button>
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">{tenant.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{tenant.address} • Loyer: {tenant.monthlyRent} $</p>
                </div>
                <button 
                  onClick={() => sendWhatsAppReminder(tenant)}
                  className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  Relancer sur WhatsApp
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Link to="/tenants" className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{t('Ajouter Locataire')}</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('Nouveau Contrat')}</p>
            </div>
            <motion.div 
              whileHover={{ scale: 1.1, rotate: 10 }}
              className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors"
            >
              <Users className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
            </motion.div>
          </div>
        </Link>
        <Link to="/payments" className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-500 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">{t('Nouveau Paiement')}</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('Encaisser Loyer')}</p>
            </div>
            <motion.div 
              whileHover={{ scale: 1.1, rotate: -10 }}
              className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-700 flex items-center justify-center group-hover:bg-green-50 dark:group-hover:bg-green-900/30 transition-colors"
            >
              <CreditCard className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-green-600 dark:group-hover:text-green-400" />
            </motion.div>
          </div>
        </Link>
      </div>

      {/* Modals */}
      {showLateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-red-500" />
                Loyers en retard
              </h2>
              <button onClick={() => setShowLateModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {lateTenants.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center">Aucun retard de paiement.</p>
              ) : (
                <div className="space-y-4">
                  {lateTenants.map(tenant => (
                    <div key={tenant.id} className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{tenant.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{tenant.address}</p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <p className="font-bold text-red-600 dark:text-red-400">{tenant.monthlyRent} $</p>
                        <div className="flex items-center gap-3 mt-1">
                          <a
                            href={`https://wa.me/${tenant.phone?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Bonjour ${tenant.name}, ceci est un rappel aimable concernant le paiement de votre loyer de ${tenant.monthlyRent} $. Merci de régulariser la situation dans les plus brefs délais.`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/40 p-1.5 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors"
                            title="Envoyer un rappel WhatsApp"
                          >
                             Rappel
                          </a>
                          <button onClick={() => { setShowLateModal(false); navigate(`/tenants/${tenant.id}`); }} className="text-sm border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded-lg transition-colors">Détails</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showExpectedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Calculator className="w-6 h-6 text-indigo-500" />
                Revenu estimé ({expectedRevenue} $)
              </h2>
              <button onClick={() => setShowExpectedModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {tenants.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center">Aucun locataire enregistré.</p>
              ) : (
                <div className="space-y-4">
                  {tenants.map(tenant => (
                    <div key={tenant.id} className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{tenant.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{tenant.address}</p>
                      </div>
                      <p className="font-bold text-indigo-600 dark:text-indigo-400">{tenant.monthlyRent} $</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showMonthlyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-green-500" />
                Revenus du mois ({stats.monthlyRevenue} $)
              </h2>
              <button onClick={() => setShowMonthlyModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {payments.filter(p => {
                const d = new Date(p.date);
                return p.type === 'Loyer' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
              }).length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center">Aucun paiement ce mois-ci.</p>
              ) : (
                <div className="space-y-4">
                  {payments.filter(p => {
                    const d = new Date(p.date);
                    return p.type === 'Loyer' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                  }).map(payment => {
                    const tenant = tenants.find(t => t.id === payment.tenantId);
                    return (
                      <div key={payment.id} className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">{tenant?.name || 'Locataire inconnu'}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(payment.date).toLocaleDateString()} • {payment.method}</p>
                        </div>
                        <p className="font-bold text-green-600 dark:text-green-400">{payment.amount} $</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showGuaranteeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Total des Garanties</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total: {totalGuarantees.toLocaleString()} $</p>
              </div>
              <button onClick={() => setShowGuaranteeModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="space-y-3">
                {tenants.map(tenant => (
                  <div key={tenant.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{tenant.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{tenant.address}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900 dark:text-white">{tenant.guaranteeAmount} $</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        tenant.guaranteeStatus === 'Payée' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        tenant.guaranteeStatus === 'Partielle' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {tenant.guaranteeStatus}
                      </span>
                    </div>
                  </div>
                ))}
                {tenants.length === 0 && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-4">Aucun locataire enregistré.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showWaterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Droplet className="w-6 h-6 text-cyan-500" />
                  Paiements Eau ({new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' })})
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total: {stats.monthlyWater.toLocaleString()} $</p>
              </div>
              <button onClick={() => setShowWaterModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="space-y-3">
                {payments
                  .filter(p => p.type === 'Eau' && p.date >= startOfMonth(new Date()).toISOString() && p.date <= endOfMonth(new Date()).toISOString())
                  .map(payment => {
                  const tenantInfo = tenants.find(t => t.id === payment.tenantId);
                  return (
                  <div key={payment.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{tenantInfo ? tenantInfo.name : 'Locataire inconnu'}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(payment.date).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-cyan-600 dark:text-cyan-400">{payment.amount} $</span>
                    </div>
                  </div>
                )})}
                {payments.filter(p => p.type === 'Eau' && p.date >= startOfMonth(new Date()).toISOString() && p.date <= endOfMonth(new Date()).toISOString()).length === 0 && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-4">Aucun paiement d'eau ce mois-ci.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showElecModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-6 h-6 text-yellow-500" />
                  Paiements Électricité ({new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' })})
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total: {stats.monthlyElectricity.toLocaleString()} $</p>
              </div>
              <button onClick={() => setShowElecModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="space-y-3">
                {payments
                  .filter(p => p.type === 'Électricité' && p.date >= startOfMonth(new Date()).toISOString() && p.date <= endOfMonth(new Date()).toISOString())
                  .map(payment => {
                  const tenantInfo = tenants.find(t => t.id === payment.tenantId);
                  return (
                  <div key={payment.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{tenantInfo ? tenantInfo.name : 'Locataire inconnu'}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(payment.date).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-yellow-600 dark:text-yellow-400">{payment.amount} $</span>
                    </div>
                  </div>
                )})}
                {payments.filter(p => p.type === 'Électricité' && p.date >= startOfMonth(new Date()).toISOString() && p.date <= endOfMonth(new Date()).toISOString()).length === 0 && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-4">Aucun paiement d'électricité ce mois-ci.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showUnoccupiedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Home className="w-6 h-6 text-teal-500" />
                  Espaces Libres ({unoccupiedStatus.total})
                </h2>
              </div>
              <button onClick={() => setShowUnoccupiedModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="space-y-3">
                {unoccupiedStatus.list.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-center">Aucun bien ou étage libre actuellement.</p>
                ) : (
                    unoccupiedStatus.list.map(prop => (
                      <div key={prop.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">{prop.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{prop.type}</p>
                        </div>
                        <div className="text-right">
                            {prop.type === 'Appartement' || prop.type === 'Immeuble' ? (
                                <>
                                  <p className="font-bold text-teal-600 dark:text-teal-400 text-lg">{prop.unoccupiedCount} libre(s)</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">sur {prop.totalLevels} niveaux</p>
                                  {prop.unoccupiedLevelsList && (
                                    <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">Étage(s) : {prop.unoccupiedLevelsList.join(', ')}</p>
                                  )}
                                </>
                            ) : (
                                <p className="font-bold text-teal-600 dark:text-teal-400 text-lg">Libre</p>
                            )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
