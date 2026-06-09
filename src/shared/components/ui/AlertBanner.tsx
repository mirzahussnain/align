import { ReactNode } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface AlertBannerProps {
  type?: 'warning' | 'error' | 'info' | 'success';
  title: string;
  children: ReactNode;
  className?: string;
}

export default function AlertBanner({ type = 'warning', title, children, className }: AlertBannerProps) {
  const getStyles = () => {
    switch (type) {
      case 'warning':
        return {
          wrapper: "bg-amber-50 border-amber-200",
          icon: "text-amber-500",
          title: "text-amber-900",
          text: "text-amber-800"
        };
      case 'error':
        return {
          wrapper: "bg-rose-50 border-rose-200",
          icon: "text-rose-500",
          title: "text-rose-900",
          text: "text-rose-800"
        };
      case 'success':
        return {
          wrapper: "bg-emerald-50 border-emerald-200",
          icon: "text-emerald-500",
          title: "text-emerald-900",
          text: "text-emerald-800"
        };
      case 'info':
      default:
        return {
          wrapper: "bg-blue-50 border-blue-200",
          icon: "text-blue-500",
          title: "text-blue-900",
          text: "text-blue-800"
        };
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'warning': return <AlertTriangle size={20} />;
      case 'error': return <AlertCircle size={20} />;
      case 'success': return <CheckCircle2 size={20} />;
      case 'info': return <Info size={20} />;
    }
  };

  const styles = getStyles();

  return (
    <div className={cn("w-full border rounded-2xl p-4 flex items-start gap-3 shadow-sm", styles.wrapper, className)}>
      <div className={cn("mt-0.5", styles.icon)}>
        {getIcon()}
      </div>
      <div>
        <h4 className={cn("text-sm font-bold", styles.title)}>{title}</h4>
        <div className={cn("text-xs mt-1 leading-relaxed", styles.text)}>
          {children}
        </div>
      </div>
    </div>
  );
}
