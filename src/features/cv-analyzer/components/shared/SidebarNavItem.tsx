import { cn } from '@/shared/utils/cn';
import { Crown, Check, X, AlertCircle, Info } from 'lucide-react';
import React from 'react';

export interface SidebarNavItemProps {
  label: string;
  status: 'success' | 'error' | 'warning' | 'info' | 'premium';
  isActive: boolean;
  badgeText?: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

export function SidebarNavItem({ label, status, isActive, badgeText, onClick, icon }: SidebarNavItemProps) {
  const isPremium = status === 'premium';

  // Get status icon on the left
  const renderIcon = () => {
    if (icon) {
      // If custom icon is provided, wrap it in the appropriate status color styling
      const getBgClass = () => {
        switch (status) {
          case 'premium': return 'text-amber-500 bg-amber-50 border-amber-100/60 shadow-amber-100/20';
          case 'success': return 'text-emerald-500 bg-emerald-50 border-emerald-100/60 shadow-emerald-100/20';
          case 'error': return 'text-rose-500 bg-rose-50 border-rose-100/60 shadow-rose-100/20';
          case 'warning': return 'text-amber-500 bg-amber-50 border-amber-100/60 shadow-amber-100/20';
          case 'info': return 'text-blue-500 bg-blue-50 border-blue-100/60 shadow-blue-100/20';
        }
      };
      
      return (
        <div className={cn("w-5 h-5 flex items-center justify-center rounded-lg flex-shrink-0 border shadow-sm", getBgClass())}>
          {icon}
        </div>
      );
    }

    // Default icons
    switch (status) {
      case 'premium':
        return (
          <div className="w-5 h-5 flex items-center justify-center text-amber-500 bg-amber-50 rounded-lg flex-shrink-0 border border-amber-100/60 shadow-sm shadow-amber-100/20">
            <Crown size={12} className="fill-amber-500 text-amber-500" />
          </div>
        );
      case 'success':
        return (
          <div className="w-5 h-5 flex items-center justify-center text-emerald-500 bg-emerald-50 rounded-lg flex-shrink-0 border border-emerald-100/60 shadow-sm shadow-emerald-100/20">
            <Check size={12} strokeWidth={3} className="text-emerald-500" />
          </div>
        );
      case 'error':
        return (
          <div className="w-5 h-5 flex items-center justify-center text-rose-500 bg-rose-50 rounded-lg flex-shrink-0 border border-rose-100/60 shadow-sm shadow-rose-100/20">
            <X size={12} strokeWidth={3} className="text-rose-500" />
          </div>
        );
      case 'warning':
        return (
          <div className="w-5 h-5 flex items-center justify-center text-amber-500 bg-amber-50 rounded-lg flex-shrink-0 border border-amber-100/60 shadow-sm shadow-amber-100/20">
            <AlertCircle size={12} strokeWidth={2.5} className="text-amber-500" />
          </div>
        );
      case 'info':
        return (
          <div className="w-5 h-5 flex items-center justify-center text-blue-500 bg-blue-50 rounded-lg flex-shrink-0 border border-blue-100/60 shadow-sm shadow-blue-100/20">
            <Info size={12} strokeWidth={2.5} className="text-blue-500" />
          </div>
        );
    }
  };

  // Get badge style on the right
  const getBadgeClass = () => {
    switch (status) {
      case 'premium':
        return "bg-slate-50 border border-slate-200/60 text-slate-400 font-semibold";
      case 'success':
        return "bg-emerald-50 border border-emerald-100/60 text-emerald-750 font-extrabold";
      case 'error':
        return "bg-rose-50 border border-rose-100/60 text-rose-600 font-bold";
      case 'warning':
        return "bg-amber-50 border border-amber-100/60 text-amber-600 font-bold";
      case 'info':
        return "bg-blue-50 border border-blue-100/60 text-blue-600 font-bold";
    }
  };

  return (
    <button
      data-active={isActive}
      onClick={() => {
        if (!isPremium) {
          onClick();
        }
      }}
      className={cn(
        "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border text-left relative",
        isPremium ? "opacity-75 cursor-not-allowed animate-none" : "cursor-pointer",
        isActive
          ? "bg-accent-cyan/5 text-accent-cyan border-accent-cyan/10"
          : "text-slate-600 border-transparent hover:bg-slate-50 hover:text-slate-800"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0 z-10">
        {renderIcon()}
        <span className="truncate text-[12px] font-semibold text-slate-700">{label}</span>
      </div>

      <span className={cn(
        "px-2 py-0.5 rounded-full text-[9px] flex-shrink-0 scale-95 shadow-sm border z-10",
        getBadgeClass()
      )}>
        {badgeText}
      </span>
    </button>
  );
}
export default SidebarNavItem;
