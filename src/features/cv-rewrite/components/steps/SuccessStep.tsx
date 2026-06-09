'use client';

import { CheckCircle2, Download } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import type { ExportFormat } from '../RewriteWizardModal';

interface Props {
  downloadUrl: string | null;
  format: ExportFormat;
}

export default function SuccessStep({ downloadUrl, format }: Props) {
  if (!downloadUrl) return null;

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-2">
        <CheckCircle2 size={40} />
      </div>

      <div>
        <h3 className="text-2xl font-bold text-slate-800 mb-2">Your CV is Ready!</h3>
        <p className="text-slate-500 max-w-sm mx-auto">
          We've successfully tailored your experience to match the exact requirements of this role. 
          Your download should have started automatically.
        </p>
      </div>

      <div className="pt-6">
        <a href={downloadUrl} download={`Tailored_CV_${format.toUpperCase()}.${format}`}>
          <Button className="bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-2">
            <Download size={18} />
            Download Again
          </Button>
        </a>
      </div>
    </div>
  );
}
