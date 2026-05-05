import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Translations
const resources = {
  fr: {
    translation: {
      "Dashboard": "Tableau de Bord",
      "Properties": "Biens Immobiliers",
      "Tenants": "Locataires",
      "Payments": "Paiements",
      "Maintenance": "Problèmes",
      "Expenses": "Dépenses",
      "Reports": "Rapports",
      "Contracts": "Contrats",
      "Settings": "Paramètres",
      "Calendar": "Calendrier",
      "Sign Out": "Déconnexion",
      "Total Revenue": "Revenu total",
      "Pending Payments": "Paiements en attente",
      "Active Tenants": "Locataires actifs",
      "Aucun locataire trouvé.": "Aucun locataire trouvé.",
      "Consultez et gérez vos locataires et leurs baux.": "Consultez et gérez vos locataires et leurs baux.",
      "Nouveau Locataire": "Nouveau Locataire",
      "Toutes": "Toutes",
      "À jour": "À jour",
      "En retard": "En retard",
      "Loyer": "Loyer",
      "Garantie": "Garantie",
      "Voir le profil": "Voir le profil",
      "Biens Immobiliers": "Biens Immobiliers",
      "Gérez vos maisons, appartements et parcelles.": "Gérez vos maisons, appartements et parcelles.",
      "Nouveau Bien": "Nouveau Bien",
      "Aucun bien immobilier enregistré.": "Aucun bien immobilier enregistré.",
      "Bénéfice Net": "Bénéfice Net",
      "Voir les détails": "Voir les détails",
      "Maintenance Issues": "Problèmes en cours",
      "Add": "Ajouter",
      "Cancel": "Annuler",
      "Save": "Enregistrer",
      "Delete": "Supprimer",
      "Edit": "Modifier",
      "Welcome, here is a summary of your properties.": "Bienvenue, voici un résumé de vos propriétés.",
      "Locataires Actifs": "Locataires Actifs",
      "Revenus du mois": "Revenus du mois",
      "Paiements Eau": "Paiements Eau",
      "Paiements Élec.": "Paiements Élec.",
      "Revenu estimé": "Revenu estimé",
      "Garanties reçues": "Garanties reçues",
      "Espaces Libres": "Espaces Libres",
      "Loyers en retard": "Loyers en retard",
      "Raccourcis & Actions Rapides": "Raccourcis & Actions Rapides",
      "Ajouter Locataire": "Ajouter Locataire",
      "Nouveau Contrat": "Nouveau Contrat",
      "Nouveau Paiement": "Nouveau Paiement",
      "Encaisser Loyer": "Encaisser Loyer"
    }
  },
  en: {
    translation: {
      "Dashboard": "Dashboard",
      "Properties": "Properties",
      "Tenants": "Tenants",
      "Payments": "Payments",
      "Maintenance": "Maintenance",
      "Expenses": "Expenses",
      "Reports": "Reports",
      "Contracts": "Contracts",
      "Settings": "Settings",
      "Calendar": "Calendar",
      "Sign Out": "Sign Out",
      "Total Revenue": "Total Revenue",
      "Pending Payments": "Pending Payments",
      "Active Tenants": "Active Tenants",
      "Aucun locataire trouvé.": "No tenants found.",
      "Consultez et gérez vos locataires et leurs baux.": "View and manage your tenants and their leases.",
      "Nouveau Locataire": "New Tenant",
      "Toutes": "All",
      "À jour": "Up to date",
      "En retard": "Late",
      "Loyer": "Rent",
      "Garantie": "Guarantee",
      "Voir le profil": "View Profile",
      "Biens Immobiliers": "Properties",
      "Gérez vos maisons, appartements et parcelles.": "Manage your houses, apartments, and plots.",
      "Nouveau Bien": "New Property",
      "Aucun bien immobilier enregistré.": "No property registered.",
      "Bénéfice Net": "Net Income",
      "Voir les détails": "View Details",
      "Maintenance Issues": "Maintenance Issues",
      "Add": "Add",
      "Cancel": "Cancel",
      "Save": "Save",
      "Delete": "Delete",
      "Edit": "Edit",
      "Welcome, here is a summary of your properties.": "Welcome, here is a summary of your properties.",
      "Locataires Actifs": "Active Tenants",
      "Revenus du mois": "Monthly Revenue",
      "Paiements Eau": "Water Payments",
      "Paiements Élec.": "Electricity Payments",
      "Revenu estimé": "Estimated Revenue",
      "Garanties reçues": "Guarantees Received",
      "Espaces Libres": "Vacant Spaces",
      "Problèmes en cours": "Pending Issues",
      "Loyers en retard": "Late Rents",
      "Raccourcis & Actions Rapides": "Shortcuts & Quick Actions",
      "Ajouter Locataire": "Add Tenant",
      "Nouveau Contrat": "New Contract",
      "Nouveau Paiement": "New Payment",
      "Encaisser Loyer": "Collect Rent"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'fr', // default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // react already safes from xss
    }
  });

export default i18n;
