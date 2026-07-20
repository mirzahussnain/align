'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Cpu, FileSearch, Sparkles, LayoutTemplate } from 'lucide-react';

const MESSAGES = [
  { text: "Analyzing Job Description...", icon: FileSearch },
  { text: "Applying STAR Method...", icon: Sparkles },
  { text: "Injecting Target Keywords...", icon: Cpu },
  { text: "Formatting Document...", icon: LayoutTemplate },
];

export default function RewriteLoadingStep() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev < MESSAGES.length - 1 ? prev + 1 : prev));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const CurrentIcon = MESSAGES[index].icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-8">
      <div className="relative">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="w-24 h-24 rounded-full border-t-2 border-r-2 border-accent-purple/30"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="w-24 h-24 rounded-full border-b-2 border-l-2 border-blue-500/30 absolute inset-0"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            key={index}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="text-accent-purple"
          >
            <CurrentIcon size={32} />
          </motion.div>
        </div>
      </div>

      <div>
        <motion.h3
          key={index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-bold text-slate-800 mb-2"
        >
          {MESSAGES[index].text}
        </motion.h3>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">
          Our AI is completely rewriting your experience to perfectly align with this role&apos;s requirements. This usually takes 10-20 seconds.
        </p>
      </div>
    </div>
  );
}
