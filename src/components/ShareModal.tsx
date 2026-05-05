import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, X, Copy, Check } from 'lucide-react';

export function ShareModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = window.location.origin;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 transition-colors relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <X className="w-5 h-5" />
        </button>
        
        <div className="text-center mb-6">
          <div className="bg-blue-100 dark:bg-blue-900/30 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
            <Share2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Partager l'application</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Scannez ce code QR pour ouvrir l'application sur un autre appareil.</p>
        </div>

        <div className="flex justify-center mb-6 bg-white p-4 rounded-xl">
          <QRCodeSVG value={shareUrl} size={200} />
        </div>

        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          <input 
            type="text" 
            readOnly 
            value={shareUrl} 
            className="bg-transparent flex-1 outline-none text-sm text-gray-700 dark:text-gray-300"
          />
          <button 
            onClick={handleCopy}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
