import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import {
  UserSubscriptionState,
  defaultSubscription,
  computeSubscriptionState,
  cancelUserSubscription,
  changeUserSubscriptionTier,
  executeSubscriptionPayment,
  getSubscriptionInvoices,
  CurrencyType
} from '../lib/subscription';
import toast from 'react-hot-toast';

interface SubscriptionContextType {
  subscription: UserSubscriptionState;
  loading: boolean;
  invoices: any[];
  isSubscriptionModalOpen: boolean;
  modalRecommendedTier: 'starter' | 'standard' | 'pro' | 'vip';
  openSubscriptionModal: (tierId?: 'starter' | 'standard' | 'pro' | 'vip') => void;
  closeSubscriptionModal: () => void;
  cancelSubscription: () => Promise<boolean>;
  changeTier: (tierId: 'starter' | 'standard' | 'pro' | 'vip', currency?: CurrencyType) => Promise<boolean>;
  paySubscription: (params: {
    tierId: 'starter' | 'standard' | 'pro' | 'vip';
    currency: CurrencyType;
    method: 'M-Pesa' | 'Orange Money' | 'Airtel Money' | 'Afrimoney' | 'Carte VISA';
    phoneNumber?: string;
    visaCardNumber?: string;
    visaExpiry?: string;
    visaCvv?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  refreshInvoices: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [subscription, setSubscription] = useState<UserSubscriptionState>(defaultSubscription);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [modalRecommendedTier, setModalRecommendedTier] = useState<'starter' | 'standard' | 'pro' | 'vip'>('pro');

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (!user) {
        setSubscription(defaultSubscription);
        setInvoices([]);
        setLoading(false);
        return;
      }

      unsubUserDoc = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
        if (docSnap.exists()) {
          const state = computeSubscriptionState(docSnap.data());
          setSubscription(state);
        } else {
          setSubscription(computeSubscriptionState({}));
        }
        setLoading(false);
      }, (err) => {
        console.warn("Subscription snapshot error:", err);
        setLoading(false);
      });

      getSubscriptionInvoices().then(setInvoices).catch(() => {});
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  const openSubscriptionModal = (tierId: 'starter' | 'standard' | 'pro' | 'vip' = 'pro') => {
    setModalRecommendedTier(tierId);
    setIsSubscriptionModalOpen(true);
  };

  const closeSubscriptionModal = () => {
    setIsSubscriptionModalOpen(false);
  };

  const refreshInvoices = async () => {
    const list = await getSubscriptionInvoices();
    setInvoices(list);
  };

  const cancelSubscription = async () => {
    const res = await cancelUserSubscription();
    if (res.success) {
      toast.success("Votre abonnement a été résilié. Vous conserverez vos accès jusqu'à la fin de la période en cours.");
      return true;
    } else {
      toast.error(res.error || "Erreur lors de la résiliation.");
      return false;
    }
  };

  const changeTier = async (tierId: 'starter' | 'standard' | 'pro' | 'vip', currency?: CurrencyType) => {
    const curr = currency || subscription.currency || 'USD';
    const res = await changeUserSubscriptionTier(tierId, curr);
    if (res.success) {
      toast.success(`Formule mise à jour vers : ${tierId.toUpperCase()}`);
      return true;
    } else {
      toast.error(res.error || "Erreur lors du changement de formule.");
      return false;
    }
  };

  const paySubscription = async (params: {
    tierId: 'starter' | 'standard' | 'pro' | 'vip';
    currency: CurrencyType;
    method: 'M-Pesa' | 'Orange Money' | 'Airtel Money' | 'Afrimoney' | 'Carte VISA';
    phoneNumber?: string;
    visaCardNumber?: string;
    visaExpiry?: string;
    visaCvv?: string;
  }) => {
    const res = await executeSubscriptionPayment(params);
    if (res.success) {
      await refreshInvoices();
      return { success: true };
    }
    return { success: false, error: res.error };
  };

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        loading,
        invoices,
        isSubscriptionModalOpen,
        modalRecommendedTier,
        openSubscriptionModal,
        closeSubscriptionModal,
        cancelSubscription,
        changeTier,
        paySubscription,
        refreshInvoices
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
