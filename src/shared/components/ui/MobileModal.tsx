import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import Button from '@/shared/components/ui/Button';

export interface MobileModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function MobileModal({ isOpen, onClose, title, children, footer }: MobileModalProps) {
  // Prevent body scroll when open on mobile
  useEffect(() => {
    // Only lock scroll on mobile screens (less than 768px for Tailwind md breakpoint)
    if (isOpen && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <div className={cn(
      "fixed inset-0 z-50 bg-white p-5 overflow-y-auto transition-transform duration-300 ease-in-out flex flex-col",
      isOpen ? "translate-y-0" : "translate-y-full",
      "md:relative md:inset-auto md:z-auto md:bg-transparent md:p-0 md:translate-y-0 md:overflow-visible md:block md:!overflow-y-visible"
    )}>
      {/* Mobile Modal Header */}
      <div className="flex justify-between items-center mb-6 md:hidden">
        <h3 className="text-xl font-bold text-text-primary">{title}</h3>
        <Button 
          type="button" 
          variant="ghost"
          size="icon"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>

      <div className="flex-1 md:flex-none">
        {children}
      </div>
      
      {/* Mobile Modal Footer */}
      {footer && (
        <div className="mt-8 pt-4 border-t border-border-subtle md:hidden">
          {footer}
        </div>
      )}
    </div>
  );
}
