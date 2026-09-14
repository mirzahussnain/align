'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { WorkflowNode } from '@/shared/components/ui/WorkflowNode';
import { LaptopMockup } from '@/shared/components/ui/LaptopMockup';
import { WORKFLOW_NODES, WORKFLOW_PATHS, WORKFLOW_PULSES } from '@/shared/constants/workflow';

export default function WorkflowSection() {
  return (
    <section
      id="how-it-works"
      className="relative bg-slate-50 -mt-16 pt-28 pb-32 px-4 sm:px-6 lg:px-8 overflow-hidden scroll-mt-24"
    >
      {/* Clean Web3 Faint Grid Background */}
      <div className="absolute inset-0 bg-flow-grid pointer-events-none opacity-40" />

      <div className="relative max-w-6xl mx-auto">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto z-20 relative"
        >
          <h2 className="text-[2.5rem] sm:text-5xl md:text-[3.5rem] font-medium text-slate-800 tracking-[-0.03em] leading-[1.1] mt-4">
            A clear entry point to <span className="text-slate-500">UK-ready CVs</span>, role matching, and visa insights
          </h2>
          <p className="text-[15px] md:text-[16px] text-slate-500 leading-relaxed mt-6 max-w-2xl mx-auto font-medium">
            Align turns your resume into a living profile, scoring ATS readiness, surfacing
            sponsor-friendly roles, and revealing the fastest path to placement.
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/analyze"
              className="px-6 py-2.5 rounded-full bg-slate-900 text-white text-[13px] font-semibold tracking-wide shadow-xl shadow-slate-900/10 hover:bg-black hover:scale-[1.02] transition-all"
            >
              View Sample Report
            </Link>
            <span className="px-5 py-2.5 rounded-full border border-slate-200/80 text-[12px] font-semibold text-slate-500 bg-white/60 backdrop-blur-sm">
              3-minute CV audit
            </span>
          </div>
        </motion.div>

        {/* Workflow Diagram & Laptop Mockup Area */}
        <div className="relative mt-24 w-full max-w-[1200px] mx-auto h-[600px] lg:h-auto lg:aspect-[12/8] flex items-center justify-center">
          {/* Extended 45-deg SVG Lines to frame the wider laptop and reach edges */}
          <svg className="absolute inset-0 w-full h-full hidden lg:block pointer-events-none z-0 overflow-visible" viewBox="0 0 1200 800" fill="none" xmlns="http://www.w3.org/2000/svg">
            
            {/* Render Connecting Paths */}
            {WORKFLOW_PATHS.map((path) => (
              <React.Fragment key={path.id}>
                <path id={path.id} d={path.d} stroke="#e2e8f0" strokeWidth="2" />
                {path.joints.map((joint, idx) => (
                  <circle key={`${path.id}-joint-${idx}`} cx={joint.cx} cy={joint.cy} r="3" fill="#cbd5e1" />
                ))}
              </React.Fragment>
            ))}

            {/* Clean Cyan Data Flow Pulses */}
            {WORKFLOW_PULSES.map((pulse, idx) => (
              <circle key={`pulse-${idx}`} r="4" fill="#38bdf8" filter="drop-shadow(0 0 6px #38bdf8)">
                <animateMotion dur={pulse.dur} begin={pulse.begin} repeatCount="indefinite">
                  <mpath href={pulse.pathId} />
                </animateMotion>
              </circle>
            ))}
          </svg>

          {/* Adjusted Nodes (Mapped dynamically from constants config) */}
          <div className="hidden lg:block">
            {WORKFLOW_NODES.map((node) => (
              <WorkflowNode
                key={node.id}
                left={node.left}
                top={node.top}
                icon={node.icon}
                label={node.label}
              />
            ))}
          </div>

          {/* Laptop UI Component */}
          <LaptopMockup />
        </div>
      </div>
    </section>
  );
}
