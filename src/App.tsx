/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare global {
  interface Window {
    deferredPrompt: any;
    recaptchaVerifier: any;
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPrompt = e;
});

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, loginWithGoogle, db } from './lib/firebase';
import { setDoc, doc, getDoc, collection, addDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import './lib/i18n';
import toast, { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Tenants } from './pages/Tenants';
import { TenantDetail } from './pages/TenantDetail';
import { Payments } from './pages/Payments';
import { Maintenance } from './pages/Maintenance';
import { Expenses } from './pages/Expenses';
import { Calendar } from './pages/Calendar';
import { Properties } from './pages/Properties';
import { PropertyDetail } from './pages/PropertyDetail';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { PublicPay } from './pages/PublicPay';
import { Contracts } from './pages/Contracts';
import { Logo } from './components/Logo';

import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'main' | 'email'>('main');
  const [isRegister, setIsRegister] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      let res;
      if (isRegister) {
        res = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(res.user);
        toast.success("Un email de vérification a été envoyé. Veuillez vérifier votre boîte mail avant de vous connecter.");
        setIsRegister(false);
        // Automatically sign out so they have to login after verifying
        await signOut(auth);
      } else {
        res = await signInWithEmailAndPassword(auth, email, password);
        if (!res.user.emailVerified) {
          toast.error("Veuillez vérifier votre adresse email avant de vous connecter.");
          await signOut(auth);
          setLoading(false);
          return;
        }
        if (res && res.user) {
          onSuccess();
        }
      }
    } catch (e: any) {
      if (e.code === 'auth/operation-not-allowed') {
        toast.error("Connexion par email/mot de passe non autorisée. Veuillez l'activer dans la console Firebase.", { duration: 6000 });
      } else if (e.code === 'auth/email-already-in-use') {
        toast.error("Cet email est déjà utilisé par un autre compte.");
      } else {
        toast.error(`Erreur: ${e.message || "Identifiants incorrects"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await loginWithGoogle();
      if (res && res.user) {
         const u = res.user;
         const userDoc = await getDoc(doc(db, 'users', u.uid));
         if (!userDoc.exists()) {
             const q = query(collection(db, 'tenants'), where('email', '==', u.email));
             const snaps = await getDocs(q);
             let role = 'landlord';
             let tid = null;
             if (!snaps.empty) {
                 role = 'tenant';
                 tid = snaps.docs[0].id;
             }
             await setDoc(doc(db, 'users', u.uid), {
               name: u.displayName || 'Utilisateur',
               phone: '',
               email: u.email,
               googleEmail: u.email,
               role,
               ...(tid ? { tenantId: tid } : {}),
               createdAt: new Date().toISOString()
             });
         }
         
         // Bonus: Login history
         try {
           await addDoc(collection(db, 'users', u.uid, 'loginHistory'), {
             timestamp: new Date().toISOString(),
             method: 'google',
             userAgent: navigator.userAgent
           });
           toast.success("Nouvelle connexion détectée.", { position: 'bottom-center' });
         } catch (err) {
           console.error("Login history error", err);
         }
         
         onSuccess();
      }
    } catch (e: any) {
        if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
          toast.error("Connexion Google annulée. Ouvrez l'application dans un NOUVEL ONGLET si la fenêtre ne s'ouvre pas.");
        } else if (e.code === 'auth/popup-blocked') {
          toast.error("Fenêtre bloquée. Veuillez ouvrir l'application dans un nouvel onglet ou autoriser les pop-ups.");
        } else if (e.code === 'auth/unauthorized-domain') {
          toast.error("Domaine non autorisé. Ajoutez cette URL dans la console Firebase (Authentication > Settings).");
        } else {
          toast.error(`Erreur Google: ${e.message || "Impossible de se connecter"}`);
        }
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
         <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Bienvenue</h2>
         <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Connectez-vous pour accéder à votre espace de gestion.</p>
      </div>
      
      {authMode === 'email' ? (
        <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mot de passe</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {isRegister ? "Créer un compte" : "Se connecter"}
          </button>
          
          <div className="flex flex-col gap-2 mt-4">
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="w-full text-center text-sm text-blue-600 hover:text-blue-700 dark:hover:text-blue-400"
            >
              {isRegister ? "Déjà un compte ? Se connecter" : "Pas de compte ? Créer un compte"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('main');
              }}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Retour
            </button>
          </div>
        </form>
      ) : (
        <>
          <button
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-white py-3 px-4 rounded-xl font-medium transition-all shadow-sm hover:shadow-md disabled:opacity-50"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            Continuer avec Google
          </button>
          
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
            <span className="flex-shrink-0 mx-4 text-gray-400 text-sm">Ou pour les nouveaux utilisateurs</span>
            <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
          </div>
          
          <button
            onClick={() => {
              setAuthMode('email');
              setIsRegister(true);
            }}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
          >
            Créer un compte par Email
          </button>

          <p className="text-xs text-center text-gray-500 mt-4">
            Utilisez Google si vous avez déjà un compte, ou créez-en un nouveau par email.
          </p>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'landlord' | 'tenant' | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Do not immediately authorize until role is loaded
        
        try {
          const userDocPromise = getDoc(doc(db, 'users', currentUser.uid));
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
          const userDoc = await Promise.race([userDocPromise, timeoutPromise]) as any;

          if (userDoc && userDoc.exists && userDoc.exists()) {
             const data = userDoc.data();
             let currentRole = data.role || 'landlord';
             let currentTenantId = data.tenantId || null;

             // Only override to tenant automatically if they don't have a specific preference set
             // Or maybe we just do it if they don't have a role, or we let them toggle via a specific flag.
             // Let's use a non-destructive check. If they are 'tenant' or 'landlord' in DB, respect it!
             // Because clicking "Retour" sets role to 'landlord'. If we just respect data.role, they will be landlord!
             // But what if they were just newly added as a tenant?
             // Let's check `data.forceRole` or just respect `data.role`.
             // Actually, if we just remove the forced override here, it will fix the issue.
             // Wait, if we remove it, a landlord who adds themselves as a tenant won't see the tenant UI unless they switch?
             // That's fine! They can just use a test email or we build a switch later.
             // For now, let's just respect the role stored in DB!
             
             if (currentRole === 'tenant') {
                 // ensure we have the tenantId
                 if (!currentTenantId) {
                     if (currentUser.email) {
                        const qMail = query(collection(db, 'tenants'), where('email', '==', currentUser.email));
                        const sMail = await getDocs(qMail);
                        if (!sMail.empty) {
                           currentTenantId = sMail.docs[0].id;
                           await updateDoc(doc(db, 'users', currentUser.uid), { tenantId: currentTenantId });
                        }
                     }
                 }
                 // If we still don't have a linked tenant, they shouldn't be trapped in a blank tenant space
                 if (!currentTenantId) {
                    currentRole = 'landlord';
                    await updateDoc(doc(db, 'users', currentUser.uid), { role: 'landlord' });
                 }
             }

             // If their role is landlord, but they want to access tenant space, they'd have a button.
             // But for now, we just respect currentRole so "Retour à l'espace" works.


             setRole(currentRole);
             if (currentRole === 'tenant') setTenantId(currentTenantId);
          } else {
             // Check if email or phone matches any tenant
             let tid = null;
             if (currentUser.email) {
                 const qEmail = query(collection(db, 'tenants'), where('email', '==', currentUser.email));
                 const snapEmail = await getDocs(qEmail);
                 if (!snapEmail.empty) tid = snapEmail.docs[0].id;
             }
             if (!tid && currentUser.phoneNumber) {
                 const qPhone = query(collection(db, 'tenants'), where('phone', '==', currentUser.phoneNumber));
                 const snapPhone = await getDocs(qPhone);
                 if (!snapPhone.empty) tid = snapPhone.docs[0].id;
             }
             
             // If still no tid, check if they are visiting a specific tenant portal URL to link them
             if (!tid) {
                 const match = window.location.pathname.match(/^\/pay\/(.+)$/);
                 if (match) {
                     const urlTenantId = match[1];
                     try {
                         const tDoc = await getDoc(doc(db, 'tenants', urlTenantId));
                         if (tDoc.exists()) {
                             const tData = tDoc.data();
                             // Link the user to this tenant if they visited this specific URL
                             tid = urlTenantId;
                             await updateDoc(doc(db, 'tenants', urlTenantId), {
                                 email: currentUser.email || tData.email || '',
                                 userId: currentUser.uid
                             });
                         }
                     } catch (err) {
                         console.error("Erreur lors de la liaison au locataire par URL:", err);
                     }
                 }
             }
             
             if (tid) {
               await setDoc(doc(db, 'users', currentUser.uid), {
                 name: currentUser.displayName || 'Locataire',
                 phone: currentUser.phoneNumber || '',
                 email: currentUser.email || '',
                 googleEmail: currentUser.email || '',
                 role: 'tenant',
                 tenantId: tid,
                 createdAt: new Date().toISOString()
               });
               setRole('tenant');
               setTenantId(tid);
             } else {
               await setDoc(doc(db, 'users', currentUser.uid), {
                 name: currentUser.displayName || 'Utilisateur',
                 phone: currentUser.phoneNumber || '',
                 email: currentUser.email || '',
                 googleEmail: currentUser.email || '',
                 role: 'landlord',
                 createdAt: new Date().toISOString()
               });
               setRole('landlord');
             }
          }
          setIsAuthorized(true);
        } catch (error: any) {
          console.warn("Retard réseau lors de la récupération du rôle utilisateur", error);
          // Fallback, limit to what we know or wait
        }
        
      } else {
        setUser(null);
        setRole(null);
        setTenantId(null);
        setIsAuthorized(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || !isAuthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
        <Toaster />
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6 transition-colors">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Logo className="w-20 h-20" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ImmoGest Kinshasa</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">Gérez vos locataires et loyers facilement.</p>
          </div>
          
          <LoginForm onSuccess={() => setIsAuthorized(true)} />
        </div>
      </div>
    );
  }

  if (role === 'tenant') {
    return (
      <BrowserRouter>
        <Toaster />
        <Routes>
          <Route path="/" element={<PublicPay tenantId={tenantId || undefined} />} />
          <Route path="/pay/:id" element={<PublicPay tenantId={tenantId || undefined} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Toaster />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="properties" element={<Properties />} />
          <Route path="properties/:id" element={<PropertyDetail />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="tenants/:id" element={<TenantDetail />} />
          <Route path="payments" element={<Payments />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="maintenance" element={<Maintenance />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        <Route path="/pay/:id" element={<PublicPay />} />
      </Routes>
    </BrowserRouter>
  );
}
