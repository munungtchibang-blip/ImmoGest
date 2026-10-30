import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  getDocs,
  getDoc,
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
  ShieldCheck,
  ArrowLeft,
  Building2
} from 'lucide-react';
import { getWhatsAppShareUrl, formatDRCPhone } from '../utils/phoneUtils';
import toast from 'react-hot-toast';

export interface Contact {
  id: string;
  name: string;
  role: 'landlord' | 'tenant' | 'technician';
  phone?: string;
  email?: string;
  propertyName?: string;
  propertyAddress?: string;
  specialty?: string;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  recipientId: string;
  recipientName: string;
  recipientRole: string;
  text: string;
  createdAt: any;
  read: boolean;
  propertyAddress?: string;
}

export interface MessagesProps {
  embeddedMode?: 'landlord' | 'tenant' | 'technician';
  tenantInfo?: { id: string; name: string; landlordId?: string; address?: string; phone?: string; email?: string };
  technicianInfo?: { id: string; name: string; landlordId?: string; phone?: string; specialty?: string };
}

export function Messages({ embeddedMode, tenantInfo, technicianInfo }: MessagesProps = {}) {
  const currentUser = auth.currentUser;
  const isTenantMode = embeddedMode === 'tenant';
  const isTechnicianMode = embeddedMode === 'technician';

  // Contacts directory
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'tenant' | 'technician'>('all');
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [sending, setSending] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(isTenantMode || isTechnicianMode);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Identify the sender context based on role
  const senderId = isTenantMode 
    ? (tenantInfo?.id || currentUser?.uid || 'tenant')
    : isTechnicianMode 
    ? (technicianInfo?.id || currentUser?.uid || 'technician')
    : (currentUser?.uid || 'landlord');

  const senderName = isTenantMode 
    ? (tenantInfo?.name || 'Locataire')
    : isTechnicianMode 
    ? (technicianInfo?.name || 'Technicien')
    : (currentUser?.displayName || 'Bailleur (Gestion)');

  const senderRole = isTenantMode ? 'tenant' : isTechnicianMode ? 'technician' : 'landlord';

  // Load directory / target contact
  useEffect(() => {
    let isMounted = true;

    const setupDirectory = async () => {
      setLoadingContacts(true);
      try {
        if (isTenantMode) {
          // Tenant chats with their landlord
          let landlordContactId = tenantInfo?.landlordId;
          if ((!landlordContactId || landlordContactId === 'landlord') && tenantInfo?.id) {
            try {
              const tSnap = await getDoc(doc(db, 'tenants', tenantInfo.id));
              if (tSnap.exists() && tSnap.data().landlordId) {
                landlordContactId = tSnap.data().landlordId;
              }
            } catch (err) {
              console.warn("Could not retrieve landlordId from tenant doc:", err);
            }
          }

          const defaultLandlordContact: Contact = {
            id: landlordContactId || 'landlord',
            name: 'Bailleur / Direction Immobilière',
            role: 'landlord',
            propertyAddress: tenantInfo?.address || 'Kinshasa'
          };
          if (isMounted) {
            setContacts([defaultLandlordContact]);
            setSelectedContact(defaultLandlordContact);
            setMobileShowChat(true);
          }
          return;
        }

        if (isTechnicianMode) {
          // Technician chats with their property manager
          const landlordContactId = technicianInfo?.landlordId || 'landlord';
          const defaultLandlordContact: Contact = {
            id: landlordContactId,
            name: 'Gestionnaire / Direction Travaux',
            role: 'landlord',
            specialty: technicianInfo?.specialty || 'Travaux & Maintenance'
          };
          if (isMounted) {
            setContacts([defaultLandlordContact]);
            setSelectedContact(defaultLandlordContact);
            setMobileShowChat(true);
          }
          return;
        }

        // Standard Landlord Mode: Load all tenants and technicians belonging to this landlord
        if (!currentUser) return;
        const uid = currentUser.uid;

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

        if (isMounted) {
          setContacts(list);
          if (list.length > 0 && !selectedContact) {
            setSelectedContact(list[0]);
          }
        }
      } catch (err) {
        console.error("Erreur chargement contacts messagerie:", err);
      } finally {
        if (isMounted) setLoadingContacts(false);
      }
    };

    setupDirectory();
    return () => {
      isMounted = false;
    };
  }, [currentUser, isTenantMode, isTechnicianMode, tenantInfo?.id, tenantInfo?.landlordId, tenantInfo?.address, technicianInfo?.id, technicianInfo?.landlordId, technicianInfo?.specialty, selectedContact]);

  // Real-time messages listener for active conversation
  // Note: NO orderBy in Firestore query to eliminate composite index requirement and fix send delays!
  useEffect(() => {
    if (!selectedContact || !senderId) return;

    // Unique deterministic conversation key between both parties
    const conversationId = [senderId, selectedContact.id].sort().join('_');

    const handleDocs = (docsList: any[]) => {
      const msgs = docsList.map(d => ({
        id: d.id,
        ...d.data()
      })) as MessageItem[];

      // Sort safely in client memory by timestamp
      msgs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (typeof a.createdAt === 'number' ? a.createdAt : 0));
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (typeof b.createdAt === 'number' ? b.createdAt : 0));
        return timeA - timeB;
      });

      setMessages(msgs);

      // Auto-mark unread incoming messages as read
      docsList.forEach(async (d) => {
        const data = d.data();
        if (data.recipientId === senderId && !data.read) {
          try {
            await updateDoc(doc(db, 'messages', d.id), { read: true });
          } catch (e) {
            console.debug("Silent mark read update:", e);
          }
        }
      });
    };

    if (isTenantMode && tenantInfo?.id) {
      // In tenant mode, listen directly for all messages linked to this tenant
      const qTenant = query(
        collection(db, 'messages'),
        where('tenantId', '==', tenantInfo.id)
      );
      const unsub = onSnapshot(qTenant, (snapshot) => {
        handleDocs(snapshot.docs);
      }, (err) => {
        console.warn("Synchro messages tenant live notice:", err);
      });
      return () => unsub();
    } else {
      const q = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId)
      );
      const unsub = onSnapshot(q, (snapshot) => {
        handleDocs(snapshot.docs);
      }, (err) => {
        console.warn("Synchro messages live notice:", err);
      });
      return () => unsub();
    }
  }, [selectedContact, senderId, isTenantMode, tenantInfo?.id]);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Select contact handler
  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setMobileShowChat(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const textToSend = (customText || inputText).trim();
    if (!textToSend || !selectedContact || !senderId || sending) return;

    setSending(true);
    const conversationId = [senderId, selectedContact.id].sort().join('_');

    try {
      const resolvedTenantId = isTenantMode 
        ? (tenantInfo?.id || senderId) 
        : (selectedContact.role === 'tenant' ? selectedContact.id : null);
      const resolvedLandlordId = isTenantMode 
        ? selectedContact.id 
        : (senderRole === 'landlord' ? senderId : null);

      await addDoc(collection(db, 'messages'), {
        conversationId,
        senderId,
        senderName,
        senderRole,
        recipientId: selectedContact.id,
        recipientName: selectedContact.name,
        recipientRole: selectedContact.role,
        ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {}),
        ...(resolvedLandlordId ? { landlordId: resolvedLandlordId } : {}),
        participantIds: [senderId, selectedContact.id],
        text: textToSend,
        createdAt: serverTimestamp(),
        read: false,
        propertyAddress: selectedContact.propertyAddress || tenantInfo?.address || ''
      });

      setInputText('');
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } catch (err: any) {
      console.error("Erreur envoi message:", err);
      toast.error("Impossible d'envoyer le message. Vérifiez votre connexion.");
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
    <div className="space-y-4 tab-enter">
      {/* Header (only shown if not fully embedded or if requested) */}
      {!isTenantMode && !isTechnicianMode && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              Canal certifié ImmoGest Kinshasa
            </span>
          </div>
        </div>
      )}

      {/* Main Messaging Container */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[540px] max-h-[720px]">
        {/* Left: Contacts Directory (Hidden on mobile if chat is active) */}
        {!isTenantMode && !isTechnicianMode && (
          <div className={`md:col-span-4 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full bg-gray-50/50 dark:bg-gray-850 ${mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
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
                  className={`py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    filterRole === 'all'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Tous ({contacts.length})
                </button>
                <button
                  onClick={() => setFilterRole('tenant')}
                  className={`py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    filterRole === 'tenant'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Locataires
                </button>
                <button
                  onClick={() => setFilterRole('technician')}
                  className={`py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
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
                      onClick={() => handleSelectContact(contact)}
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
        )}

        {/* Right: Active Chat Conversation */}
        <div className={`flex flex-col h-full bg-white dark:bg-gray-800 ${
          isTenantMode || isTechnicianMode 
            ? 'col-span-12' 
            : `md:col-span-8 ${!mobileShowChat ? 'hidden md:flex' : 'flex'}`
        }`}>
          {selectedContact ? (
            <>
              {/* Conversation Top Header */}
              <div className="p-3.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800">
                <div className="flex items-center gap-3">
                  {/* Back button for mobile in landlord mode */}
                  {!isTenantMode && !isTechnicianMode && (
                    <button
                      onClick={() => setMobileShowChat(false)}
                      className="md:hidden p-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
                      title="Retour à la liste"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}

                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    selectedContact.role === 'tenant'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : selectedContact.role === 'technician'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  }`}>
                    {selectedContact.role === 'tenant' ? (
                      <User className="w-5 h-5" />
                    ) : selectedContact.role === 'technician' ? (
                      <Wrench className="w-5 h-5" />
                    ) : (
                      <Building2 className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                      {selectedContact.name}
                      <span className="text-[10px] font-normal text-gray-400">
                        ({selectedContact.role === 'tenant' ? 'Locataire' : selectedContact.role === 'technician' ? 'Prestataire' : 'Bailleur'})
                      </span>
                    </h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {selectedContact.propertyAddress ? `Logement : ${selectedContact.propertyAddress}` : selectedContact.specialty || 'Canal direct sécurisé'}
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
                      {isTenantMode 
                        ? "Posez une question à votre bailleur, transmettez une quittance ou signalez un événement."
                        : isTechnicianMode
                        ? "Communiquez sur vos interventions, devis et rapports avec le gestionnaire."
                        : "Envoyez une consigne, un reçu, ou répondez aux sollicitations de votre interlocuteur."}
                    </p>

                    {/* Quick suggestion buttons */}
                    <div className="flex flex-wrap gap-2 justify-center max-w-md pt-2">
                      {isTenantMode ? (
                        <>
                          <button
                            onClick={() => handleSendMessage(undefined, "Bonjour, j'ai une question concernant le règlement de mon loyer.")}
                            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:border-blue-500 transition-colors cursor-pointer"
                          >
                            « Question loyer »
                          </button>
                          <button
                            onClick={() => handleSendMessage(undefined, "Bonjour, je souhaite vous signaler un besoin d'entretien dans mon logement.")}
                            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:border-blue-500 transition-colors cursor-pointer"
                          >
                            « Besoin d'entretien »
                          </button>
                        </>
                      ) : isTechnicianMode ? (
                        <>
                          <button
                            onClick={() => handleSendMessage(undefined, "Bonjour, je suis sur place pour démarrer l'intervention.")}
                            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:border-blue-500 transition-colors cursor-pointer"
                          >
                            « Arrivée sur site »
                          </button>
                          <button
                            onClick={() => handleSendMessage(undefined, "Bonjour, le diagnostic est posé et le devis a été renseigné.")}
                            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:border-blue-500 transition-colors cursor-pointer"
                          >
                            « Devis prêt »
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleSendMessage(undefined, `Bonjour ${selectedContact.name}, je confirme la bonne réception de votre demande.`)}
                            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:border-blue-500 transition-colors cursor-pointer"
                          >
                            « Accusé de réception »
                          </button>
                          {selectedContact.role === 'tenant' ? (
                            <button
                              onClick={() => handleSendMessage(undefined, `Bonjour ${selectedContact.name}, ceci est un rappel amical concernant l'échéance de votre loyer de ce mois.`)}
                              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:border-blue-500 transition-colors cursor-pointer"
                            >
                              « Rappel échéance loyer »
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSendMessage(undefined, `Bonjour ${selectedContact.name}, pouvez-vous me transmettre le devis ou point d'avancement pour les réparations ?`)}
                              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:border-blue-500 transition-colors cursor-pointer"
                            >
                              « Demande de devis »
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.senderId === senderId;
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
                  ref={inputRef}
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
