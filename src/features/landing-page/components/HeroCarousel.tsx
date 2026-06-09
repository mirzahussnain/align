'use client';

import React from 'react';
import HeroCard from './HeroCard';
import { HERO_CAROUSEL_CARDS, HERO_PATH_LABELS, HERO_VERTICAL_LINES } from '@/shared/constants/hero-carousel';
import { cn } from '@/shared/utils/cn';
import { motion } from 'framer-motion';

export default function HeroCarousel() {
  return (
    <div className="relative w-full max-w-5xl mx-auto h-[340px] flex items-center justify-center select-none z-10">

      {/* Curved Path Behind Cards */}
      <svg
        className="absolute w-[2000px] h-[110px] pointer-events-none z-0 opacity-55 top-[0%] left-1/2 -translate-x-1/2"
        viewBox="0 0 1080 160"
        fill="none"
      >
        <path d="M 26 85 C 146 52, 344 16, 580 16 C 786 16, 984 52, 1054 85" stroke="white" strokeWidth="0.95" strokeDasharray="3 3" />
      </svg>

      {/* 3D Carousel Viewport */}
      <div className="relative w-full h-[340px] flex justify-center items-center [perspective:900px] [transform-style:preserve-3d]">
        {/* 3D Vertical Partition Lines */}
        {HERO_VERTICAL_LINES.map((line, idx) => (
          <div
            key={`line-${idx}`}
            style={{
              transform: line.transform,
              transformOrigin: 'top center'
            }}
            className="absolute left-1/2 top-1/2 w-[1px] h-[240px] bg-gradient-to-b from-white/35 to-white/0 pointer-events-none z-10"
          />
        ))}

        {/* 3D Mapped Curved Path Labels */}
        {HERO_PATH_LABELS.map((label, idx) => (
          <span
            key={idx}
            style={{
              transform: label.transform,
              transformOrigin: 'bottom center'
            }}
            className={cn(
              "absolute left-1/2 top-1/2 text-[11px] font-black tracking-widest uppercase pointer-events-none transition-all duration-300 z-40 text-center whitespace-nowrap",
              label.isCenter ? "text-white" : "text-white/60"
            )}
          >
            {label.text}
          </span>
        ))}

        {/* 3D Mapped Carousel Cards */}
        {HERO_CAROUSEL_CARDS.map((card) => (
          <motion.div
            key={card.type}
            initial={{ 
              transform: card.transform, 
              opacity: card.opacity, 
              filter: card.filter, 
              zIndex: card.zIndex 
            }}
            whileHover={{ 
              transform: card.hoverTransform,
              filter: 'none',
              zIndex: 60,
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5)'
            }}
            transition={{ duration: 0.5, ease: [0.25, 0.8, 0.25, 1] }}
            className="absolute left-1/2 top-[45%] pointer-events-auto [transform-style:preserve-3d] [backface-visibility:hidden]"
          >
            <HeroCard type={card.type} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
