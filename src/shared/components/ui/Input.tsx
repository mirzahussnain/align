import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '@/shared/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, containerClassName, ...props }, ref) => {
    return (
      <div className={cn("relative w-full", containerClassName)}>
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full pr-4 py-2.5 bg-bg-tertiary border border-border-subtle rounded-xl text-sm transition-colors focus:outline-none focus:border-accent-purple/50",
            icon ? "!pl-10" : "pl-4",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
