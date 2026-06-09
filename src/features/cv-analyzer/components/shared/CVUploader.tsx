'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import AnalysisProgress from './AnalysisProgress';
import { formatFileSize } from '@/shared/utils/file';

interface CVUploaderProps {
  mode?: 'ats' | 'job_match';
  onAnalysisComplete: (result: unknown) => void;
}

export default function CVUploader({ mode = 'ats', onAnalysisComplete }: CVUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      if (f.size > 10 * 1024 * 1024) {
        setError('File too large. Maximum size is 10MB.');
        return;
      }
      setFile(f);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    multiple: false,
  });

  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);
      if (mode === 'job_match') {
        if (!jobDescription.trim()) {
          throw new Error('Please provide a Job Description to match against.');
        }
        formData.append('jobDescription', jobDescription);
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Analysis failed');
      }

      const result = await response.json();
      onAnalysisComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
  };


  return (
    <div className="w-full mx-auto max-w-2xl">
      <AnimatePresence mode="wait">
        {isAnalyzing ? (
          <motion.div
            key="analyzing-progress"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <AnalysisProgress isAnalyzing={isAnalyzing} />
          </motion.div>
        ) : (
          <motion.div
            key="input-view"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-6 transition-all w-full"
          >
            {/* Left Column: Job Description (Only visible in job_match mode) */}
            {mode === 'job_match' && (
              <div className="flex flex-col">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col min-h-[160px]">
                  <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                    <FileText size={16} className="text-accent-purple" />
                    Target Job Description
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">Paste the full job description here to tailor your analysis.</p>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="e.g. We are looking for a Senior Frontend Engineer with React and TypeScript experience..."
                    className="flex-1 w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-accent-purple/50 focus:ring-2 focus:ring-accent-purple/20 resize-none"
                  />
                </div>
              </div>
            )}

            {/* Right Column: File Dropzone or Preview */}
            <div className="flex flex-col justify-center">
              {!file ? (
                <div
                  {...getRootProps()}
                  className={cn(
                    'w-full min-h-[200px] flex flex-col items-center justify-center relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 group bg-white',
                    isDragActive
                      ? 'border-accent-purple bg-purple-50/50 scale-[1.02]'
                      : 'border-slate-300 hover:border-accent-purple/50 hover:bg-slate-50'
                  )}
                >
                  <input {...getInputProps()} />

                  <div className="flex flex-col items-center gap-4">
                    <div className={cn(
                      'w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300',
                      isDragActive
                        ? 'bg-accent-purple/20 scale-110'
                        : 'bg-slate-100 group-hover:bg-accent-purple/10'
                    )}>
                      <Upload
                        size={28}
                        className={cn(
                          'transition-colors duration-300',
                          isDragActive ? 'text-accent-purple' : 'text-slate-400 group-hover:text-accent-purple'
                        )}
                      />
                    </div>

                    <div>
                      <p className="text-lg font-semibold text-slate-800 mb-1">
                        {isDragActive ? 'Drop your CV here' : 'Upload your CV'}
                      </p>
                      <p className="text-sm text-slate-500">
                        Drag & drop or click to browse • PDF format • Max 10MB
                      </p>
                    </div>
                  </div>

                  {isDragActive && (
                    <div className="absolute inset-0 rounded-2xl border-2 border-accent-purple animate-pulse pointer-events-none" />
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-center min-h-[200px]">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-14 h-14 rounded-xl bg-accent-purple/10 flex items-center justify-center flex-shrink-0">
                      <FileText size={26} className="text-accent-purple" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-slate-800 truncate">{file.name}</p>
                      <p className="text-sm text-slate-500">{formatFileSize(file.size)} • PDF</p>
                    </div>
                    <button
                      onClick={removeFile}
                      className="p-2.5 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors"
                      disabled={isAnalyzing}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {error && (
                    <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || (mode === 'job_match' && !jobDescription.trim())}
                    className={cn(
                      'w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-300',
                      (isAnalyzing || (mode === 'job_match' && !jobDescription.trim()))
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-accent-purple text-white hover:bg-purple-700 hover:shadow-lg hover:shadow-purple-500/30 hover:scale-[1.02] active:scale-[0.98]'
                    )}
                  >
                    <Sparkles size={20} />
                    {mode === 'job_match' ? 'Run Job Match Analysis' : 'Analyze CV'}
                  </button>

                  <p className="text-xs text-slate-500 text-center mt-4">
                    {mode === 'job_match' 
                      ? 'Your CV will be explicitly scored against the requirements in the provided Job Description.'
                      : 'Your CV will be analyzed against UK tech market ATS standards, keyword coverage, and formatting rules.'}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
