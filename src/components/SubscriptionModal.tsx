import React, { useState } from 'react';
import {
  X, Check, Sparkles, ShieldCheck, Smartphone, CreditCard,
  AlertTriangle, RefreshCw, ChevronRight, CheckCircle2, 
  ArrowLeft, Ban
} from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { SUBSCRIPTION_TIERS, SubscriptionTier, CurrencyType } from '../lib/subscription';
import toast from 'react-hot-toast';

export function SubscriptionModal() {
  const {
    subscription,
    isSubscriptionModalOpen,
    modalRecommendedTier,
    closeSubscriptionModal,
    paySubscription,
    cancelSubscription,
    changeTier
  } = useSubscription();

  const [currency, setCurrency] = useState<CurrencyType>(subscription.currency || 'USD');
  const [selectedTierId, setSelectedTierId] = useState<'starter' | 'standard' | 'pro' | 'vip'>(
    modalRecommendedTier || 'pro'
  );

  // Sync when recommended tier opens
  const [prevRecommended, setPrevRecommended] = useState(modalRecommendedTier);
  if (modalRecommendedTier && modalRecommendedTier !== prevRecommended) {
    setPrevRecommended(modalRecommendedTier);
    setSelectedTierId(modalRecommendedTier);
  }

  const [activeStep, setActiveStep] = useState<'tier' | 'payment' | 'debiting' | 'success'>('tier');
  const [paymentMethod, setPaymentMethod] = useState<'M-Pesa' | 'Orange Money' | 'Airtel Money' | 'Afrimoney' | 'Carte VISA'>('M-Pesa');
  
  // Mobile money form
  const [phone, setPhone] = useState('');
  
  // Visa form
  const [visaNumber, setVisaNumber] = useState('');
  const [visaExpiry, setVisaExpiry] = useState('');
  const [visaCvv, setVisaCvv] = useState('');
  const [visaName, setVisaName] = useState('');
  const [visaError, setVisaError] = useState('');

  // Debiting simulation states
  const [debitProgress, setDebitProgress] = useState(0);
  const [debitStatusMessage, setDebitStatusMessage] = useState('');
  const [paidReceipt, setPaidReceipt] = useState<any>(null);

  // Cancellation confirm modal state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  if (!isSubscriptionModalOpen) return null;

  const currentTier: SubscriptionTier = SUBSCRIPTION_TIERS.find(t => t.id === selectedTierId) || SUBSCRIPTION_TIERS[2];
  const payableAmount = currency === 'USD' ? currentTier.amountUSD : currentTier.amountCDF;

  // Strict Visa validation helper
  const handleVisaChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 16);
    // Format with spaces
    const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1 ');
    setVisaNumber(formatted);

    if (raw.length > 0 && !raw.startsWith('4')) {
      setVisaError("Seules les cartes VISA sont acceptées (commençant par le chiffre 4).");
    } else {
      setVisaError('');
    }
  };

  const handleExpiryChange = (val: string) => {
    let clean = val.replace(/\D/g, '').slice(0, 4);
    if (clean.length >= 2) {
      clean = clean.slice(0, 2) + '/' + clean.slice(2);
    }
    setVisaExpiry(clean);
  };

  const startDebitProcess = async () => {
    // Validations
    if (paymentMethod === 'Carte VISA') {
      const raw = visaNumber.replace(/\s+/g, '');
      if (!raw.startsWith('4') || raw.length !== 16) {
        toast.error("Seule une carte VISA valide (16 chiffres commençant par 4) est autorisée.");
        return;
      }
      if (!visaExpiry || visaExpiry.length !== 5) {
        toast.error("Veuillez renseigner la date d'expiration (MM/AA).");
        return;
      }
      if (!visaCvv || visaCvv.length !== 3) {
        toast.error("Veuillez saisir le code CVV (3 chiffres).");
        return;
      }
    } else {
      const cleanPhone = phone.replace(/[\s\-().]/g, '');
      if (cleanPhone.length < 9) {
        toast.error("Veuillez renseigner un numéro Mobile Money valide.");
        return;
      }
    }

    setActiveStep('debiting');
    setDebitProgress(15);
    setDebitStatusMessage(`Connexion sécurisée avec le réseau ${paymentMethod}...`);

    await new Promise(r => setTimeout(r, 600));
    setDebitProgress(45);
    setDebitStatusMessage(
      paymentMethod === 'Carte VISA'
        ? "Vérification 3D-Secure VISA & provision du compte bancaire..."
        : `Demande de débit envoyée au ${phone}. Envoi de l'autorisation USSD...`
    );

    await new Promise(r => setTimeout(r, 700));
    setDebitProgress(80);
    setDebitStatusMessage(`Prélèvement effectif de ${payableAmount} ${currency === 'USD' ? '$' : 'CDF'} en cours...`);

    const result = await paySubscription({
      tierId: currentTier.id,
      currency,
      method: paymentMethod,
      phoneNumber: phone,
      visaCardNumber: visaNumber,
      visaExpiry,
      visaCvv
    });

    if (result.success) {
      setDebitProgress(100);
      setDebitStatusMessage("Paiement validé avec succès ! Compte débité.");
      setPaidReceipt({
        tierName: currentTier.name,
        amount: payableAmount,
        currency,
        method: paymentMethod,
        date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        account: paymentMethod === 'Carte VISA' ? `VISA **** ${visaNumber.replace(/\s+/g, '').slice(-4)}` : `${paymentMethod} ${phone}`
      });
      await new Promise(r => setTimeout(r, 400));
      setActiveStep('success');
      toast.success(`Abonnement ${currentTier.name} activé !`);
    } else {
      setActiveStep('payment');
      toast.error(result.error || "Échec du prélèvement.");
    }
  };

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    const ok = await cancelSubscription();
    setIsCancelling(false);
    if (ok) {
      setShowCancelConfirm(false);
      closeSubscriptionModal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-2xl w-full border border-gray-100 dark:border-gray-800 my-auto overflow-hidden transition-all">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 sm:p-6">
          <button
            onClick={closeSubscriptionModal}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400 text-gray-950">
              <Sparkles className="w-3.5 h-3.5 fill-gray-950" />
              Abonnement Mensuel
            </span>
            <span className="text-xs text-blue-200">
              Actuel : <strong className="text-white uppercase">{subscription.tierId}</strong>
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {activeStep === 'tier' && "Choisissez votre formule mensuelle"}
            {activeStep === 'payment' && `Règlement du forfait ${currentTier.name}`}
            {activeStep === 'debiting' && "Prélèvement sécurisé en cours"}
            {activeStep === 'success' && "Abonnement Activé avec Succès !"}
          </h2>
          <p className="text-xs sm:text-sm text-blue-100/90 mt-1">
            Tarifs mensuels fixes sans frais cachés. Débit direct Mobile Money ou Carte VISA.
          </p>
        </div>

        {/* Currency Switcher & Notice */}
        {activeStep === 'tier' && (
          <div className="px-5 sm:px-6 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Devise de paiement :
            </div>
            <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  currency === 'USD'
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                USD ($)
              </button>
              <button
                type="button"
                onClick={() => setCurrency('CDF')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  currency === 'CDF'
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Franc Congolais (CDF)
              </button>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 sm:p-6 max-h-[70vh] overflow-y-auto space-y-4">
          {/* STEP 1: SELECT TIER */}
          {activeStep === 'tier' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {SUBSCRIPTION_TIERS.map((tier) => {
                  const isSelected = selectedTierId === tier.id;
                  const isCurrent = subscription.tierId === tier.id && !subscription.isExpired;
                  const price = currency === 'USD' ? `${tier.amountUSD} $` : `${tier.amountCDF.toLocaleString('fr-FR')} FC`;

                  return (
                    <div
                      key={tier.id}
                      onClick={() => setSelectedTierId(tier.id)}
                      className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-900/20 shadow-md ring-2 ring-blue-500/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-850'
                      }`}
                    >
                      {tier.badge && (
                        <div className="absolute -top-2.5 right-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-xs">
                          {tier.badge}
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-extrabold text-sm sm:text-base text-gray-900 dark:text-white">
                            {tier.name}
                          </h3>
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-md">
                              Actif
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
                          {tier.tagline}
                        </p>

                        <div className="flex items-baseline gap-1 my-2">
                          <span className="text-2xl font-black text-gray-900 dark:text-white">
                            {price}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                            / mois
                          </span>
                        </div>

                        <ul className="space-y-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                          {tier.features.map((feat, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                              <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-4 pt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTierId(tier.id);
                            setActiveStep('payment');
                          }}
                          className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                          }`}
                        >
                          <span>Sélectionner {price}/mois</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action bar for changing or cancelling subscription */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">
                    Besoin de changer de formule immédiatement ?
                  </span>
                  <button
                    onClick={() => changeTier(selectedTierId, currency)}
                    className="font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Activer {SUBSCRIPTION_TIERS.find(t => t.id === selectedTierId)?.name}
                  </button>
                </div>

                {subscription.status === 'active' && !subscription.isCancelled && (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="text-red-500 hover:text-red-700 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Résilier l'abonnement</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: PAYMENT METHOD & DEBIT */}
          {activeStep === 'payment' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setActiveStep('tier')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Changer de formule</span>
              </button>

              {/* Order summary banner */}
              <div className="p-3.5 bg-blue-50 dark:bg-blue-900/30 rounded-2xl border border-blue-100 dark:border-blue-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-blue-900 dark:text-blue-200">
                    Formule sélectionnée : <strong>{currentTier.name}</strong>
                  </p>
                  <p className="text-[11px] text-blue-700 dark:text-blue-300">
                    Renouvellement mensuel automatique • Sans engagement
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-blue-950 dark:text-white">
                    {payableAmount} {currency === 'USD' ? '$' : 'CDF'}
                  </div>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400">par mois</span>
                </div>
              </div>

              {/* Payment Methods Tabs (Immediate 0ms response) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Mode de prélèvement autorisé :
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(['M-Pesa', 'Orange Money', 'Airtel Money', 'Afrimoney', 'Carte VISA'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        paymentMethod === m
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                          : 'border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                      }`}
                    >
                      {m === 'Carte VISA' ? (
                        <CreditCard className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                      )}
                      <span className="truncate">{m}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Form Fields */}
              {paymentMethod === 'Carte VISA' ? (
                <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      Carte Bancaire VISA Exclusive
                    </span>
                    <span className="text-[10px] font-black tracking-wider text-blue-700 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded-md">
                      VISA UNIQUEMENT
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Numéro de Carte VISA (16 chiffres, commence par 4)
                    </label>
                    <input
                      type="text"
                      placeholder="4000 1234 5678 9010"
                      value={visaNumber}
                      onChange={(e) => handleVisaChange(e.target.value)}
                      className="w-full p-2.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    />
                    {visaError && (
                      <p className="text-red-500 text-[11px] mt-1 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {visaError}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        Expiration (MM/AA)
                      </label>
                      <input
                        type="text"
                        placeholder="12/28"
                        maxLength={5}
                        value={visaExpiry}
                        onChange={(e) => handleExpiryChange(e.target.value)}
                        className="w-full p-2.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        Code CVV (3 chiffres)
                      </label>
                      <input
                        type="password"
                        placeholder="123"
                        maxLength={3}
                        value={visaCvv}
                        onChange={(e) => setVisaCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
                        className="w-full p-2.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Nom sur la carte
                    </label>
                    <input
                      type="text"
                      placeholder="JEAN DUPONT"
                      value={visaName}
                      onChange={(e) => setVisaName(e.target.value.toUpperCase())}
                      className="w-full p-2.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                      Compte {paymentMethod}
                    </span>
                    <span className="text-[10px] text-gray-500">RDC (+243)</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Numéro de téléphone pour le débit
                    </label>
                    <input
                      type="tel"
                      placeholder="0812345678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full p-2.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Vous recevrez une notification instantanée pour valider le code PIN de prélèvement.
                    </p>
                  </div>
                </div>
              )}

              {/* Submit Debit Button */}
              <button
                type="button"
                onClick={startDebitProcess}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  Confirmer et prélever {payableAmount} {currency === 'USD' ? '$' : 'CDF'}
                </span>
              </button>
            </div>
          )}

          {/* STEP 3: DEBIT IN PROGRESS */}
          {activeStep === 'debiting' && (
            <div className="py-8 text-center space-y-5">
              <div className="relative w-16 h-16 mx-auto">
                <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 rounded-full animate-spin border-t-blue-600"></div>
                <RefreshCw className="w-6 h-6 text-blue-600 absolute inset-0 m-auto animate-pulse" />
              </div>

              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                  Traitement du prélèvement bancaire
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {debitStatusMessage}
                </p>
              </div>

              {/* Progress bar */}
              <div className="max-w-md mx-auto bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2.5 transition-all duration-300 rounded-full"
                  style={{ width: `${debitProgress}%` }}
                ></div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 max-w-md mx-auto text-left">
                <strong>Notification en cours :</strong> L'argent est déduit directement de votre compte {paymentMethod}. Ne fermez pas cette page.
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS RECEIPT */}
          {activeStep === 'success' && paidReceipt && (
            <div className="py-4 text-center space-y-4">
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Prélèvement Réussi & Forfait Activé
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Votre compte a été débité et vos fonctionnalités sont immédiatement débloquées.
                </p>
              </div>

              {/* Receipt card */}
              <div className="bg-gray-50 dark:bg-gray-850 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 text-left text-xs space-y-2 max-w-md mx-auto">
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                  <span className="text-gray-500">Forfait activé :</span>
                  <span className="font-bold text-gray-900 dark:text-white">{paidReceipt.tierName}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                  <span className="text-gray-500">Montant débité :</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {paidReceipt.amount} {paidReceipt.currency === 'USD' ? '$' : 'CDF'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                  <span className="text-gray-500">Moyen de paiement :</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{paidReceipt.account}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date de transaction :</span>
                  <span className="text-gray-700 dark:text-gray-300">{paidReceipt.date}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={closeSubscriptionModal}
                className="w-full max-w-md mx-auto py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Terminer et profiter de mon application
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation modal for cancellation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 border border-gray-100 dark:border-gray-700">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-base text-gray-900 dark:text-white">
                Résilier votre abonnement ?
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Vous conserverez vos accès jusqu'à la fin de la période mensuelle en cours. Aucune somme ne sera prélevée le mois prochain.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 px-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-xl hover:bg-gray-50 cursor-pointer"
              >
                Conserver
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleCancelSubscription}
                className="flex-1 py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {isCancelling ? "Résiliation..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
