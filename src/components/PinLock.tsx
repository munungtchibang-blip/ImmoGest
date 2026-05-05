import React, { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { User } from 'firebase/auth';

interface PinLockProps {
  user: User;
  onUnlock: () => void;
}

export function PinLock({ user, onUnlock }: PinLockProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  
  const savedPin = localStorage.getItem('app_pin_' + user.uid);
  const [step, setStep] = useState<'enter' | 'create' | 'confirm'>(savedPin ? 'enter' : 'create');
  
  const [error, setError] = useState('');

  const handleNumberClick = (num: string) => {
    setError('');
    if (step === 'enter') {
      if (pin.length < 4) {
        const newPin = pin + num;
        setPin(newPin);
        if (newPin.length === 4) {
          const savedPin = localStorage.getItem('app_pin_' + user.uid);
          if (newPin === savedPin) {
            onUnlock();
          } else {
            setError('Code incorrect');
            setPin('');
          }
        }
      }
    } else if (step === 'create') {
      if (pin.length < 4) {
        const newPin = pin + num;
        setPin(newPin);
        if (newPin.length === 4) {
          setTimeout(() => setStep('confirm'), 200);
        }
      }
    } else if (step === 'confirm') {
      if (confirmPin.length < 4) {
        const newConfirmPin = confirmPin + num;
        setConfirmPin(newConfirmPin);
        if (newConfirmPin.length === 4) {
          if (newConfirmPin === pin) {
            localStorage.setItem('app_pin_' + user.uid, pin);
            onUnlock();
          } else {
            setError('Les codes ne correspondent pas');
            setPin('');
            setConfirmPin('');
            setStep('create');
          }
        }
      }
    }
  };

  const handleDelete = () => {
    setError('');
    if (step === 'enter' || step === 'create') {
      setPin(pin.slice(0, -1));
    } else if (step === 'confirm') {
      setConfirmPin(confirmPin.slice(0, -1));
    }
  };

  const currentInput = step === 'confirm' ? confirmPin : pin;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-sm w-full text-center space-y-8 transition-colors">
        <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
          <Lock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        </div>
        
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {step === 'enter' && 'Entrez votre code'}
            {step === 'create' && 'Créez un code d\'accès'}
            {step === 'confirm' && 'Confirmez le code'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
            {step === 'enter' && 'Pour sécuriser l\'accès à vos données.'}
            {step === 'create' && 'Ce code à 4 chiffres protégera l\'application sur cet appareil.'}
            {step === 'confirm' && 'Veuillez retaper le code pour confirmer.'}
          </p>
        </div>

        <div className="flex justify-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div 
              key={i} 
              className={`w-4 h-4 rounded-full transition-colors ${
                i < currentInput.length 
                  ? 'bg-blue-600 dark:bg-blue-400' 
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-500 text-sm font-medium flex items-center justify-center gap-1">
            <AlertCircle className="w-4 h-4" /> {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-4 max-w-[240px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num.toString())}
              className="w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-xl font-semibold text-gray-900 dark:text-white transition-colors flex items-center justify-center"
            >
              {num}
            </button>
          ))}
          <div className="w-16 h-16"></div>
          <button
            onClick={() => handleNumberClick('0')}
            className="w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-xl font-semibold text-gray-900 dark:text-white transition-colors flex items-center justify-center"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="w-16 h-16 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors flex items-center justify-center"
          >
            Effacer
          </button>
        </div>
      </div>
    </div>
  );
}
