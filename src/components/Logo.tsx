import React from 'react';

interface LogoProps {
  className?: string;
  id?: string;
  variant?: 'mark' | 'full';
  showText?: boolean;
}

export function Logo({ className = "w-9 h-9", id, showText = false }: LogoProps) {
  return (
    <div id={id} className={`inline-flex items-center gap-2.5 ${showText ? '' : 'shrink-0'}`}>
      <div 
        className={`relative rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 text-white p-2 flex items-center justify-center shadow-md shadow-blue-500/20 ring-1 ring-white/20 overflow-hidden ${className}`}
        style={{ aspectRatio: '1/1' }}
      >
        {/* Subtle architectural grid pattern in background */}
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:6px_6px]" />

        {/* High-Precision Architectural SVG */}
        <svg 
          viewBox="0 0 64 64" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full text-white relative z-10 transition-transform duration-300 hover:scale-105"
        >
          <defs>
            <linearGradient id="immoTowerGrad" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
              <stop stopColor="#60A5FA" />
              <stop offset="0.5" stopColor="#3B82F6" />
              <stop offset="1" stopColor="#1D4ED8" />
            </linearGradient>
            <linearGradient id="immoGoldAccent" x1="20" y1="12" x2="44" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FCD34D" />
              <stop offset="1" stopColor="#F59E0B" />
            </linearGradient>
            <filter id="glow" x="-4" y="-4" width="72" height="72" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1E3A8A" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Architectural Ground / Foundation Line */}
          <path 
            d="M8 54H56" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeOpacity="0.8"
          />

          {/* Main Central High-Rise Tower with Chamfered Modern Roof */}
          <path 
            d="M26 14L38 8V54H26V14Z" 
            fill="url(#immoTowerGrad)" 
            stroke="#93C5FD" 
            strokeWidth="1.8" 
            strokeLinejoin="round"
          />

          {/* Left Wing - Stepped Architecture */}
          <path 
            d="M14 26L26 20V54H14V26Z" 
            fill="#1E40AF" 
            fillOpacity="0.85" 
            stroke="#60A5FA" 
            strokeWidth="1.6" 
            strokeLinejoin="round"
          />

          {/* Right Wing - Modern Residential Block */}
          <path 
            d="M38 22L50 28V54H38V22Z" 
            fill="#1E3A8A" 
            fillOpacity="0.9" 
            stroke="#93C5FD" 
            strokeWidth="1.6" 
            strokeLinejoin="round"
          />

          {/* Architectural Fenestration / Window Grid Pattern (Central Tower) */}
          <line x1="30" y1="20" x2="34" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.9" />
          <line x1="30" y1="26" x2="34" y2="26" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.9" />
          <line x1="30" y1="32" x2="34" y2="32" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.9" />
          <line x1="30" y1="38" x2="34" y2="38" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.9" />
          <line x1="30" y1="44" x2="34" y2="44" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.9" />

          {/* Left Wing Windows */}
          <line x1="18" y1="32" x2="22" y2="32" stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="18" y1="38" x2="22" y2="38" stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="18" y1="44" x2="22" y2="44" stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round" />

          {/* Right Wing Windows */}
          <line x1="42" y1="34" x2="46" y2="34" stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="42" y1="40" x2="46" y2="40" stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="42" y1="46" x2="46" y2="46" stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round" />

          {/* Modern Architectural Spire / Mast */}
          <line x1="38" y1="8" x2="38" y2="3" stroke="url(#immoGoldAccent)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="38" cy="3" r="1.5" fill="#FCD34D" />

          {/* Architectural Entrance Portal / Portico */}
          <path 
            d="M29 54V48C29 46.8954 29.8954 46 31 46H33C34.1046 46 35 46.8954 35 48V54" 
            stroke="url(#immoGoldAccent)" 
            strokeWidth="2" 
            strokeLinecap="round" 
            fill="#0F172A"
          />

          {/* Kinshasa Sunshine / Precision Arc (Architect's Compass Accent) */}
          <path 
            d="M12 18C18 12 28 8 36 8" 
            stroke="url(#immoGoldAccent)" 
            strokeWidth="1.5" 
            strokeDasharray="2 2" 
            strokeOpacity="0.7"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <span className="font-black text-sm tracking-tight text-gray-900 dark:text-white leading-none">
            ImmoGest
          </span>
          <span className="text-[10px] font-extrabold tracking-wider uppercase text-blue-600 dark:text-blue-400">
            Kinshasa
          </span>
        </div>
      )}
    </div>
  );
}
