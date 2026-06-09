'use client';

import { motion } from 'framer-motion';

export default function PageLoader() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-neutral-950 select-none overflow-hidden">
      {/* Background radial glowing flare */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.12)_0%,rgba(15,23,42,0.01)_60%,transparent_100%)] pointer-events-none" />

      <div className="relative flex flex-col items-center gap-8">
        {/* Logo and Halo Wrapper */}
        <div className="relative">
          {/* Animated outer spinning loading ring (perfectly circular halo) */}
          <motion.div
            className="absolute -inset-5 rounded-full border border-white/5 border-t-cyan-400/60 border-r-blue-500/30"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
          />

          {/* Custom SVG logo container with initial fade in */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-28 h-28 flex items-center justify-center"
          >
            {/* Inner breathing animation */}
            <motion.img 
              src="/assets/svgs/logo.svg" 
              alt="Align Logo" 
              className="w-full h-full object-contain"
              animate={{ 
                scale: [0.95, 1.04, 0.95],
                filter: [
                  "drop-shadow(0 0 12px rgba(0, 242, 254, 0.35))",
                  "drop-shadow(0 0 28px rgba(79, 172, 254, 0.7))",
                  "drop-shadow(0 0 12px rgba(0, 242, 254, 0.35))"
                ]
              }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        </div>

        {/* Animated Brand Text and Tagline */}
        <div className="flex flex-col items-center text-center gap-1.5 z-10">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ 
              opacity: 1, 
              y: 0,
              backgroundPosition: ["200% center", "-200% center"]
            }}
            transition={{ 
              opacity: { delay: 0.2, duration: 0.6 },
              y: { delay: 0.2, duration: 0.6 },
              backgroundPosition: { duration: 3, repeat: Infinity, ease: "linear" }
            }}
            className="bg-text-shimmer bg-[length:200%_auto] text-transparent bg-clip-text text-3xl font-black tracking-[0.25em] uppercase pl-[0.25em]"
          >
            Align
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-[10px] text-white/50 tracking-[0.4em] uppercase font-bold pl-[0.4em]"
          >
            UK Tech Career Intelligence
          </motion.p>
        </div>
      </div>
    </div>
  );
}
