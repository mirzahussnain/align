'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Square, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface Props {
  missingSkills: string[];
  contextData: Record<string, string>;
  onChange: (data: Record<string, string>) => void;
}

export default function SkillsBridgeStep({ missingSkills, contextData, onChange }: Props) {
  const [activeSkill, setActiveSkill] = useState<string | null>(null);

  const handleToggleSkill = (skill: string) => {
    const newData = { ...contextData };
    if (newData[skill] !== undefined) {
      delete newData[skill];
      if (activeSkill === skill) setActiveSkill(null);
    } else {
      newData[skill] = '';
      setActiveSkill(skill);
    }
    onChange(newData);
  };

  const handleTextChange = (skill: string, text: string) => {
    onChange({ ...contextData, [skill]: text });
  };

  if (missingSkills.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-2">No missing skills detected!</h3>
        <p className="text-slate-500">Your CV perfectly covers all mandatory requirements.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <div className="flex items-start gap-3 mb-2">
          <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5">
            <AlertCircle size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Fill in the Gaps</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              The AI noticed these mandatory skills are missing from your CV. 
              If you actually have experience with them, select them below and tell us where you used them. We&apos;ll seamlessly weave it into your rewritten CV.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {missingSkills.map((skill) => {
          const isSelected = contextData[skill] !== undefined;
          
          return (
            <div 
              key={skill} 
              className={cn(
                "rounded-xl border transition-all duration-200 overflow-hidden",
                isSelected ? "border-accent-cyan bg-sky-50/30" : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <div 
                onClick={() => handleToggleSkill(skill)}
                className="flex items-center gap-3 p-4 cursor-pointer"
              >
                <div className={cn("shrink-0", isSelected ? "text-accent-cyan" : "text-slate-300")}>
                  {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                </div>
                <span className={cn("font-medium select-none", isSelected ? "text-slate-900" : "text-slate-600")}>
                  {skill}
                </span>
              </div>

              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-1">
                      <div className="relative">
                        <textarea
                          autoFocus={activeSkill === skill}
                          value={contextData[skill]}
                          onChange={(e) => handleTextChange(skill, e.target.value)}
                          placeholder="E.g., I used this extensively at TechCorp to build microservices, or in a personal project..."
                          className="w-full min-h-[80px] p-3 text-sm bg-white border border-sky-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-cyan/20 focus:border-accent-cyan resize-none placeholder-slate-400 text-slate-700"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
