import React from 'react';
import { Building2 } from 'lucide-react';

export function Logo({ className = "w-8 h-8", id }: { className?: string, id?: string }) {
  return (
    <div id={id} className={`bg-blue-600 text-white p-2 rounded-xl flex items-center justify-center shrink-0 ${className}`}>
      <Building2 className="w-full h-full" />
    </div>
  );
}
