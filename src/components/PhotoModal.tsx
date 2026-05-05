import React from 'react';
import { X, ZoomIn } from 'lucide-react';

interface PhotoModalProps {
  url: string;
  onClose: () => void;
}

export function PhotoModal({ url, onClose }: PhotoModalProps) {
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 transition-opacity" onClick={onClose}>
      <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full">
          <X className="w-6 h-6" />
        </button>
        <img src={url} alt="Vue aggrandie" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" referrerPolicy="no-referrer" />
      </div>
    </div>
  );
}
