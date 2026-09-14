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
          wrapper: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50",
          icon: "text-amber-500",
          title: "text-amber-900 dark:text-amber-200",
          text: "text-amber-800 dark:text-amber-300"
        };
      case 'error':
        return {
          wrapper: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50",
          icon: "text-rose-500",
          title: "text-rose-900 dark:text-rose-200",
          text: "text-rose-800 dark:text-rose-300"
        };
      case 'success':
        return {
          wrapper: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50",
          icon: "text-emerald-500",
          title: "text-emerald-900 dark:text-emerald-200",
          text: "text-emerald-800 dark:text-emerald-300"
        };
      case 'info':
      default:
        return {
          wrapper: "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/50",
          icon: "text-sky-500",
          title: "text-sky-900 dark:text-sky-200",
          text: "text-sky-800 dark:text-sky-300"
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
