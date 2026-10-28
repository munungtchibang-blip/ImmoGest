import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, CreditCard, Wrench, LogOut, Bell, Calendar as CalendarIcon, Receipt, Home, FileText, Settings, X, FileSignature, Globe, Radio, FileCheck2, MessageSquare } from 'lucide-react';
import { logout, db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ProfileModal } from './ProfileModal';
import { InstallPrompt } from './InstallPrompt';
import { Toaster, toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';
import { APP_VERSION } from '../version';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { SubscriptionModal } from './SubscriptionModal';

export function Layout() {
  const { t, i18n } = useTranslation();
  const { subscription, openSubscriptionModal } = useSubscription();
  const [issues, setIssues] = useState<any[]>([]);
  const [radarCount, setRadarCount] = useState<number>(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState<number>(0);
  const [activeMaintenanceCount, setActiveMaintenanceCount] = useState<number>(0);
  const [expiringContractsCount, setExpiringContractsCount] = useState<number>(0);
  const [activeTerminationsCount, setActiveTerminationsCount] = useState<number>(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    // Maintenance issues listener
    const q = query(collection(db, 'maintenance'), where('landlordId', '==', uid));
    
    const unsubMaintenance = onSnapshot(q, (snap) => {
      const allMaint = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      const activeTickets = allMaint.filter(m => ['En attente', 'Nouvelle', 'En cours', 'Devis soumis'].includes(m.status));
      setActiveMaintenanceCount(activeTickets.length);

      const hidden = JSON.parse(localStorage.getItem('hiddenNotifications') || '[]');
      const now = new Date().getTime();
      const oldIssues = activeTickets.filter((issue: any) => {
        if (hidden.includes(issue.id)) return false;
        const createdAt = new Date(issue.createdAt || 0).getTime();
        const diffDays = (now - createdAt) / (1000 * 3600 * 24);
        return diffDays > 2;
      });
      setIssues(oldIssues);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'maintenance');
    });

    // Payments listener & Pending verification count
    const qPayments = query(collection(db, 'payments'), where('landlordId', '==', uid));
    const unsubPayments = onSnapshot(qPayments, (snap) => {
      const allPay = snap.docs.map(d => d.data());
      const pending = allPay.filter((p: any) => p.status === 'En attente' || p.status === 'pending_verification');
      setPendingPaymentsCount(pending.length);

      snap.docChanges().forEach(async (change) => {
        if (change.type === 'added' && !initialLoadRef.current) {
          const payment = change.doc.data();
          let tenantName = 'un locataire';
          try {
            const tenantRef = doc(db, 'tenants', payment.tenantId);
            const tenantSnap = await getDoc(tenantRef);
            if (tenantSnap.exists()) {
              tenantName = tenantSnap.data().name;
            }
          } catch (e) {
            console.error(e);
          }
          
          toast.success(`Paiement reçu de ${tenantName} (${payment.amount} $)`, {
            duration: 5000,
            icon: '💰',
            style: {
              borderRadius: '10px',
              background: '#333',
              color: '#fff',
            },
          });
        }
      });
      initialLoadRef.current = false;
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payments');
    });

    // Contracts expiring in < 60 days
    const qContracts = query(collection(db, 'contracts'), where('landlordId', '==', uid));
    const unsubContracts = onSnapshot(qContracts, (snap) => {
      const now = new Date();
      const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 3600 * 1000);
      const expiring = snap.docs.filter(d => {
        const data = d.data();
        if (data.status !== 'active' || !data.endDate) return false;
        const end = new Date(data.endDate);
        return end <= sixtyDaysFromNow;
      });
      setExpiringContractsCount(expiring.length);
    }, () => {});

    // Active lease terminations
    const qTerminations = query(collection(db, 'termination_procedures'), where('landlordId', '==', uid));
    const unsubTerminations = onSnapshot(qTerminations, (snap) => {
      const active = snap.docs.filter(d => d.data().status !== 'Clôturée');
      setActiveTerminationsCount(active.length);
    }, () => {});

    // Unread messages for this landlord
    const qMessages = query(collection(db, 'messages'), where('recipientId', '==', uid), where('read', '==', false));
    const unsubMessages = onSnapshot(qMessages, (snap) => {
      setUnreadMessagesCount(snap.docs.length);
    }, () => {});

    // Radar alerts
    const qRadar = query(collection(db, 'radar_alerts'), where('landlordId', '==', uid), where('status', '==', 'active'));
    const unsubRadar = onSnapshot(qRadar, (snap) => {
      setRadarCount(snap.docs.length);
    }, () => {});

    // Notifications
    const qNotifs = query(collection(db, 'notifications'), where('userId', '==', uid));
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
      const unread = snap.docs.filter(d => !d.data().isRead && !d.data().isArchived).length;
      setUnreadNotifCount(unread);
    }, () => {});

    return () => {
      unsubMaintenance();
      unsubPayments();
      unsubContracts();
      unsubTerminations();
      unsubMessages();
      unsubRadar();
      unsubNotifs();
    };
  }, []);

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: t('Dashboard') },
    { to: '/properties', icon: Home, label: t('Properties') },
    { to: '/calendar', icon: CalendarIcon, label: t('Calendar', 'Calendrier') },
    { to: '/tenants', icon: Users, label: t('Tenants') },
    { to: '/payments', icon: CreditCard, label: t('Payments'), badge: pendingPaymentsCount, badgeColor: 'bg-emerald-600' },
    { to: '/expenses', icon: Receipt, label: t('Expenses') },
    { to: '/maintenance', icon: Wrench, label: t('Maintenance'), badge: activeMaintenanceCount, badgeColor: 'bg-amber-600' },
    { to: '/contracts', icon: FileSignature, label: t('Contracts', 'Contrats'), badge: expiringContractsCount, badgeColor: 'bg-blue-600' },
    { to: '/terminations', icon: FileCheck2, label: 'Préavis & Clôtures', badge: activeTerminationsCount, badgeColor: 'bg-purple-600' },
    { to: '/messages', icon: MessageSquare, label: 'Messages', badge: unreadMessagesCount, badgeColor: 'bg-rose-500' },
    { to: '/radar', icon: Radio, label: 'Radar', badge: radarCount, badgeColor: 'bg-cyan-500' },
    { to: '/notifications', icon: Bell, label: 'Notifications', badge: unreadNotifCount, badgeColor: 'bg-amber-500' },
    { to: '/reports', icon: FileText, label: t('Reports') },
    { to: '/settings', icon: Settings, label: t('Settings') },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col md:flex-row transition-colors duration-300">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-screen sticky top-0 transition-colors duration-300">
        <div className="p-6 flex items-center justify-between bg-blue-900 dark:bg-blue-950 rounded-br-2xl">
          <div className="flex items-center gap-2">
            <Logo className="w-8 h-8" />
            <h1 className="text-2xl font-bold text-white">ImmoGest</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr')}
              className="p-2 rounded-full hover:bg-blue-800 text-blue-100 transition-colors"
              title={i18n.language === 'fr' ? 'Switch to English' : 'Passer en Français'}
            >
              <Globe className="w-5 h-5" />
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-full hover:bg-blue-800 text-blue-100 transition-colors relative"
              >
                <Bell className="w-5 h-5" />
                {issues.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-blue-900"></span>}
              </button>
              {showNotifications && (
                <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="font-bold text-gray-900 dark:text-white">Notifications</h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {issues.length === 0 ? (
                      <p className="p-4 text-gray-500 dark:text-gray-400 text-sm text-center">Aucune notification.</p>
                    ) : (
                      issues.map(issue => (
                        <div key={issue.id + '-desktop'} className="relative group hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0 border-l-4 border-l-red-500">
                          <NavLink 
                            to="/maintenance" 
                            onClick={() => setShowNotifications(false)}
                            className="block p-4 pr-10"
                          >
                            <p className="text-sm font-medium text-gray-900 dark:text-white">Problème non résolu</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{issue.description.substring(0, 50)}... (depuis plus de 2 jours)</p>
                          </NavLink>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const hidden = JSON.parse(localStorage.getItem('hiddenNotifications') || '[]');
                              hidden.push(issue.id);
                              localStorage.setItem('hiddenNotifications', JSON.stringify(hidden));
                              window.dispatchEvent(new Event('storage'));
                            }}
                            className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 opacity-0 group-hover:opacity-100 transition-all z-10"
                            title="Masquer la notification"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <NavLink
                      to="/notifications"
                      onClick={() => setShowNotifications(false)}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Centre de Notifications</span>
                    </NavLink>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto hide-scrollbar max-h-[calc(100vh-280px)]">
          {navItems.map((item: any) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors group',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-100'
                )
              }
            >
              <div className="flex items-center gap-3">
                <motion.div whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
                  <item.icon className="w-4 h-4" />
                </motion.div>
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black text-white ${item.badgeColor || 'bg-blue-600'}`}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        
        {/* Subscription Sidebar Widget */}
        <div className="p-3.5 mx-3 my-2 bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-2xl border border-blue-800 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3 fill-amber-300" />
              {subscription.tierId}
            </span>
            <span className="text-[11px] font-extrabold text-blue-100">
              {subscription.monthlyAmount} {subscription.currency === 'USD' ? '$' : 'FC'}/m
            </span>
          </div>
          <p className="text-[11px] text-blue-200/90 mb-2">
            {subscription.isExpired
              ? "Abonnement échu."
              : subscription.isTrial
              ? `Essai : ${subscription.daysRemaining} j restants`
              : `${subscription.daysRemaining} j restants`}
          </p>
          <button
            onClick={() => openSubscriptionModal('pro')}
            className="w-full py-1.5 px-2.5 bg-white hover:bg-blue-50 text-blue-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>{subscription.isExpired ? "Renouveler" : "Changer / Forfaits"}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-xl font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group"
          >
            <motion.div whileHover={{ scale: 1.2, x: -2 }}>
              <LogOut className="w-5 h-5" />
            </motion.div>
            {t('Sign Out')}
          </button>
          <div className="text-center mt-3 text-xs text-gray-400 dark:text-gray-500">
             v{APP_VERSION}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pb-24 md:pb-0 flex flex-col min-h-screen">
        <InstallPrompt />
        {/* Mobile Header with Notifications & Subscription */}
        <div className="md:hidden sticky top-0 left-0 right-0 z-40 bg-blue-900 dark:bg-blue-950 shadow-md flex justify-between items-center p-4">
          <div className="flex items-center gap-2">
            <Logo className="w-8 h-8" />
            <h1 className="text-2xl font-bold text-white">ImmoGest</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openSubscriptionModal('pro')}
              className="px-2.5 py-1 rounded-xl bg-amber-400 text-gray-950 text-[11px] font-extrabold flex items-center gap-1 shadow-xs cursor-pointer"
              title="Abonnement Mensuel"
            >
              <Sparkles className="w-3 h-3 fill-gray-950" />
              <span className="uppercase">{subscription.tierId}</span>
            </button>
            <button 
              onClick={() => i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr')}
              className="p-2 rounded-full bg-blue-800 hover:bg-blue-700 border border-blue-700 text-white relative transition-colors"
            >
              <Globe className="w-5 h-5" />
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-full bg-blue-800 hover:bg-blue-700 border border-blue-700 text-white relative transition-colors"
              >
                <Bell className="w-5 h-5" />
                {issues.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-blue-800"></span>}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-50">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="font-bold text-gray-900 dark:text-white">Notifications</h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {issues.length === 0 ? (
                      <p className="p-4 text-gray-500 dark:text-gray-400 text-sm text-center">Aucune notification.</p>
                    ) : (
                      issues.map(issue => (
                        <div key={issue.id + '-mobile'} className="relative group hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0 border-l-4 border-l-red-500">
                          <NavLink 
                            to="/maintenance" 
                            onClick={() => setShowNotifications(false)}
                            className="block p-4 pr-10"
                          >
                            <p className="text-sm font-medium text-gray-900 dark:text-white">Problème non résolu</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{issue.description.substring(0, 50)}... (depuis plus de 2 jours)</p>
                          </NavLink>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const hidden = JSON.parse(localStorage.getItem('hiddenNotifications') || '[]');
                              hidden.push(issue.id);
                              localStorage.setItem('hiddenNotifications', JSON.stringify(hidden));
                              window.dispatchEvent(new Event('storage'));
                            }}
                            className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 opacity-0 group-hover:opacity-100 transition-all z-10"
                            title="Masquer la notification"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expired / Trial warning banner */}
        {subscription.isExpired && (
          <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold shadow-md">
            <span>Votre abonnement mensuel est arrivé à échéance. Veuillez le renouveler pour réactiver tous les accès.</span>
            <button
              onClick={() => openSubscriptionModal('pro')}
              className="ml-3 px-3 py-1 bg-white text-red-700 font-extrabold rounded-lg shadow-xs hover:bg-red-50 cursor-pointer"
            >
              Renouveler
            </button>
          </div>
        )}

        <div className="max-w-5xl mx-auto p-4 md:p-8 w-full flex-grow page-enter">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 flex overflow-x-auto p-2 pb-4 z-40 transition-colors duration-300 hide-scrollbar shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        {navItems.map((item: any) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center p-2 rounded-lg min-w-[68px] transition-colors flex-shrink-0 relative',
                isActive ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-500 dark:text-gray-400'
              )
            }
          >
            <div className="relative">
              <motion.div whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
                <item.icon className="w-5 h-5 mb-0.5" />
              </motion.div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`absolute -top-1 -right-2 px-1.5 py-0.2 rounded-full text-[8px] font-black text-white ${item.badgeColor || 'bg-blue-600'}`}>
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[9px] font-semibold tracking-tight">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Confirmation</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Êtes-vous sûr de vouloir vous déconnecter ?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Annuler</button>
              <button 
                onClick={async () => {
                  try {
                    await logout();
                  } finally {
                    setShowLogoutConfirm(false);
                  }
                }} 
                className="flex-1 py-2.5 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
               >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}
      <SubscriptionModal />
      <Toaster position="top-right" />
    </div>
  );
}
