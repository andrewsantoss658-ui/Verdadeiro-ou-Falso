import React from "react";

export const SiteLogo: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Outer Circle */}
        <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="2" className="text-slate-900 dark:text-white" />
        
        {/* Green Speech Bubble (True) */}
        <path 
          d="M20 50 C20 30 45 30 45 50 C45 60 38 65 35 70 L30 75 L30 65 C20 65 20 60 20 50Z" 
          fill="#10B981" 
        />
        <path d="M28 50 L34 56 L40 44" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Red Speech Bubble (False) */}
        <path 
          d="M80 50 C80 30 55 30 55 50 C55 60 62 65 65 70 L70 75 L70 65 C80 65 80 60 80 50Z" 
          fill="#EF4444" 
        />
        <path d="M62 44 L73 55 M73 44 L62 55" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Question Mark Middle */}
        <text 
          x="50" 
          y="55" 
          textAnchor="middle" 
          fill="currentColor" 
          className="text-slate-900 dark:text-white font-bold text-[24px]"
          fontFamily="system-ui"
        >?</text>
        
        {/* Text Area Bottom */}
        <text 
          x="50" 
          y="85" 
          textAnchor="middle" 
          className="font-bold text-[8px] tracking-tight"
          fill="#10B981"
        >VERDADEIRO</text>
        <text 
          x="50" 
          y="93" 
          textAnchor="middle" 
          className="font-bold text-[6px] tracking-tighter"
          fill="currentColor"
        >— OU —</text>
        <text 
          x="50" 
          y="99" 
          textAnchor="middle" 
          className="font-bold text-[8px] tracking-tight"
          fill="#EF4444"
        >FALSO?</text>
      </svg>
    </div>
  );
};
