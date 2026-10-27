import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay,
  isToday
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { getWhatsAppShareUrl } from '../utils/phoneUtils';

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const selectedMonth = currentDate.getMonth();
  const selectedYear = currentDate.getFullYear();
  const [payments, setPayments] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  
  const [filterType, setFilterType] = useState<'all' | 'payments' | 'expenses' | 'maintenance' | 'contracts' | 'notices'>('all');
  const [filterProperty, setFilterProperty] = useState<string>('all');

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const unsubProperties = onSnapshot(query(collection(db, 'properties'), where('landlordId', '==', uid)), (snap) => {
      setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'properties'); });

    const unsubTenants = onSnapshot(query(collection(db, 'tenants'), where('landlordId', '==', uid)), (snap) => {
      setTenants(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'tenants'); });

    const unsubPayments = onSnapshot(query(collection(db, 'payments'), where('landlordId', '==', uid)), (snap) => {
      setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'payments'); });

    const unsubMaintenance = onSnapshot(query(collection(db, 'maintenance'), where('landlordId', '==', uid)), (snap) => {
      setMaintenance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'maintenance'); });

    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), where('landlordId', '==', uid)), (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => { handleFirestoreError(error, OperationType.LIST, 'expenses'); });

    const unsubContracts = onSnapshot(query(collection(db, 'contracts'), where('landlordId', '==', uid)), (snap) => {
      setContracts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    const unsubNotices = onSnapshot(query(collection(db, 'termination_procedures'), where('landlordId', '==', uid)), (snap) => {
      setNotices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, () => { setLoading(false); });

    return () => {
      unsubProperties();
      unsubTenants();
      unsubPayments();
      unsubMaintenance();
      unsubExpenses();
      unsubContracts();
      unsubNotices();
    };
  }, []);

  const nextMonth = () => {
    setCurrentDate(prev => addMonths(prev, 1));
  };
  const prevMonth = () => {
    setCurrentDate(prev => subMonths(prev, 1));
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const dateFormat = "d";
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  // Calculate monthly summary
  const currentMonthPayments = payments.filter(p => isSameMonth(new Date(p.date), currentDate));
  const currentMonthExpenses = expenses.filter(e => isSameMonth(new Date(e.date), currentDate));
  
  const totalCollected = currentMonthPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalExpenses = currentMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netIncome = totalCollected - totalExpenses;

  const getEventsForDay = (day: Date) => {
    const dayEvents: any[] = [];
    
    // Payments
    if (filterType === 'all' || filterType === 'payments') {
      payments.forEach(p => {
        const tenant = tenants.find(t => t.id === p.tenantId);
        if (filterProperty !== 'all' && tenant?.propertyId !== filterProperty) return;
        
        if (isSameDay(new Date(p.date), day)) {
          dayEvents.push({
            type: 'payment',
            title: `Paiement: ${tenant?.name || 'Inconnu'}`,
            amount: p.amount,
            color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
            data: p,
            tenant
          });
        }
      });
    }

    // Expenses
    if (filterType === 'all' || filterType === 'expenses') {
      expenses.forEach(e => {
        if (filterProperty !== 'all' && e.propertyId !== filterProperty) return;
        
        if (isSameDay(new Date(e.date), day)) {
          dayEvents.push({
            type: 'expense',
            title: `Dépense: ${e.category}`,
            amount: e.amount,
            color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800',
            data: e,
            tenant: null
          });
        }
      });
    }

    // Maintenance
    if (filterType === 'all' || filterType === 'maintenance') {
      maintenance.forEach(m => {
        if (filterProperty !== 'all' && m.propertyId !== filterProperty) return;
        
        if (isSameDay(new Date(m.createdAt), day)) {
          const tenant = tenants.find(t => t.id === m.tenantId);
          dayEvents.push({
            type: 'maintenance',
            title: `Problème: ${m.description.substring(0, 20)}...`,
            status: m.status,
            color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800',
            data: m,
            tenant
          });
        }
      });
    }

    // Late Payments (Check on the last day of the month)
    const isLastDayOfMonth = isSameDay(day, endOfMonth(day));
    if ((filterType === 'all' || filterType === 'payments') && isLastDayOfMonth) {
      const currentMonth = day.getMonth();
      const currentYear = day.getFullYear();
      
      tenants.forEach(tenant => {
        if (filterProperty !== 'all' && tenant.propertyId !== filterProperty) return;
        
        const tenantPayments = payments.filter(p => p.tenantId === tenant.id && p.type === 'Loyer');
        const hasPaidThisMonth = tenantPayments.some(p => {
          const d = new Date(p.date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
        
        if (!hasPaidThisMonth) {
          dayEvents.push({
            type: 'late',
            title: `Retard: ${tenant.name}`,
            amount: tenant.monthlyRent,
            color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
            data: null,
            tenant
          });
        }
      });
    }

    // Contract Expirations
    if (filterType === 'all' || filterType === 'contracts') {
      contracts.forEach(c => {
        if (!c.endDate) return;
        const tenant = tenants.find(t => t.id === c.tenantId);
        if (filterProperty !== 'all' && (c.propertyId !== filterProperty && tenant?.propertyId !== filterProperty)) return;

        if (isSameDay(new Date(c.endDate), day)) {
          dayEvents.push({
            type: 'contract',
            title: `Fin Bail : ${c.tenantName || tenant?.name || 'Locataire'}`,
            color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
            data: c,
            tenant
          });
        }
      });
    }

    // Departure Notices & Terminations
    if (filterType === 'all' || filterType === 'notices') {
      notices.forEach(n => {
        const targetDate = n.confirmedEndDate || n.effectiveDate;
        if (!targetDate) return;
        if (isSameDay(new Date(targetDate), day)) {
          const tenant = tenants.find(t => t.id === n.tenantId);
          dayEvents.push({
            type: 'notice',
            title: `Fin Préavis : ${n.targetName}`,
            color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
            data: n,
            tenant
          });
        }
      });
    }

    return dayEvents;
  };

  const sendWhatsAppReminder = (tenant: any) => {
    const message = `Bonjour ${tenant.name},\nSauf erreur de notre part, le loyer de ce mois n'a pas encore été validé sur votre espace ImmoGest.\nMerci de régulariser ou de nous transmettre votre preuve de versement.\nBien cordialement,\nVotre Bailleur.`;
    const directUrl = getWhatsAppShareUrl(tenant.phone, message);
    window.open(directUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6 page-enter">
      <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all group font-medium text-sm">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Retour au tableau de bord
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">Calendrier Immobilier</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors text-sm">Paiements, loyers, échéances de baux, préavis communaux et interventions.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              className="p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white text-xs font-semibold outline-none shadow-xs"
            >
              <option value="all">Tous les événements</option>
              <option value="payments">Paiements de loyers</option>
              <option value="contracts">Échéances de baux</option>
              <option value="notices">Préavis & Départs</option>
              <option value="expenses">Dépenses & Travaux</option>
              <option value="maintenance">Tickets d'intervention</option>
            </select>
            <select
              value={filterProperty}
              onChange={e => setFilterProperty(e.target.value)}
              className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none max-w-[150px] truncate"
            >
              <option value="all">Toutes les propriétés</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <select 
              value={selectedMonth} 
              onChange={e => setCurrentDate(prev => new Date(prev.getFullYear(), Number(e.target.value), 1))}
              className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i} value={i}>{format(new Date(2000, i, 1), 'MMMM', { locale: fr })}</option>
              ))}
            </select>
            <select 
              value={selectedYear} 
              onChange={e => setCurrentDate(prev => new Date(Number(e.target.value), prev.getMonth(), 1))}
              className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none"
            >
              {Array.from({ length: 10 }).map((_, i) => {
                const year = new Date().getFullYear() - 5 + i;
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
          </div>
          <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-2 rounded-xl border border-gray-200 dark:border-gray-700">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <span className="font-bold text-gray-900 dark:text-white min-w-[120px] text-center capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: fr })}
            </span>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Revenus du mois</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{totalCollected.toLocaleString()} $</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Dépenses du mois</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">{totalExpenses.toLocaleString()} $</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Bénéfice net</p>
          <p className={`text-xl font-bold ${netIncome >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>
            {netIncome.toLocaleString()} $
          </p>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse h-[600px] bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
              <div key={day} className="p-3 text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-fr">
            {days.map((day, idx) => {
              const dayEvents = getEventsForDay(day);
              return (
                <div 
                  key={day.toString()} 
                  className={`min-h-[120px] p-2 border-b border-r border-gray-100 dark:border-gray-700/50 ${
                    !isSameMonth(day, monthStart) ? 'bg-gray-50/50 dark:bg-gray-900/20' : ''
                  } ${idx % 7 === 6 ? 'border-r-0' : ''}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                      isToday(day) ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {format(day, dateFormat)}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {dayEvents.map((event, i) => (
                      <div 
                        key={i}
                        onClick={() => setSelectedEvent(event)}
                        className={`text-xs p-1.5 rounded border cursor-pointer truncate transition-colors hover:opacity-80 ${event.color}`}
                      >
                        {event.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Détails de l'événement</h2>
            
            <div className="space-y-3 mb-6">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Type</p>
                <p className="font-medium text-gray-900 dark:text-white capitalize">
                  {selectedEvent.type === 'payment' ? 'Paiement' : selectedEvent.type === 'maintenance' ? 'Maintenance' : 'Retard de loyer'}
                </p>
              </div>
              
              {selectedEvent.tenant && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Locataire</p>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedEvent.tenant.name}</p>
                </div>
              )}

              {selectedEvent.amount && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Montant</p>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedEvent.amount} $</p>
                </div>
              )}

              {selectedEvent.status && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Statut</p>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedEvent.status}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setSelectedEvent(null)} 
                className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Fermer
              </button>
              {selectedEvent.type === 'late' && selectedEvent.tenant && (
                <button 
                  onClick={() => sendWhatsAppReminder(selectedEvent.tenant)}
                  className="flex-1 py-2.5 px-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Rappel SMS
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
