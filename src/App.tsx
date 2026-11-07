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
import { setDoc, doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import './lib/i18n';
import toast, { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { Logo } from './components/Logo';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy loading route components for faster initial load
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Tenants = React.lazy(() => import('./pages/Tenants').then(m => ({ default: m.Tenants })));
const TenantDetail = React.lazy(() => import('./pages/TenantDetail').then(m => ({ default: m.TenantDetail })));
const Payments = React.lazy(() => import('./pages/Payments').then(m => ({ default: m.Payments })));
const Maintenance = React.lazy(() => import('./pages/Maintenance').then(m => ({ default: m.Maintenance })));
const Expenses = React.lazy(() => import('./pages/Expenses').then(m => ({ default: m.Expenses })));
const Calendar = React.lazy(() => import('./pages/Calendar').then(m => ({ default: m.Calendar })));
const Properties = React.lazy(() => import('./pages/Properties').then(m => ({ default: m.Properties })));
const PropertyDetail = React.lazy(() => import('./pages/PropertyDetail').then(m => ({ default: m.PropertyDetail })));
const Reports = React.lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const PublicPay = React.lazy(() => import('./pages/PublicPay').then(m => ({ default: m.PublicPay })));
const Contracts = React.lazy(() => import('./pages/Contracts').then(m => ({ default: m.Contracts })));
const TechnicianPortal = React.lazy(() => import('./pages/TechnicianPortal').then(m => ({ default: m.TechnicianPortal })));
const Radar = React.lazy(() => import('./pages/Radar').then(m => ({ default: m.Radar })));
const NotificationsCenter = React.lazy(() => import('./pages/NotificationsCenter').then(m => ({ default: m.NotificationsCenter })));
const NoticeAndTermination = React.lazy(() => import('./pages/NoticeAndTermination').then(m => ({ default: m.NoticeAndTermination })));
const Messages = React.lazy(() => import('./pages/Messages').then(m => ({ default: m.Messages })));
const Admin = React.lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));

function RouteLoadingFallback() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 space-y-3">
      <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Chargement optimisé...</p>
    </div>
  );
}

