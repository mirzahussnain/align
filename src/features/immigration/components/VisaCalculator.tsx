import { useState } from 'react';
import { Calculator, Info, PoundSterling } from 'lucide-react';

import { cn } from '@/shared/utils/cn';

interface VisaCalculatorProps {
  className?: string;
}

export default function VisaCalculator({ className }: VisaCalculatorProps = {}) {
  const [visaType, setVisaType] = useState<string>('Skilled Worker');
  const [years, setYears] = useState<number>(3);
  
  const handleVisaChange = (newType: string) => {
    setVisaType(newType);
    if (newType === 'Graduate') setYears(2);
    else if (newType === 'Innovator Founder') setYears(3);
    else setYears(3);
  };

  let appFee = 0;
  let ihsFee = 0;
  let maintenance = 0;
  let availableYears = [1, 2, 3, 4, 5];

  switch (visaType) {
    case 'Skilled Worker':
      appFee = years <= 3 ? 719 : 1420;
      ihsFee = 1035 * years;
      maintenance = 1270;
      break;
    case 'Graduate':
      appFee = 822;
      ihsFee = 1035 * years;
      maintenance = 0;
      availableYears = [2, 3];
      break;
    case 'Global Talent':
      appFee = 716;
      ihsFee = 1035 * years;
      maintenance = 0;
      break;
    case 'Innovator Founder':
      appFee = 1191;
      ihsFee = 1035 * years;
      maintenance = 1270;
      availableYears = [3];
      break;
  }
  
  const total = appFee + ihsFee + maintenance;

  return (
    <div className={cn("space-y-4 w-full", className)}>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-600 mb-2">Visa Route</label>
          <select 
            value={visaType} 
            onChange={(e) => handleVisaChange(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 outline-none"
          >
            <option value="Skilled Worker">Skilled Worker Visa</option>
            <option value="Graduate">Graduate Route</option>
            <option value="Global Talent">Global Talent Visa</option>
            <option value="Innovator Founder">Innovator Founder Visa</option>
          </select>
        </div>
        
        <div className="sm:w-1/3">
          <label className="block text-xs font-bold text-slate-600 mb-2">Duration</label>
          <select 
            value={years} 
            onChange={(e) => setYears(Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 outline-none"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>{y} Year{y > 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>
      </div>

        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center text-sm group relative">
            <span className="text-slate-600 flex items-center gap-1 cursor-help">
              Application Fee <Info size={12} className="text-slate-400"/>
            </span>
            <span className="font-bold text-slate-800">£{appFee.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-sm group relative">
            <span className="text-slate-600 flex items-center gap-1 cursor-help">
              IHS Surcharge <Info size={12} className="text-slate-400"/>
            </span>
            <span className="font-bold text-slate-800">£{ihsFee.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-sm group relative">
            <span className="text-slate-600 flex items-center gap-1 cursor-help">
              Maintenance <Info size={12} className="text-slate-400"/>
            </span>
            <span className="font-bold text-slate-800">£{maintenance.toLocaleString()}</span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estimated Total</span>
          <span className="text-2xl font-black text-accent-purple flex items-center">
            <PoundSterling size={20} strokeWidth={3} className="mr-0.5" />
            {total.toLocaleString()}
          </span>
        </div>
      <p className="text-[10px] text-slate-400 text-center leading-tight mt-4">
        Costs are estimates for out-of-UK applicants. Maintenance is only required if not certified by sponsor.
      </p>
    </div>
  );
}
