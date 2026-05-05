import React, { useState } from 'react';
import { updateProfile, updatePassword, deleteUser, EmailAuthProvider, reauthenticateWithCredential, getAuth } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { User, Lock, Save, X, Trash2, AlertTriangle } from 'lucide-react';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [formData, setFormData] = useState({
    displayName: auth.currentUser?.displayName || '',
    newPassword: '',
    confirmPassword: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (formData.displayName !== auth.currentUser.displayName) {
        await updateProfile(auth.currentUser, { displayName: formData.displayName });
      }

      if (formData.newPassword) {
        if (formData.newPassword !== formData.confirmPassword) {
          throw new Error("Les mots de passe ne correspondent pas.");
        }
        await updatePassword(auth.currentUser, formData.newPassword);
      }

      setSuccess("Profil mis à jour avec succès.");
      setFormData(prev => ({ ...prev, newPassword: '', confirmPassword: '' }));
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      console.error("Error updating profile", err);
      setError(err.message || "Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser || !auth.currentUser.email) return;
    if (!deletePassword) {
      setError("Veuillez saisir votre mot de passe pour confirmer la suppression.");
      return;
    }

    setLoading(true);
    setError('');
    try {
      // 1. Re-authenticate
      const credential = EmailAuthProvider.credential(auth.currentUser.email, deletePassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      // 2. Cascade delete all data
      const uid = auth.currentUser.uid;
      const collectionsToWipe = ['properties', 'tenants', 'payments', 'maintenance', 'expenses'];
      
      for (const col of collectionsToWipe) {
        const q = query(collection(db, col), where('landlordId', '==', uid));
        const snap = await getDocs(q);
        const deletePromises = snap.docs.map(d => deleteDoc(doc(db, col, d.id)));
        await Promise.all(deletePromises);
      }

      // 3. Delete user doc
      await deleteDoc(doc(db, 'users', uid));

      // 4. Delete Auth user
      await deleteUser(auth.currentUser);
      
      onClose(); // App will redirect to login Since user is null
    } catch (err: any) {
      console.error("Delete account error:", err);
      setError("Erreur, mot de passe incorrect ou problème de connexion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6 transition-colors relative my-8">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-100 dark:bg-blue-900/30 w-12 h-12 rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mon Profil</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{auth.currentUser?.email}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-50 text-green-600 p-3 rounded-lg text-sm">
            {success}
          </div>
        )}

        {!isDeleting ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom d'affichage</label>
              <input 
                type="text" 
                value={formData.displayName} 
                onChange={e => setFormData({...formData, displayName: e.target.value})} 
                className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
              />
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Lock className="w-4 h-4" /> Changer le mot de passe
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nouveau mot de passe</label>
                  <input 
                    type="password" 
                    value={formData.newPassword} 
                    onChange={e => setFormData({...formData, newPassword: e.target.value})} 
                    className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmer le mot de passe</label>
                  <input 
                    type="password" 
                    value={formData.confirmPassword} 
                    onChange={e => setFormData({...formData, confirmPassword: e.target.value})} 
                    className="w-full p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Annuler</button>
              <button type="submit" disabled={loading} className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Save className="w-4 h-4" />
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-6">
              <button
                type="button"
                onClick={() => setIsDeleting(true)}
                className="w-full flex items-center justify-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 py-2.5 rounded-xl font-medium transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                Supprimer mon compte
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
             <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-xl flex items-start gap-3">
               <AlertTriangle className="w-6 h-6 shrink-0 text-red-600 dark:text-red-400" />
               <div>
                 <h4 className="font-bold">Suppression définitive</h4>
                 <p className="text-sm mt-1">Toutes vos données seront supprimées définitivement (propriétés, locataires, paiements). Cette action est irréversible.</p>
               </div>
             </div>
             
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirmez avec votre mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={e => setDeletePassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 outline-none transition-all text-gray-900 dark:text-white"
                  />
                </div>
             </div>
             
             <div className="flex gap-3 pt-4">
               <button
                 disabled={loading}
                 onClick={() => setIsDeleting(false)}
                 className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-medium transition-colors"
               >
                 Annuler
               </button>
               <button
                 disabled={loading || !deletePassword}
                 onClick={handleDeleteAccount}
                 className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50"
               >
                 <Trash2 className="w-5 h-5" />
                 {loading ? 'Suppression...' : 'Confirmer'}
               </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
