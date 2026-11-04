import { Variants } from 'motion/react';

/**
 * Animations unifiées ImmoGest - Style Tableau de Bord
 * Utilisé pour synchroniser les animations d'objets, cartes et listes à travers l'application.
 */

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 15, scale: 0.98 },
  show: { 
    opacity: 1, 
    y: 0, 
    scale: 1, 
    transition: { duration: 0.3 } 
  }
};

export const cardHoverProps = {
  whileHover: { y: -3, scale: 1.01 },
  transition: { duration: 0.2 }
};
