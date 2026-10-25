import React from 'react';
import { Lock, Sparkles, ChevronRight } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';

interface PlanGateProps {
  feature: 'expenses' | 'contracts' | 'reports';
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

export function PlanGate({
  feature,
  children,
  fallbackTitle = "Fonctionnalité réservée à l'abonnement Professionnel",
  fallbackDescription = "Passez au forfait Professionnel (29 $/mois) pour débloquer cet outil et booster votre rentabilité."
}: PlanGateProps) {
  const { subscription, openSubscriptionModal } = useSubscription();

  const isProOrVip = subscription.tierId === 'pro' || subscription.tierId === 'vip';
  const isExpired = subscription.isExpired;

  if (isProOrVip && !isExpired) {
    return <>{children}</>;
  }

  return (
    <div data-feature={feature} className="bg-white dark:bg-gray-800 rounded-3xl p-6 sm:p-10 border border-gray-100 dark:border-gray-700 shadow-sm text-center max-w-xl mx-auto my-6 space-y-4">
      <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
        <Lock className="w-7 h-7" />
      </div>

      <div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          Forfait Professionnel Requis
        </span>
        <h3 className="text-xl font-extrabold text-gray-900 dark:text-white">
          {fallbackTitle}
        </h3>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2">
          {fallbackDescription}
        </p>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={() => openSubscriptionModal('pro')}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg transition-all cursor-pointer"
        >
          <span>Débloquer avec le forfait Pro (29 $/mois)</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
