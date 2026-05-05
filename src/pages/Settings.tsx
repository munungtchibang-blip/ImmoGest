import React, { useState, useEffect } from 'react';
import { User, Type, Sun, Moon, LogOut, CreditCard, ChevronRight, CheckCircle2, Globe, Trash2, AlertTriangle, Download } from 'lucide-react';
import { ProfileModal } from '../components/ProfileModal';
import { logout, db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, deleteDoc, updateDoc, getDoc, doc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { Logo } from '../components/Logo';

export function Settings() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'general' | 'payments'>('general');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'));
  
  // Payment config state
  const [hasMobileMoney, setHasMobileMoney] = useState(false);
  const [mobileMoneyProvider, setMobileMoneyProvider] = useState('');
  const [mobileMoneyPhone, setMobileMoneyPhone] = useState('');
  const [showMobileMoneyModal, setShowMobileMoneyModal] = useState(false);

  const [hasBank, setHasBank] = useState(false);
  const [bankProvider, setBankProvider] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [showBankModal, setShowBankModal] = useState(false);

  const [showPaymentConfigStatus, setShowPaymentConfigStatus] = useState('');
  const [isInstallable, setIsInstallable] = useState(false);
  
  const getCurrentFontSize = () => {
    if (document.documentElement.classList.contains('text-sm')) return 'small';
    if (document.documentElement.classList.contains('text-lg')) return 'large';
    if (document.documentElement.classList.contains('text-xl')) return 'xlarge';
    return 'normal';
  };
  
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large' | 'xlarge'>(getCurrentFontSize());

  useEffect(() => {
    const handleBeforeInstall = () => setIsInstallable(true);
    if (window.deferredPrompt) setIsInstallable(true);
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  useEffect(() => {
    const fetchPaymentSettings = async () => {
      if (!auth.currentUser) return;
      try {
        const docRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.mobileMoneyProvider) {
            setHasMobileMoney(true);
            setMobileMoneyProvider(data.mobileMoneyProvider);
            setMobileMoneyPhone(data.mobileMoneyPhone || '');
          }
          if (data.bankProvider) {
            setHasBank(true);
            setBankProvider(data.bankProvider);
            setBankAccountNumber(data.bankAccountNumber || '');
          }
        }
      } catch (err) {
        console.error("Error fetching settings", err);
      }
    };
    fetchPaymentSettings();
  }, []);

  const savePaymentSetting = async (fieldOverrides: any) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), fieldOverrides);
    } catch (err) {
      console.error("Error saving payment config", err);
    }
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    document.documentElement.classList.remove('text-sm', 'text-lg', 'text-xl');
    if (fontSize === 'small') document.documentElement.classList.add('text-sm');
    if (fontSize === 'large') document.documentElement.classList.add('text-lg');
    if (fontSize === 'xlarge') document.documentElement.classList.add('text-xl');
  }, [fontSize]);

  const handleLogout = async () => {
    await logout();
    setShowLogoutModal(false);
  };

  const handleDownloadLogo = () => {
    const svgContent = `
      <svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" rx="128" fill="#2563EB"/>
        <path d="M128 384V160H224M224 160V128H384V384H224M224 160V384" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M160 224H192" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M160 288H192" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M160 352H192" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M288 192H320" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M288 256H320" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M288 320H320" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    
    const blob = new Blob([svgContent], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ImmoGest_Logo.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearData = async () => {
    if (!auth.currentUser) return;
    setIsClearingData(true);
    try {
      const uid = auth.currentUser.uid;
      const collectionsToClear = ['properties', 'tenants', 'payments', 'expenses', 'maintenance', 'recurring_payments'];
      
      for (const collName of collectionsToClear) {
        const q = query(collection(db, collName), where('landlordId', '==', uid));
        const snap = await getDocs(q);
        const deletePromises = snap.docs.map(docSnapshot => deleteDoc(docSnapshot.ref));
        await Promise.all(deletePromises);
      }
      
      toast.success("Toutes vos données ont été supprimées avec succès.");
      setShowClearDataModal(false);
    } catch (error) {
      console.error("Erreur lors de la suppression des données", error);
      toast.error("Une erreur est survenue lors de la suppression des données.");
    } finally {
      setIsClearingData(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">Paramètres</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">Gérez vos préférences et système de paiement.</p>
      </div>

      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800/50 rounded-xl">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'general' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Général et Profil
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'payments' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Paiements Automatiques
        </button>
      </div>

      {activeTab === 'general' ? (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          
          <button 
            onClick={() => setShowProfileModal(true)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Profil utilisateur</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Modifier vos informations personnelles</p>
              </div>
            </div>
          </button>

          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Logo className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Logo de l'application</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Télécharger le logo en SVG</p>
              </div>
            </div>
            <button 
              onClick={handleDownloadLogo}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              <Download className="w-4 h-4" /> Télécharger
            </button>
          </div>

          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Langue / Language</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Choisissez votre langue</p>
              </div>
            </div>
            <select 
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white outline-none"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>

          {isInstallable && (
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Installer l'Application</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ajouter à l'écran d'accueil ou bureau</p>
              </div>
            </div>
            <button 
              onClick={() => {
                if (window.deferredPrompt) {
                  window.deferredPrompt.prompt();
                  window.deferredPrompt.userChoice.then((choiceResult: any) => {
                    if (choiceResult.outcome === 'accepted') {
                      console.log('User accepted the A2HS prompt');
                    }
                    window.deferredPrompt = null;
                    setIsInstallable(false);
                  });
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-lg font-medium hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
            >
              Installer
            </button>
          </div>
          )}

          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Type className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Taille du texte</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ajustez la taille de la police</p>
              </div>
            </div>
            <select 
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value as any)}
              className="p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white outline-none"
            >
              <option value="small">Petite</option>
              <option value="normal">Normale</option>
              <option value="large">Grande</option>
              <option value="xlarge">Très grande</option>
            </select>
          </div>

          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 flex items-center justify-center">
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Thème</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Actuellement: {isDarkMode ? 'Sombre' : 'Clair'}</p>
              </div>
            </div>
          </button>

          <button 
            onClick={() => setShowClearDataModal(true)}
            className="w-full flex items-center justify-between p-4 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-orange-600 dark:text-orange-400">Vider l'application</p>
                <p className="text-sm text-orange-500/80 dark:text-orange-400/80">Supprimer toutes vos données</p>
              </div>
            </div>
          </button>

          <button 
            onClick={() => setShowLogoutModal(true)}
            className="w-full flex items-center justify-between p-4 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 flex items-center justify-center">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-red-600 dark:text-red-400">Déconnexion</p>
                <p className="text-sm text-red-500/80 dark:text-red-400/80">Quitter votre session</p>
              </div>
            </div>
          </button>

        </div>
      </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-8 text-white">
            <h2 className="text-2xl font-bold mb-2">Comptes Financiers</h2>
            <p className="text-blue-100 mb-6">Connectez vos comptes pour permettre aux locataires de payer automatiquement via QR Code. L'application lira la référence et mettra à jour les loyers.</p>
            
            <div className="bg-white/10 p-4 rounded-xl border border-white/20 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-300" />
                <p className="font-medium text-white">Le système attribue automatiquement les paiements aux bons locataires via leur référence unique.</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Moyens de paiement</h3>
              
              <div className="space-y-4">
                {/* Mobile Money */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-gray-100 dark:border-gray-700 rounded-xl gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${hasMobileMoney ? 'bg-green-100 text-green-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">Mobile Money</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{hasMobileMoney ? `Connecté (${mobileMoneyProvider})` : 'Non connecté'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (hasMobileMoney) {
                        setHasMobileMoney(false);
                        setMobileMoneyProvider('');
                        setShowPaymentConfigStatus('Compte Mobile Money déconnecté.');
                        setTimeout(() => setShowPaymentConfigStatus(''), 3000);
                      } else {
                        setShowMobileMoneyModal(true);
                      }
                    }}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      hasMobileMoney 
                        ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {hasMobileMoney ? 'Déconnecter' : 'Connecter'}
                  </button>
                </div>

                {/* Bank Account */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-gray-100 dark:border-gray-700 rounded-xl gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${hasBank ? 'bg-green-100 text-green-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">Compte Bancaire (API)</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{hasBank ? `Connecté (${bankProvider})` : 'Non connecté'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (hasBank) {
                        setHasBank(false);
                        setBankProvider('');
                        setShowPaymentConfigStatus('Compte bancaire déconnecté.');
                        setTimeout(() => setShowPaymentConfigStatus(''), 3000);
                      } else {
                        setShowBankModal(true);
                      }
                    }}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      hasBank 
                        ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {hasBank ? 'Déconnecter' : 'Connecter'}
                  </button>
                </div>
              </div>

              {showPaymentConfigStatus && (
                <div className="mt-4 p-3 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg text-sm text-center">
                  {showPaymentConfigStatus}
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800/50 p-6 border-t border-gray-100 dark:border-gray-700">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Comment fonctionne le paiement automatique ?</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>Vous connectez vos comptes sur cette page.</li>
                <li>L'application génère un QR code unique pour chaque locataire.</li>
                <li>Le locataire scanne le QR code et paie sur le portail sécurisé.</li>
                <li>Notre système détecte la référence du paiement entrant.</li>
                <li>Le paiement est ajouté dans votre Historique, et vous recevez une notification.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}

      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Déconnexion</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Êtes-vous sûr de vouloir vous déconnecter ?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowLogoutModal(false)} 
                className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Annuler
              </button>
              <button 
                onClick={handleLogout}
                className="flex-1 py-2.5 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearDataModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 transition-colors">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-8 h-8" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Vider l'application</h2>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
              <strong>ATTENTION :</strong> Vous êtes sur le point de supprimer DÉFINITIVEMENT toutes les données de votre compte (Biens immobiliers, Locataires, Paiements, Dépenses, Requêtes de maintenance).
              <br /><br />
              Cette action est irréversible. Êtes-vous absolument sûr de vouloir continuer ?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowClearDataModal(false)} 
                disabled={isClearingData}
                className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button 
                onClick={handleClearData}
                disabled={isClearingData}
                className="flex-1 py-2.5 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isClearingData ? 'Suppression...' : 'Oui, tout supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMobileMoneyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Choisir le fournisseur</h2>
            <div className="space-y-3 mb-6">
              {['M-Pesa', 'Orange Money', 'Airtel Money', 'Afrimoney'].map(provider => (
                <label key={provider} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input 
                    type="radio" 
                    name="mobileMoneyProvider" 
                    value={provider} 
                    checked={mobileMoneyProvider === provider}
                    onChange={(e) => setMobileMoneyProvider(e.target.value)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-900 dark:text-white font-medium">{provider}</span>
                </label>
              ))}
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Numéro de téléphone</label>
              <input 
                type="tel" 
                value={mobileMoneyPhone} 
                onChange={e => setMobileMoneyPhone(e.target.value)} 
                placeholder="Ex: 0812345678"
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowMobileMoneyModal(false);
                  setMobileMoneyProvider('');
                  setMobileMoneyPhone('');
                }} 
                className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Annuler
              </button>
              <button 
                onClick={async () => {
                  if (mobileMoneyProvider && mobileMoneyPhone.trim() !== '') {
                    setHasMobileMoney(true);
                    setShowMobileMoneyModal(false);
                    await savePaymentSetting({ mobileMoneyProvider, mobileMoneyPhone });
                    setShowPaymentConfigStatus(`Compte Mobile Money (${mobileMoneyProvider}) connecté avec succès.`);
                    setTimeout(() => setShowPaymentConfigStatus(''), 3000);
                  } else {
                    toast.error("Veuillez remplir tous les champs");
                  }
                }}
                disabled={!mobileMoneyProvider || !mobileMoneyPhone.trim()}
                className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {showBankModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Choisir la banque</h2>
            <div className="space-y-3 mb-6">
              {['Equity BCDC', 'Rawbank', 'Ecobank', 'TMB', 'Access Bank'].map(provider => (
                <label key={provider} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input 
                    type="radio" 
                    name="bankProvider" 
                    value={provider} 
                    checked={bankProvider === provider}
                    onChange={(e) => setBankProvider(e.target.value)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-900 dark:text-white font-medium">{provider}</span>
                </label>
              ))}
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Numéro de compte</label>
              <input 
                type="text" 
                value={bankAccountNumber} 
                onChange={e => setBankAccountNumber(e.target.value)} 
                placeholder="Ex: 000111222333"
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowBankModal(false);
                  setBankProvider('');
                  setBankAccountNumber('');
                }} 
                className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Annuler
              </button>
              <button 
                onClick={async () => {
                  if (bankProvider && bankAccountNumber.trim() !== '') {
                    setHasBank(true);
                    setShowBankModal(false);
                    await savePaymentSetting({ bankProvider, bankAccountNumber });
                    setShowPaymentConfigStatus(`Compte bancaire (${bankProvider}) connecté avec succès.`);
                    setTimeout(() => setShowPaymentConfigStatus(''), 3000);
                  } else {
                    toast.error("Veuillez remplir tous les champs");
                  }
                }}
                disabled={!bankProvider || !bankAccountNumber.trim()}
                className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