import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { normalizeEmail, verifyEmailUniqueness, lockEmailRegistration, maskEmail, generateSecurePin, generateSalt, hashPin } from './lib/identity';
import { Shield, CheckCircle2, AlertTriangle, KeyRound, ArrowRight, UserCheck, Wrench, Building, RefreshCw, Sparkles, Clock, Check, ShieldCheck } from 'lucide-react';

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'main' | 'login' | 'register' | 'code'>('main');
  const [selectedRole, setSelectedRole] = useState<'landlord' | 'tenant' | 'technician'>('landlord');
  
  // Registration & Login inputs
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Dynamic Password Strength Calculation (Faible / Moyen / Fort)
  const passwordStrength = React.useMemo(() => {
    if (!password) {
      return {
        score: 0,
        label: 'Non renseigné',
        color: 'text-gray-400',
        barColor: 'bg-gray-200 dark:bg-gray-700',
        badgeBg: 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700',
        hasMinLength: false,
        hasMixedCase: false,
        hasNumberOrSpecial: false,
      };
    }

    const hasMinLength = password.length >= 8;
    const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const hasNumberOrSpecial = hasNumber || hasSpecial;

    let criteriaCount = 0;
    if (password.length >= 8) criteriaCount++;
    if (hasMixedCase) criteriaCount++;
    if (hasNumber) criteriaCount++;
    if (hasSpecial) criteriaCount++;

    // Fort : 10+ car. avec mixité, ou 8+ car. avec 4 critères complets
    if ((password.length >= 10 && criteriaCount >= 3) || (password.length >= 8 && criteriaCount === 4)) {
      return {
        score: 3,
        label: 'Fort',
        color: 'text-emerald-600 dark:text-emerald-400',
        barColor: 'bg-emerald-500',
        badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
        hasMinLength,
        hasMixedCase,
        hasNumberOrSpecial,
      };
    }

    // Moyen : 8+ car. avec 2 critères, ou 6+ car. avec majuscule/minuscule et chiffre/symbole
    if ((password.length >= 8 && criteriaCount >= 2) || (password.length >= 6 && hasMixedCase && hasNumberOrSpecial)) {
      return {
        score: 2,
        label: 'Moyen',
        color: 'text-amber-600 dark:text-amber-400',
        barColor: 'bg-amber-500',
        badgeBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
        hasMinLength,
        hasMixedCase,
        hasNumberOrSpecial,
      };
    }

    // Faible : par défaut si moins de critères
    return {
      score: 1,
      label: 'Faible',
      color: 'text-red-600 dark:text-red-400',
      barColor: 'bg-red-500',
      badgeBg: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60',
      hasMinLength,
      hasMixedCase,
      hasNumberOrSpecial,
    };
  }, [password]);

  // 6-digit verification state
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [verificationDocId, setVerificationDocId] = useState<string | null>(null);
  const [matchedTenantId, setMatchedTenantId] = useState<string | null>(null);
  const [matchedTechId, setMatchedTechId] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState<number>(60);
  const [attempts, setAttempts] = useState<number>(0);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // 60-second resend countdown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (authMode === 'code' && resendCountdown > 0) {
      timer = setInterval(() => {
        setResendCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [authMode, resendCountdown]);

  // Handle individual digit input
  const handleDigitChange = (index: number, value: string) => {
    // Only accept numeric digit
    const cleaned = value.replace(/\D/g, '');
    const char = cleaned.slice(-1); // Take latest typed character

    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    // Auto-advance to next input if digit entered
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasteData) return;
    const newDigits = [...digits];
    for (let i = 0; i < pasteData.length; i++) {
      newDigits[i] = pasteData[i];
    }
    setDigits(newDigits);
    const targetFocus = Math.min(pasteData.length, 5);
    inputRefs.current[targetFocus]?.focus();
  };

  // Step 1: Check landlord authorization and initiate 6-digit email verification
  const handleInitiateRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setPermissionError(null);
    if (loading) return;

    const cleanEmail = normalizeEmail(email);
    const cleanPhone = phone.trim();

    if (!cleanEmail || !password || !confirmPassword || !name.trim()) {
      toast.error("Veuillez renseigner votre nom, email et mot de passe de confirmation.");
      return;
    }

    if (password.length < 6) {
      toast.error("Le mot de passe doit comporter au moins 6 caractères.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Les deux mots de passe ne correspondent pas. Veuillez vérifier votre saisie.");
      return;
    }

    setLoading(true);

    try {
      // Règle d'or ImmoGest : 1 adresse e-mail normalisée = 1 seule identité utilisateur
      const uniqueness = await verifyEmailUniqueness(cleanEmail);
      if (!uniqueness.isAvailable) {
        setPermissionError(uniqueness.errorMessage || "Cette adresse e-mail est déjà associée à un compte ImmoGest. Connectez-vous avec votre compte existant.");
        setLoading(false);
        return;
      }

      let foundTenantId: string | null = null;
      let foundTechId: string | null = null;

      // Rule: Tenant must have permission from landlord (pre-registered in 'tenants' collection)
      if (selectedRole === 'tenant') {
        let tenantFound = false;

        // Query by email
        const qEmail = query(collection(db, 'tenants'), where('email', '==', cleanEmail));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          tenantFound = true;
          foundTenantId = snapEmail.docs[0].id;
        }

        // Fallback: Query by phone if not found by email
        if (!tenantFound && cleanPhone) {
          const qPhone = query(collection(db, 'tenants'), where('phone', '==', cleanPhone));
          const snapPhone = await getDocs(qPhone);
          if (!snapPhone.empty) {
            tenantFound = true;
            foundTenantId = snapPhone.docs[0].id;
          }
        }

        if (!tenantFound) {
          setPermissionError(
            "Autorisation requise : Aucun dossier locataire actif n'a été trouvé avec cette adresse email ou ce numéro de téléphone. " +
            "Pour accéder à votre espace, votre propriétaire ou gestionnaire doit d'abord enregistrer vos coordonnées dans ImmoGest."
          );
          setLoading(false);
          return;
        }
        setMatchedTenantId(foundTenantId);
      }

      // Rule: Technician must be registered in 'technicians' collection by property manager
      if (selectedRole === 'technician') {
        let techFound = false;

        // Query by email
        const qEmail = query(collection(db, 'technicians'), where('email', '==', cleanEmail));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          techFound = true;
          foundTechId = snapEmail.docs[0].id;
        }

        // Query by phone
        if (!techFound && cleanPhone) {
          const qPhone = query(collection(db, 'technicians'), where('phone', '==', cleanPhone));
          const snapPhone = await getDocs(qPhone);
          if (!snapPhone.empty) {
            techFound = true;
            foundTechId = snapPhone.docs[0].id;
          }
        }

        // Query by access code if provided
        if (!techFound && accessCode) {
          const qCode = query(collection(db, 'technicians'), where('accessCode', '==', accessCode.trim()));
          const snapCode = await getDocs(qCode);
          if (!snapCode.empty) {
            techFound = true;
            foundTechId = snapCode.docs[0].id;
          }
        }

        if (!techFound) {
          setPermissionError(
            "Accès non approuvé : Aucun technicien n'est enregistré avec ces coordonnées ou ce code d'accès. " +
            "Veuillez demander au gestionnaire immobilier de vous ajouter à la liste des prestataires agréés."
          );
          setLoading(false);
          return;
        }
        setMatchedTechId(foundTechId);
      }

      // Generate 6-digit confirmation PIN cryptographically
      const generatedCode = generateSecurePin();
      const salt = generateSalt();
      const codeHash = await hashPin(generatedCode, salt);
      const emailDocKey = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
      const verifId = `verif_${emailDocKey}`;
      
      const expiryDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store in Firestore 'email_verifications' with hashed code (NO plaintext code)
      await setDoc(doc(db, 'email_verifications', verifId), {
        email: cleanEmail,
        codeHash,
        salt,
        role: selectedRole,
        tenantId: foundTenantId,
        technicianId: foundTechId,
        userName: name.trim(),
        phone: cleanPhone,
        createdAt: new Date().toISOString(),
        expiresAt: expiryDate.toISOString(),
        resendAvailableAt: new Date(Date.now() + 60 * 1000).toISOString(),
        attempts: 0,
        maxAttempts: 5,
        locked: false,
        verified: false
      });

      setVerificationDocId(verifId);
      setDigits(['', '', '', '', '', '']);
      setResendCountdown(60);
      setAttempts(0);
      setAuthMode('code');

      // Console logging for verification testing without exposing in UI
      console.info(`[ImmoGest Email Service] 📩 Code de vérification envoyé à ${cleanEmail} : ${generatedCode}`);

      toast.success(`Code de vérification envoyé à ${maskEmail(cleanEmail)} ! (Validité : 10 min)`);
    } catch (err: any) {
      console.error("Erreur lors de la validation :", err);
      toast.error(`Erreur: ${err.message || 'Impossible de poursuivre la vérification.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Validate 6-digit PIN and finalize account creation
  const handleVerifySixDigitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const fullCode = digits.join('');
    if (fullCode.length !== 6) {
      toast.error("Veuillez saisir les 6 chiffres du code de vérification.");
      return;
    }

    if (!verificationDocId) {
      toast.error("Session de vérification expirée. Veuillez recommencer.");
      setAuthMode('register');
      return;
    }

    if (attempts >= 5) {
      toast.error("Nombre maximal de 5 tentatives atteint. Veuillez demander un nouveau code.");
      return;
    }

    setLoading(true);

    try {
      const verifRef = doc(db, 'email_verifications', verificationDocId);
      const verifSnap = await getDoc(verifRef);

      if (!verifSnap.exists()) {
        toast.error("Session de vérification introuvable. Veuillez recommencer.");
        setAuthMode('register');
        setLoading(false);
        return;
      }

      const verifData = verifSnap.data();

      // Check if session is locked
      if (verifData.locked || (verifData.attempts || 0) >= 5) {
        setAttempts(5);
        toast.error("Session verrouillée après 5 tentatives infructueuses. Veuillez demander un nouveau code.");
        setLoading(false);
        return;
      }

      // Check expiration
      const now = new Date();
      const expiresAt = new Date(verifData.expiresAt);

      if (now > expiresAt) {
        toast.error("Ce code a expiré (validité 10 minutes). Veuillez en demander un nouveau.");
        setLoading(false);
        return;
      }

      // Compute hash of entered code and compare with stored hash
      const candidateHash = await hashPin(fullCode, verifData.salt);
      const isMatch = candidateHash === verifData.codeHash;

      if (!isMatch) {
        const nextAttempts = (verifData.attempts || 0) + 1;
        setAttempts(nextAttempts);
        const isLocked = nextAttempts >= 5;
        await updateDoc(verifRef, { 
          attempts: nextAttempts,
          locked: isLocked
        });

        if (isLocked) {
          toast.error("5 tentatives incorrectes. Votre session est verrouillée, veuillez demander un nouveau code.");
        } else {
          toast.error(`Code incorrect. Tentatives restantes : ${5 - nextAttempts}`);
        }
        setLoading(false);
        return;
      }

      // Code is valid! Mark as verified in Firestore
      await updateDoc(verifRef, { 
        verified: true, 
        verifiedAt: new Date().toISOString() 
      });

      // Create Firebase Auth user
      const cleanEmail = normalizeEmail(email);
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          toast.error("Cette adresse e-mail est déjà associée à un compte ImmoGest. Connectez-vous avec vos identifiants existants.");
          setAuthMode('login');
          setLoading(false);
          return;
        } else {
          throw authErr;
        }
      }

      const u = userCredential.user;

      // Save user record in Firestore 'users' collection
      await setDoc(doc(db, 'users', u.uid), {
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        role: selectedRole,
        tenantId: matchedTenantId || null,
        technicianId: matchedTechId || null,
        isVerified: true,
        emailVerified: true,
        verifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }, { merge: true });

      // Verrouille l'unicité stricte au niveau de la base de données
      await lockEmailRegistration(cleanEmail, u.uid, selectedRole);

      // If tenant, link user ID directly into the tenant's profile
      if (matchedTenantId) {
        await updateDoc(doc(db, 'tenants', matchedTenantId), {
          userId: u.uid,
          accountActivated: true,
          email: cleanEmail
        }).catch(err => console.warn("Tenant link error:", err));
      }

      // If technician, link user ID directly into the technician profile
      if (matchedTechId) {
        await updateDoc(doc(db, 'technicians', matchedTechId), {
          userId: u.uid,
          accountActivated: true,
          email: cleanEmail
        }).catch(err => console.warn("Tech link error:", err));
      }

      // Sauvegarde de la session locale pour éviter toute déconnexion au rafraîchissement
      if (typeof window !== 'undefined') {
        localStorage.setItem('immogest_user_session', JSON.stringify({
          uid: u.uid,
          email: cleanEmail,
          role: selectedRole,
          tenantId: matchedTenantId || null,
          isVerified: true,
          timestamp: Date.now()
        }));
      }

      toast.success("Compte créé et vérifié avec succès !");
      onSuccess();
    } catch (err: any) {
      console.error("Erreur lors de la validation du code :", err);
      toast.error(`Erreur: ${err.message || 'Échec de la validation.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Resend 6-digit code
  const handleResendCode = async () => {
    if (resendCountdown > 0 || loading || !email) return;
    setLoading(true);
    try {
      const cleanEmail = normalizeEmail(email);
      const generatedCode = generateSecurePin();
      const salt = generateSalt();
      const codeHash = await hashPin(generatedCode, salt);
      const emailDocKey = cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
      const verifId = `verif_${emailDocKey}`;
      const expiryDate = new Date(Date.now() + 10 * 60 * 1000);

      await setDoc(doc(db, 'email_verifications', verifId), {
        email: cleanEmail,
        codeHash,
        salt,
        role: selectedRole,
        tenantId: matchedTenantId,
        technicianId: matchedTechId,
        userName: name.trim(),
        phone: phone.trim(),
        createdAt: new Date().toISOString(),
        expiresAt: expiryDate.toISOString(),
        resendAvailableAt: new Date(Date.now() + 60 * 1000).toISOString(),
        attempts: 0,
        maxAttempts: 5,
        locked: false,
        verified: false
      });

      setVerificationDocId(verifId);
      setDigits(['', '', '', '', '', '']);
      setResendCountdown(60);
      setAttempts(0);

      console.info(`[ImmoGest Email Service] 📩 Nouveau code de vérification envoyé à ${cleanEmail} : ${generatedCode}`);

      toast.success(`Nouveau code envoyé à ${maskEmail(cleanEmail)} ! (Validité : 10 min)`);
    } catch {
      toast.error("Erreur lors du renvoi du code.");
    } finally {
      setLoading(false);
    }
  };

  // Standard Login for existing users
  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      if (res && res.user) {
        try {
          const uSnap = await getDoc(doc(db, 'users', res.user.uid));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            if (typeof window !== 'undefined') {
              localStorage.setItem('immogest_user_session', JSON.stringify({
                uid: res.user.uid,
                email: res.user.email,
                role: uData.role || 'landlord',
                tenantId: uData.tenantId || null,
                isVerified: Boolean(uData.isVerified || uData.emailVerified),
                timestamp: Date.now()
              }));
            }
          }
        } catch (cacheErr) {
          console.warn("Erreur mise en cache session locale :", cacheErr);
        }
        toast.success("Connexion réussie !");
        onSuccess();
      }
    } catch (e: any) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        toast.error("Email ou mot de passe incorrect.");
      } else {
        toast.error(`Erreur: ${e.message || "Impossible de se connecter."}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Google Login
  const handleGoogleLogin = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await loginWithGoogle();
      if (res && res.user) {
        const u = res.user;
        try {
          const userDocRef = doc(db, 'users', u.uid);
          const userDoc = await getDoc(userDocRef);
          const cleanMail = (u.email || '').trim().toLowerCase();
          
          let role = userDoc.exists() ? userDoc.data().role : null;
          let tid: string | null = userDoc.exists() ? userDoc.data().tenantId : null;
          let techId: string | null = userDoc.exists() ? userDoc.data().technicianId : null;

          // If no role or previously defaulted to landlord, check real identity in collections
          if (!role || role === 'landlord') {
            if (cleanMail) {
              // 1. Check if user is an existing tenant
              const qTenant = query(collection(db, 'tenants'), where('email', '==', cleanMail));
              const snapTenant = await getDocs(qTenant);
              if (!snapTenant.empty) {
                role = 'tenant';
                tid = snapTenant.docs[0].id;
                await updateDoc(doc(db, 'tenants', tid), {
                  userId: u.uid,
                  accountActivated: true
                }).catch(console.warn);
              } else {
                // 2. Check if user is an existing technician
                const qTech = query(collection(db, 'technicians'), where('email', '==', cleanMail));
                const snapTech = await getDocs(qTech);
                if (!snapTech.empty) {
                  role = 'technician';
                  techId = snapTech.docs[0].id;
                  await updateDoc(doc(db, 'technicians', techId), {
                    userId: u.uid,
                    accountActivated: true
                  }).catch(console.warn);
                }
              }
            }
          }

          const finalRole = role || 'landlord';
          await setDoc(userDocRef, {
            name: u.displayName || 'Utilisateur',
            phone: u.phoneNumber || '',
            email: cleanMail,
            googleEmail: cleanMail,
            role: finalRole,
            ...(tid ? { tenantId: tid } : {}),
            ...(techId ? { technicianId: techId } : {}),
            isVerified: true,
            emailVerified: true,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          // Verrouille l'unicité globale
          await lockEmailRegistration(cleanMail, u.uid, finalRole);

          // Sauvegarde de la session locale pour éviter les déconnexions
          if (typeof window !== 'undefined') {
            localStorage.setItem('immogest_user_session', JSON.stringify({
              uid: u.uid,
              email: cleanMail,
              role: finalRole,
              tenantId: tid || null,
              isVerified: true,
              timestamp: Date.now()
            }));
          }
        } catch (dbErr) {
          console.warn("Mise à jour Firestore utilisateur Google :", dbErr);
        }
        toast.success("Connexion Google réussie !");
        onSuccess();
      }
    } catch (e: any) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        toast.error("Connexion Google annulée.");
      } else if (e.code === 'auth/popup-blocked') {
        toast.error("Fenêtre contextuelle Google bloquée par votre navigateur. Veuillez autoriser les pop-ups.");
      } else if (e.code === 'auth/account-exists-with-different-credential') {
        toast.error("Un compte existe déjà avec cette adresse e-mail. Veuillez vous connecter avec votre mot de passe habituel pour relier vos accès.");
      } else {
        toast.error(`Erreur Google: ${e.message || "Impossible de se connecter"}`);
      }
    } finally {
      setLoading(false);
    }

  };

  return (
    <div className="space-y-4">
      {/* 6-DIGIT VERIFICATION VIEW */}
      {authMode === 'code' ? (
        <form onSubmit={handleVerifySixDigitCode} className="space-y-5 text-left modal-enter">
          <div className="text-center">
            <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <KeyRound className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Code de confirmation sécurisé</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
              Un code temporaire à 6 chiffres a été envoyé à l'adresse <strong className="text-blue-600 dark:text-blue-400 font-bold">{maskEmail(email)}</strong>.
            </p>
          </div>

          {/* Secure Expiration & Security Banner */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-3 rounded-xl flex items-center justify-between gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Validité : <strong>10 minutes</strong></span>
            </div>
            <span className="font-semibold bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded-md text-[11px]">
              {5 - attempts} essai{5 - attempts > 1 ? 's' : ''} restant{5 - attempts > 1 ? 's' : ''}
            </span>
          </div>

          {/* 6 Individual Digit Input Boxes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 text-center mb-2">
              Saisissez le code à 6 chiffres reçu
            </label>
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={el => { inputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleDigitChange(idx, e.target.value)}
                  onKeyDown={e => handleKeyDown(idx, e)}
                  onPaste={idx === 0 ? handlePaste : undefined}
                  className="w-11 h-14 sm:w-12 sm:h-16 text-center text-xl sm:text-2xl font-bold font-mono rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-blue-600 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/30 outline-none transition-all shadow-sm"
                  autoFocus={idx === 0}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Tentatives : {attempts} / 5</span>
            {resendCountdown > 0 ? (
              <span className="text-gray-400">Renvoyer dans {resendCountdown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Renvoyer un nouveau code
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || digits.join('').length !== 6}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 btn-interact"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                <span>Validation en cours...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Valider et accéder à mon espace</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAuthMode('register')}
            className="w-full text-center text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Modifier mes informations ou rôle
          </button>
        </form>
      ) : authMode === 'register' ? (
        /* REGISTRATION VIEW WITH ROLE PERMISSION CHECK */
        <form onSubmit={handleInitiateRegistration} className="space-y-4 text-left modal-enter">
          <div className="text-center mb-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Créer votre compte</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Première utilisation d'ImmoGest Kinshasa
            </p>
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Je crée mon compte en tant que :
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { setSelectedRole('landlord'); setPermissionError(null); }}
                className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  selectedRole === 'landlord'
                    ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Building className="w-4 h-4 text-blue-600" />
                  {selectedRole === 'landlord' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                </div>
                <div className="text-xs font-bold leading-tight">Propriétaire</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">Bailleur / Gestionnaire</div>
              </button>

              <button
                type="button"
                onClick={() => { setSelectedRole('tenant'); setPermissionError(null); }}
                className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  selectedRole === 'tenant'
                    ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  {selectedRole === 'tenant' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
                <div className="text-xs font-bold leading-tight">Locataire</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">Sur autorisation bailleur</div>
              </button>

              <button
                type="button"
                onClick={() => { setSelectedRole('technician'); setPermissionError(null); }}
                className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  selectedRole === 'technician'
                    ? 'border-amber-600 bg-amber-50/80 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Wrench className="w-4 h-4 text-amber-600" />
                  {selectedRole === 'technician' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                </div>
                <div className="text-xs font-bold leading-tight">Technicien</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">Prestataire agréé</div>
              </button>
            </div>
          </div>

          {/* Role Information Banner */}
          {selectedRole === 'tenant' && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
              <Shield className="w-4 h-4 flex-shrink-0 text-emerald-600 mt-0.5" />
              <span>
                <strong>Contrôle d'accès locataire :</strong> L'email ou numéro saisi doit correspondre à un dossier locatif déjà enregistré par votre bailleur sur ImmoGest.
              </span>
            </div>
          )}

          {selectedRole === 'technician' && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Wrench className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
              <span>
                <strong>Agrément technicien :</strong> Vous devez avoir été invité par le gestionnaire ou disposer de votre code d'accès de mission.
              </span>
            </div>
          )}

          {/* Permission error banner */}
          {permissionError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                {permissionError}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nom complet</label>
            <input 
              type="text" 
              required
              placeholder="Ex: Patrick Kalombo"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse Email</label>
            <input 
              type="email" 
              required
              placeholder="votre.email@exemple.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {(selectedRole === 'tenant' || selectedRole === 'technician') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Numéro de téléphone WhatsApp (RDC)
              </label>
              <input 
                type="tel" 
                placeholder="Ex: 0812345678 ou +243812345678"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}

          {selectedRole === 'technician' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Code d'accès technicien (optionnel)
              </label>
              <input 
                type="text" 
                placeholder="Ex: TECH-9421"
                value={accessCode}
                onChange={e => setAccessCode(e.target.value)}
                className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Mot de passe (min. 6 car.)</label>
              <input 
                type="password" 
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                className="w-full p-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmer mot de passe</label>
              <input 
                type="password" 
                required
                minLength={6}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirmez le mot de passe"
                className={`w-full p-2.5 text-sm border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 outline-none ${
                  confirmPassword && confirmPassword !== password 
                    ? 'border-red-400 focus:ring-red-400 dark:border-red-500' 
                    : 'border-gray-200 dark:border-gray-700 focus:ring-blue-500'
                }`}
              />
            </div>
          </div>
          {/* Dynamic Password Strength Gauge */}
          {password.length > 0 && (
            <div className="p-3 rounded-xl bg-gray-50/90 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-300 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  Force du mot de passe :
                </span>
                <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md border ${passwordStrength.badgeBg}`}>
                  {passwordStrength.label}
                </span>
              </div>

              {/* Segmented gauge bar: 3 segments */}
              <div className="grid grid-cols-3 gap-1.5 h-1.5 w-full">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    passwordStrength.score >= 1 ? passwordStrength.barColor : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    passwordStrength.score >= 2 ? passwordStrength.barColor : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    passwordStrength.score >= 3 ? passwordStrength.barColor : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              </div>

              {/* Dynamic criteria checklist */}
              <div className="grid grid-cols-3 gap-1 pt-0.5 text-[11px]">
                <div className={`flex items-center gap-1 transition-colors ${passwordStrength.hasMinLength ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                  <Check className={`w-3 h-3 shrink-0 ${passwordStrength.hasMinLength ? 'text-emerald-500' : 'text-gray-400 opacity-50'}`} />
                  <span className="truncate">8+ caractères</span>
                </div>
                <div className={`flex items-center gap-1 transition-colors ${passwordStrength.hasMixedCase ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                  <Check className={`w-3 h-3 shrink-0 ${passwordStrength.hasMixedCase ? 'text-emerald-500' : 'text-gray-400 opacity-50'}`} />
                  <span className="truncate">Maj. & min.</span>
                </div>
                <div className={`flex items-center gap-1 transition-colors ${passwordStrength.hasNumberOrSpecial ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                  <Check className={`w-3 h-3 shrink-0 ${passwordStrength.hasNumberOrSpecial ? 'text-emerald-500' : 'text-gray-400 opacity-50'}`} />
                  <span className="truncate">Chiffre / symbole</span>
                </div>
              </div>
            </div>
          )}
          {confirmPassword && confirmPassword !== password && (
            <p className="text-[11px] text-red-500 font-medium -mt-2">
              Les deux mots de passe ne correspondent pas.
            </p>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-sm hover:shadow disabled:opacity-50 flex items-center justify-center gap-2 btn-interact"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Vérification de l'autorisation...</span>
              </>
            ) : (
              <>
                <span>Vérifier et recevoir le code à 6 chiffres</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex flex-col gap-2 pt-1 text-center">
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setPermissionError(null); }}
              className="text-xs text-blue-600 hover:text-blue-700 dark:hover:text-blue-400 font-medium"
            >
              Vous avez déjà un compte ? Se connecter
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('main'); setPermissionError(null); }}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-400"
            >
              Retour à l'accueil
            </button>
          </div>
        </form>
      ) : authMode === 'login' ? (
        /* STANDARD LOGIN VIEW */
        <form onSubmit={handleStandardLogin} className="space-y-4 text-left modal-enter">
          <div className="text-center mb-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Connexion ImmoGest</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Accédez à votre espace de gestion</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full p-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Mot de passe</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-sm hover:shadow disabled:opacity-50"
          >
            {loading ? "Connexion en cours..." : "Se connecter"}
          </button>

          <div className="flex flex-col gap-2 pt-1 text-center">
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className="text-xs text-blue-600 hover:text-blue-700 dark:hover:text-blue-400 font-medium"
            >
              Première utilisation ? Créer un compte
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('main')}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-400"
            >
              Retour
            </button>
          </div>
        </form>
      ) : (
        /* MAIN LANDING WELCOME */
        <div className="space-y-4 modal-enter">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Bienvenue sur ImmoGest</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
              Plateforme professionnelle de gestion immobilière à Kinshasa (RDC)
            </p>
          </div>

          <button
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-700 dark:text-white py-3 px-4 rounded-xl font-medium transition-all shadow-sm hover:shadow disabled:opacity-50 btn-interact"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            <span>Continuer avec Google</span>
          </button>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
            <span className="flex-shrink-0 mx-3 text-gray-400 text-xs uppercase tracking-wider font-semibold">Ou</span>
            <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
          </div>

          <button
            onClick={() => setAuthMode('register')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 btn-interact"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Créer un compte (1ère utilisation)</span>
          </button>

          <button
            onClick={() => setAuthMode('login')}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-medium text-xs transition-colors"
          >
            J'ai déjà un compte : Me connecter par Email
          </button>

          <div className="pt-2 text-center">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Locataires & Techniciens : Accédez également via le lien direct sécurisé reçu par WhatsApp ou Email.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const SESSION_STORAGE_KEY = 'immogest_user_session';

function getInitialSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const cachedSession = React.useMemo(() => getInitialSession(), []);
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [role, setRole] = useState<'landlord' | 'tenant' | 'technician' | null>(() => cachedSession?.role || null);
  const [tenantId, setTenantId] = useState<string | null>(() => cachedSession?.tenantId || null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => Boolean(cachedSession?.isVerified));
  const [loading, setLoading] = useState<boolean>(() => !cachedSession);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        try {
          const userDocPromise = getDoc(doc(db, 'users', currentUser.uid));
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
          const userDoc = await Promise.race([userDocPromise, timeoutPromise]) as any;

          let currentRole: 'landlord' | 'tenant' | 'technician' = 'landlord';
          let currentTenantId: string | null = null;
          let isAccountVerified = false;

          const isPasswordProvider = currentUser.providerData.some(p => p.providerId === 'password');

          if (userDoc && userDoc.exists && userDoc.exists()) {
             const data = userDoc.data();
             currentRole = data.role || 'landlord';
             currentTenantId = data.tenantId || null;
             
             // Un compte est vérifié s'il provient de Google OU si Firestore confirme isVerified/emailVerified
             isAccountVerified = !isPasswordProvider || currentUser.emailVerified || Boolean(data.isVerified || data.emailVerified);
             
             if (currentRole === 'tenant') {
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
                 if (!currentTenantId) {
                    currentRole = 'landlord';
                    await updateDoc(doc(db, 'users', currentUser.uid), { role: 'landlord' });
                 }
             }

             setRole(currentRole);
             if (currentRole === 'tenant') setTenantId(currentTenantId);
          } else {
             // User document does not exist yet: Resolve role accurately from collections
             let tid = null;
             let techId = null;
             const cleanMail = (currentUser.email || '').trim().toLowerCase();

             // Google est vérifié par défaut
             isAccountVerified = !isPasswordProvider || currentUser.emailVerified;

             // 1. Check tenants
             if (cleanMail) {
                 const qEmail = query(collection(db, 'tenants'), where('email', '==', cleanMail));
                 const snapEmail = await getDocs(qEmail);
                 if (!snapEmail.empty) tid = snapEmail.docs[0].id;
             }
             if (!tid && currentUser.phoneNumber) {
                 const qPhone = query(collection(db, 'tenants'), where('phone', '==', currentUser.phoneNumber));
                 const snapPhone = await getDocs(qPhone);
                 if (!snapPhone.empty) tid = snapPhone.docs[0].id;
             }

             // 2. Check technicians
             if (!tid && cleanMail) {
                 const qTechEmail = query(collection(db, 'technicians'), where('email', '==', cleanMail));
                 const snapTechEmail = await getDocs(qTechEmail);
                 if (!snapTechEmail.empty) techId = snapTechEmail.docs[0].id;
             }
             if (!tid && !techId && currentUser.phoneNumber) {
                 const qTechPhone = query(collection(db, 'technicians'), where('phone', '==', currentUser.phoneNumber));
                 const snapTechPhone = await getDocs(qTechPhone);
                 if (!snapTechPhone.empty) techId = snapTechPhone.docs[0].id;
             }
             
             // 3. Link via visiting portal URL
             if (!tid && !techId) {
                 const match = window.location.pathname.match(/^\/pay\/(.+)$/);
                 if (match) {
                     const urlTenantId = match[1];
                     try {
                         const tDoc = await getDoc(doc(db, 'tenants', urlTenantId));
                         if (tDoc.exists()) {
                             const tData = tDoc.data();
                             tid = urlTenantId;
                             await updateDoc(doc(db, 'tenants', urlTenantId), {
                                 email: cleanMail || tData.email || '',
                                 userId: currentUser.uid
                             });
                         }
                     } catch (err) {
                         console.error("Erreur lors de la liaison au locataire par URL:", err);
                     }
                 }
             }
             
             if (tid) {
               currentRole = 'tenant';
               currentTenantId = tid;
               await setDoc(doc(db, 'users', currentUser.uid), {
                 name: currentUser.displayName || 'Locataire',
                 phone: currentUser.phoneNumber || '',
                 email: cleanMail,
                 googleEmail: cleanMail,
                 role: 'tenant',
                 tenantId: tid,
                 isVerified: true,
                 emailVerified: true,
                 createdAt: new Date().toISOString()
               });
               setRole('tenant');
               setTenantId(tid);
             } else if (techId) {
               currentRole = 'technician';
               await setDoc(doc(db, 'users', currentUser.uid), {
                 name: currentUser.displayName || 'Technicien',
                 phone: currentUser.phoneNumber || '',
                 email: cleanMail,
                 googleEmail: cleanMail,
                 role: 'technician',
                 technicianId: techId,
                 isVerified: true,
                 emailVerified: true,
                 createdAt: new Date().toISOString()
               });
               setRole('technician');
             } else {
               currentRole = 'landlord';
               await setDoc(doc(db, 'users', currentUser.uid), {
                 name: currentUser.displayName || 'Bailleur',
                 phone: currentUser.phoneNumber || '',
                 email: cleanMail,
                 googleEmail: cleanMail,
                 role: 'landlord',
                 isVerified: true,
                 emailVerified: true,
                 createdAt: new Date().toISOString()
               });
               setRole('landlord');
             }
          }

          if (isAccountVerified) {
            setIsAuthorized(true);
            if (typeof window !== 'undefined') {
              localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
                uid: currentUser.uid,
                email: currentUser.email,
                role: currentRole,
                tenantId: currentTenantId,
                isVerified: true,
                timestamp: Date.now()
              }));
            }
          } else {
            setIsAuthorized(false);
            if (typeof window !== 'undefined') {
              localStorage.removeItem(SESSION_STORAGE_KEY);
            }
          }
        } catch (error: any) {
          console.warn("Retard réseau lors de la récupération du rôle utilisateur", error);
          if (cachedSession?.isVerified) {
            setIsAuthorized(true);
          }
        }
        
      } else {
        setUser(null);
        setRole(null);
        setTenantId(null);
        setIsAuthorized(false);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [cachedSession]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <SubscriptionProvider>
          <Toaster />
          <React.Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              {/* Direct public portal routes (accessible directly via WhatsApp/Email links) */}
              <Route path="/pay/:id" element={<PublicPay />} />
              <Route path="/pay" element={<PublicPay />} />
              <Route path="/tech" element={<TechnicianPortal onSwitchRole={() => setRole('landlord')} />} />

              {/* Authentication and Role-based Protected Routes */}
              {loading ? (
                <Route
                  path="*"
                  element={
                    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                  }
                />
              ) : !user || !isAuthorized ? (
                <Route
                  path="*"
                  element={
                    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
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
                  }
                />
              ) : role === 'tenant' ? (
                <>
                  <Route path="/" element={<PublicPay tenantId={tenantId || undefined} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              ) : role === 'technician' ? (
                <>
                  <Route path="/" element={<TechnicianPortal onSwitchRole={() => setRole('landlord')} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              ) : (
                /* Landlord (Bailleur) Routes */
                <>
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
                    <Route path="terminations" element={<NoticeAndTermination />} />
                    <Route path="messages" element={<Messages />} />
                    <Route path="radar" element={<Radar />} />
                    <Route path="notifications" element={<NotificationsCenter />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="admin" element={<Admin />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </>
              )}
            </Routes>
          </React.Suspense>
        </SubscriptionProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

