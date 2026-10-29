/**
 * Standard visual system for ImmoGest Kinshasa forms and modals.
 * Removes heavy black/dark modal backdrops in favor of clean, subtle floating panels.
 */

export const formStyles = {
  // Clean floating modal overlay with NO heavy black backdrop
  modalOverlay: 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-900/10 dark:bg-black/20 backdrop-blur-xs transition-all',
  
  // Floating modal container
  modalCard: 'relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200/90 dark:border-gray-750 p-5 sm:p-7 overflow-hidden my-auto max-h-[92vh] flex flex-col',
  
  // Small modal container (confirmation, quick edit)
  modalCardSm: 'relative w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200/90 dark:border-gray-750 p-6 overflow-hidden my-auto',

  // Large modal container
  modalCardLg: 'relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200/90 dark:border-gray-750 p-6 sm:p-8 overflow-hidden my-auto max-h-[94vh] flex flex-col',

  // Form input standard styling
  input: 'w-full py-2.5 px-3.5 text-xs sm:text-sm bg-gray-50/80 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all',

  // Form select standard styling
  select: 'w-full py-2.5 px-3.5 text-xs sm:text-sm bg-gray-50/80 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer',

  // Form textarea standard styling
  textarea: 'w-full py-2.5 px-3.5 text-xs sm:text-sm bg-gray-50/80 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-y',

  // Label standard styling
  label: 'block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center justify-between',

  // Form helper / caption text
  helper: 'text-[11px] text-gray-500 dark:text-gray-400 mt-1',

  // Form error text
  error: 'text-[11px] font-semibold text-rose-600 dark:text-rose-400 mt-1',

  // Primary Action Button (Blue / Gradient)
  btnPrimary: 'inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all disabled:opacity-50 cursor-pointer',

  // Secondary Action Button
  btnSecondary: 'inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-750 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer',

  // Danger Button
  btnDanger: 'inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer',

  // WhatsApp Action Button
  btnWhatsApp: 'inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer'
};
