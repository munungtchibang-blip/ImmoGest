import React, { useEffect, useState } from 'react';
import { X, Share, MoreVertical } from 'lucide-react';
import { Logo } from './Logo';

export function InstallPrompt() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [browserContext, setBrowserContext] = useState<'ios' | 'android-chrome' | 'desktop' | 'unknown'>('unknown');
  const [dismissed, setDismissed] = useState(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    return isStandalone || localStorage.getItem('installPromptDismissed') === 'true';
  });

  useEffect(() => {
    if (dismissed) return;

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isAndroid = /Android/.test(ua);
    
    if (isIOS) {
      setBrowserContext('ios');
    } else if (isAndroid) {
      setBrowserContext('android-chrome');
    } else {
      setBrowserContext('desktop');
    }

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    
    if ((window as any).deferredPrompt) {
      setIsInstallable(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, [dismissed]);

  const handleInstall = async () => {
    if (window.self !== window.top) {
      alert("Pour installer l'application, veuillez d'abord ouvrir l'application dans un nouvel onglet.");
      return;
    }
    const promptEvent = (window as any).deferredPrompt;
    if (!promptEvent) return;

    try {
      await promptEvent.prompt();
      const result = await promptEvent.userChoice;
      
      if (result.outcome === 'accepted') {
        setIsInstallable(false);
        setDismissed(true);
      }
      (window as any).deferredPrompt = null;
    } catch (err) {
      console.error("Erreur lors de l'installation:", err);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('installPromptDismissed', 'true');
  };

  if (dismissed) return null;

  return (
    <div className="bg-indigo-600 dark:bg-indigo-900 text-white p-4 flex items-center justify-between gap-4 w-full relative z-50">
      <div className="flex items-center gap-3">
        <div className="hidden sm:block shrink-0">
          <Logo className="w-10 h-10" />
        </div>
        <div>
          <h3 className="font-bold text-sm sm:text-base">Installer l'application</h3>
          <p className="text-xs sm:text-sm text-indigo-100 mt-1">
             {isInstallable 
               ? "Installez l'app pour un accès rapide" 
               : browserContext === 'ios' 
                 ? `Appuyez sur l'icône Partager puis "Sur l'écran d'accueil"` 
                 : browserContext === 'android-chrome'
                 ? `Appuyez sur le menu (⋮) de votre navigateur puis "Ajouter à l'écran d'accueil"`
                 : `Cliquez sur l'icône d'installation dans la barre d'adresse de votre navigateur`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isInstallable ? (
          <button 
            onClick={handleInstall}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white text-indigo-600 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Installer
          </button>
        ) : (
          <div className="bg-white/20 p-2 rounded-lg flex items-center gap-2 text-xs">
            {browserContext === 'ios' ? <Share className="w-4 h-4" /> : <MoreVertical className="w-4 h-4" />}
          </div>
        )}
        <button onClick={handleDismiss} className="p-2 hover:bg-white/10 rounded-full transition-colors ml-1">
          <X className="w-5 h-5 text-indigo-100" />
        </button>
      </div>
    </div>
  );
}
