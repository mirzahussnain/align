'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, isVisible, onClose, duration = 6000 }: ToastProps) {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-6 right-6 z-50 max-w-md w-full"
        >
          <div className="glass-card p-4 border border-warning/20 bg-bg-secondary/90 shadow-2xl flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-warning/10 text-warning flex-shrink-0 mt-0.5 animate-pulse">
              <Info size={16} />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-primary mb-0.5">API Rate Limit Fallback</p>
              <p className="text-xs text-text-secondary leading-relaxed">{message}</p>
            </div>
            
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
