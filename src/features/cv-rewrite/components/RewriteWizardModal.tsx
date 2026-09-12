'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import Button from '@/shared/components/ui/Button';

// Steps
import TemplateSelectionStep from './steps/TemplateSelectionStep';
import AtsOptimizationStep from './steps/AtsOptimizationStep';
import SkillsBridgeStep from './steps/SkillsBridgeStep';
import FormatSelectionStep from './steps/FormatSelectionStep';
import RewriteLoadingStep from './steps/RewriteLoadingStep';
import SuccessStep from './steps/SuccessStep';
import { triggerBrowserDownload } from '../utils/download';
import { DEFAULT_TEMPLATE_ID, type TemplateId } from '@/shared/constants/templates';

interface RewriteWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * The persisted analysis this rewrite rebuilds from. Everything the rewrite
   * needs — CV text, job description, ATS findings — is re-read server-side from
   * this row, so no CV/JD/feedback text is sent from the client any more.
   * Absent only when the analysis has not finished persisting.
   */
  analysisId?: string;
  /** Missing canonical mandatory requirements shown in the HITL step. */
  missingSkills: string[];
}

export type RewriteStep = 'template' | 'ats_opt_in' | 'skills_bridge' | 'format' | 'loading' | 'success';
export type ExportFormat = 'docx' | 'pdf';

export default function RewriteWizardModal({
  isOpen,
  onClose,
  analysisId,
  missingSkills,
}: RewriteWizardModalProps) {
  const [currentStep, setCurrentStep] = useState<RewriteStep>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('docx');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hitlContext, setHitlContext] = useState<Record<string, string>>({});
  const [includeAtsOptimization, setIncludeAtsOptimization] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleNextFromTemplate = () => {
    setCurrentStep('ats_opt_in');
  };

  const handleNextFromAts = () => {
    if (missingSkills.length > 0) {
      setCurrentStep('skills_bridge');
    } else {
      setCurrentStep('format');
    }
  };

  const handleRewriteSubmit = async () => {
    // The rewrite is rebuilt entirely from the persisted analysis, so without
    // its id there is nothing to rebuild from — fail before the loading state
    // rather than firing a request the server would reject.
    if (!analysisId) {
      setError("This analysis hasn't finished saving yet. Please try again in a moment.");
      setCurrentStep('template');
      return;
    }

    setCurrentStep('loading');
    setError(null);
    try {
      // Only the analysis id and the user's choices cross the wire. The server
      // re-reads the CV text, job description and ATS findings from the stored
      // analysis, so none of that is client-supplied any more.
      const response = await fetch('/api/cv/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId,
          templateId: selectedTemplate,
          hitlContext,
          includeAtsOptimization,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to rewrite CV');
      }

      // The endpoint always returns a DOCX; trigger the download and keep the
      // object URL for the success screen's manual re-download link.
      const blob = await response.blob();
      const url = triggerBrowserDownload(blob, 'Tailored_CV.docx');
      setDownloadUrl(url);

      setCurrentStep('success');
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setCurrentStep('template'); // Push back to start on error
    }
  };

  const resetWizard = () => {
    setCurrentStep('template');
    setSelectedTemplate(DEFAULT_TEMPLATE_ID);
    setSelectedFormat('docx');
    setDownloadUrl(null);
    setError(null);
    setHitlContext({});
    setIncludeAtsOptimization(true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-primary/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-3xl bg-bg-secondary rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-xl font-bold text-text-primary">
            {currentStep === 'template' && 'Step 1: Select Template'}
            {currentStep === 'format' && 'Step 2: Export Options'}
            {currentStep === 'loading' && 'Generating Tailored CV...'}
            {currentStep === 'success' && 'CV Generation Complete'}
          </h2>
          <button 
            onClick={resetWizard}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-full transition-colors"
            disabled={currentStep === 'loading'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Dynamic Body */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          <AnimatePresence mode="wait">
            {currentStep === 'template' && (
              <motion.div key="template" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
                <TemplateSelectionStep selected={selectedTemplate} onSelect={setSelectedTemplate} />
              </motion.div>
            )}

            {currentStep === 'ats_opt_in' && (
              <motion.div key="ats_opt_in" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <AtsOptimizationStep 
                  includeAtsOptimization={includeAtsOptimization}
                  onSelect={setIncludeAtsOptimization}
                />
              </motion.div>
            )}

            {currentStep === 'skills_bridge' && (
              <motion.div key="skills_bridge" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <SkillsBridgeStep 
                  missingSkills={missingSkills}
                  contextData={hitlContext}
                  onChange={setHitlContext}
                />
              </motion.div>
            )}

            {currentStep === 'format' && (
              <motion.div key="format" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <FormatSelectionStep selected={selectedFormat} onSelect={setSelectedFormat} />
              </motion.div>
            )}

            {currentStep === 'loading' && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <RewriteLoadingStep />
              </motion.div>
            )}

            {currentStep === 'success' && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <SuccessStep downloadUrl={downloadUrl} format={selectedFormat} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        {currentStep !== 'loading' && currentStep !== 'success' && (
          <div className="px-6 py-4 border-t border-border-subtle bg-bg-tertiary flex justify-between items-center">
            {currentStep === 'format' ? (
              <Button variant="outline" onClick={() => setCurrentStep('template')}>Back</Button>
            ) : (
              <div></div> // spacer
            )}

            {currentStep === 'template' && (
              <Button onClick={handleNextFromTemplate}>Next Step</Button>
            )}

            {currentStep === 'ats_opt_in' && (
              <Button onClick={handleNextFromAts}>Next Step</Button>
            )}

            {currentStep === 'skills_bridge' && (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setCurrentStep('format')}>Skip</Button>
                <Button onClick={() => setCurrentStep('format')}>Next Step</Button>
              </div>
            )}

            {currentStep === 'format' && (
              <Button onClick={handleRewriteSubmit} className="bg-slate-900 hover:bg-slate-800">
                Start AI Rewrite
              </Button>
            )}
          </div>
        )}

        {currentStep === 'success' && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
            <Button variant="outline" onClick={resetWizard}>Close</Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
