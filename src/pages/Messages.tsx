import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  orderBy, 
  getDocs,
  updateDoc,
  doc
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  MessageSquare, 
  Send, 
  Search, 
  User, 
  Wrench, 
  Check, 
  CheckCheck, 
  Phone, 
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { getWhatsAppShareUrl, formatDRCPhone } from '../utils/phoneUtils';
import toast from 'react-hot-toast';

interface Contact {
  id: string;
  name: string;
  role: 'tenant' | 'technician';
  phone?: string;
  email?: string;
  propertyName?: string;
  propertyAddress?: string;
  specialty?: string;
}

interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  recipientId: string;
  recipientName: string;
  text: string;
  createdAt: any;
  read: boolean;
  propertyAddress?: string;
}

export function Messages() {
  const currentUser = auth.currentUser;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'tenant' | 'technician'>('all');
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load contacts (tenants and technicians registered for this landlord)
  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.uid;

    const loadDirectory = async () => {
      try {
        const qTenants = query(collection(db, 'tenants'), where('landlordId', '==', uid));
        const qTechs = query(collection(db, 'technicians'), where('landlordId', '==', uid));

        const [tenantSnap, techSnap] = await Promise.all([
          getDocs(qTenants),
          getDocs(qTechs)
        ]);

        const list: Contact[] = [];

        tenantSnap.docs.forEach(d => {
          const data = d.data();
          list.push({
            id: d.id,
            name: data.name || 'Locataire sans nom',
            role: 'tenant',
            phone: data.phone || '',
            email: data.email || '',
            propertyName: data.propertyName || '',
            propertyAddress: data.propertyAddress || data.address || ''
          });
        });

        techSnap.docs.forEach(d => {
          const data = d.data();
          list.push({
            id: d.id,
            name: data.name || 'Technicien sans nom',
            role: 'technician',
            phone: data.phone || '',
            email: data.email || '',
            specialty: data.specialty || 'Tous corps d\'état'
          });
        });

        setContacts(list);
        if (list.length > 0) {
          setSelectedContact(prev => prev || list[0]);
        }
      } catch (err) {
        console.error("Erreur chargement contacts messagerie:", err);
      } finally {
        setLoadingContacts(false);
      }
    };

    loadDirectory();
  }, [currentUser]);

  // Load real-time messages for the active conversation
  useEffect(() => {
    if (!currentUser || !selectedContact) return;

    // A unique conversation ID pairing the landlord and the contact
    const conversationId = [currentUser.uid, selectedContact.id].sort().join('_');

    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MessageItem[];
      setMessages(msgs);

      // Auto-mark unread messages as read
      snapshot.docs.forEach(async (d) => {
        const data = d.data();
        if (data.recipientId === currentUser.uid && !data.read) {
          try {
            await updateDoc(doc(db, 'messages', d.id), { read: true });
          } catch (e) {
            console.debug("Mark read error:", e);
          }
        }
      });
    }, (err) => {
      console.warn("Retard synchro messages:", err);
    });

    return () => unsub();
  }, [currentUser, selectedContact]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const textToSend = (customText || inputText).trim();
    if (!textToSend || !currentUser || !selectedContact || sending) return;

    setSending(true);
    const conversationId = [currentUser.uid, selectedContact.id].sort().join('_');

    try {
      await addDoc(collection(db, 'messages'), {
        conversationId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'Bailleur (Gestion)',
        senderRole: 'landlord',
        recipientId: selectedContact.id,
        recipientName: selectedContact.name,
        recipientRole: selectedContact.role,
        text: textToSend,
        createdAt: serverTimestamp(),
        read: false,
        propertyAddress: selectedContact.propertyAddress || ''
      });

      setInputText('');
    } catch (err: any) {
      console.error("Erreur envoi message:", err);
      toast.error("Impossible d'envoyer le message.");
    } finally {
      setSending(false);
    }
  };

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone && c.phone.includes(searchTerm)) ||
      (c.propertyAddress && c.propertyAddress.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (filterRole === 'tenant') return matchesSearch && c.role === 'tenant';
    if (filterRole === 'technician') return matchesSearch && c.role === 'technician';
    return matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                Messagerie Instantanée Sécurisée
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Échangez en direct avec vos locataires et vos techniciens agréés
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-800">
            <ShieldCheck className="w-3.5 h-3.5" />
            Canal certifié ImmoGest Kinshasa
          </span>
        </div>
      </div>

      {/* Main Messaging Layout */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[580px] max-h-[720px]">
        {/* Left: Contacts Directory */}
        <div className="md:col-span-4 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full bg-gray-50/50 dark:bg-gray-850">
          {/* Search & Filter Header */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher locataire ou technicien..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => setFilterRole('all')}
                className={`py-1 rounded-lg text-[11px] font-bold transition-all ${
                  filterRole === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                }`}
              >
                Tous ({contacts.length})
              </button>
              <button
                onClick={() => setFilterRole('tenant')}
                className={`py-1 rounded-lg text-[11px] font-bold transition-all ${
                  filterRole === 'tenant'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                }`}
              >
                Locataires
              </button>
              <button
                onClick={() => setFilterRole('technician')}
                className={`py-1 rounded-lg text-[11px] font-bold transition-all ${
                  filterRole === 'technician'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                }`}
              >
                Techniciens
              </button>
            </div>
          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-750">
            {loadingContacts ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                Aucun contact trouvé
              </div>
            ) : (
              filteredContacts.map(contact => {
                const isSelected = selectedContact?.id === contact.id;
                return (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className={`w-full p-3 text-left transition-colors flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/40 border-l-4 border-l-blue-600'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      contact.role === 'tenant'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                    }`}>
                      {contact.role === 'tenant' ? <User className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                          {contact.name}
                        </p>
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                          contact.role === 'tenant'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {contact.role === 'tenant' ? 'Locataire' : 'Technicien'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {contact.propertyAddress || contact.specialty || contact.phone || 'Contact'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Chat Conversation */}
        <div className="md:col-span-8 flex flex-col h-full bg-white dark:bg-gray-800">
          {selectedContact ? (
            <>
              {/* Conversation Top Header */}
              <div className="p-3.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    selectedContact.role === 'tenant'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}>
                    {selectedContact.role === 'tenant' ? <User className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                      {selectedContact.name}
                      <span className="text-[10px] font-normal text-gray-400">
                        ({selectedContact.role === 'tenant' ? 'Locataire' : 'Prestataire technique'})
                      </span>
                    </h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {selectedContact.propertyAddress ? `Logement : ${selectedContact.propertyAddress}` : selectedContact.specialty || ''}
                      {selectedContact.phone ? ` • ${formatDRCPhone(selectedContact.phone)}` : ''}
                    </p>
                  </div>
                </div>

                {/* Quick actions for current contact */}
                <div className="flex items-center gap-2">
                  {selectedContact.phone && (
                    <a
                      href={getWhatsAppShareUrl(selectedContact.phone, `Bonjour ${selectedContact.name}, suite à notre échange sur ImmoGest :`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                      title="Ouvrir WhatsApp"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Messages Thread */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/30 dark:bg-gray-900/40">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                      Démarrez la conversation avec {selectedContact.name}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                      Envoyez une consigne, une quittance, un rappel de loyer ou répondez à une sollicitation technique.
                    </p>

                    {/* Quick suggestion buttons */}
                    <div className="flex flex-wrap gap-2 justify-center max-w-md pt-2">
                      <button
                        onClick={() => handleSendMessage(undefined, `Bonjour ${selectedContact.name}, je confirme la bonne réception de votre demande.`)}
                        className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:border-blue-500 transition-colors"
                      >
                        « Accusé de réception »
                      </button>
                      {selectedContact.role === 'tenant' ? (
                        <button
                          onClick={() => handleSendMessage(undefined, `Bonjour ${selectedContact.name}, ceci est un rappel amical concernant l'échéance de votre loyer de ce mois.`)}
                          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:border-blue-500 transition-colors"
                        >
                          « Rappel échéance loyer »
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSendMessage(undefined, `Bonjour ${selectedContact.name}, pouvez-vous me transmettre le devis ou point d'avancement pour les réparations ?`)}
                          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:border-blue-500 transition-colors"
                        >
                          « Demande de devis »
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.senderId === currentUser?.uid;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs ${
                            isMe
                              ? 'bg-blue-600 text-white rounded-br-none'
                              : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none border border-gray-100 dark:border-gray-600'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                          <div className={`flex items-center justify-end gap-1 text-[9px] mt-1 ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                            <span>
                              {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'À l\'instant'}
                            </span>
                            {isMe && (
                              msg.read ? <CheckCheck className="w-3 h-3 text-blue-200" /> : <Check className="w-3 h-3 text-blue-300" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Écrire un message à ${selectedContact.name}...`}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  className="flex-1 py-2.5 px-3.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs sm:text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-40 transition-all cursor-pointer flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8 text-gray-400">
              Sélectionnez un contact pour commencer la messagerie
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
