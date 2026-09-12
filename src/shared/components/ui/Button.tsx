import React from 'react';
import { cn } from '@/shared/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary-primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  shape?: 'capsule' | 'rounded';
  isLoading?: boolean;
  children: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  shape = 'capsule',
  isLoading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-bold transition-all duration-300 transform border select-none cursor-pointer';

  const shapeStyles = {
    capsule: 'rounded-full',
    rounded: 'rounded-xl',
  };

  const variants = {
    primary: 'bg-slate-900 hover:bg-slate-800 text-white border-transparent shadow-sm hover:shadow-md hover:-translate-y-0.5',
    accent: 'bg-accent-cyan hover:bg-accent-cyan/90 text-white border-transparent shadow-[0_0_20px_hsla(var(--accent-cyan),0.35)] hover:-translate-y-0.5',
    'secondary-primary': 'bg-accent-cyan hover:bg-accent-cyan/90 text-white border-transparent shadow-[0_0_20px_hsla(var(--accent-cyan),0.35)] hover:-translate-y-0.5',
    secondary: 'bg-white/10 hover:bg-white/20 text-white border-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:-translate-y-0.5 backdrop-blur-md',
    outline: 'bg-transparent text-text-primary border-border-subtle hover:bg-bg-tertiary hover:border-border-default',
    ghost: 'bg-transparent text-text-secondary border-transparent hover:bg-bg-tertiary hover:text-text-primary',
    danger: 'bg-error hover:bg-error/90 text-white border-transparent hover:shadow-[0_0_20px_hsla(var(--error),0.35)] hover:-translate-y-0.5',
  };

  const sizes = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-3 text-xs sm:text-sm',
    lg: 'px-8 py-4 text-sm sm:text-base',
    icon: 'p-2',
  };

  return (
    <button
      className={cn(
        baseStyles,
        shapeStyles[shape],
        variants[variant],
        sizes[size],
        disabled || isLoading ? 'opacity-50 cursor-not-allowed transform-none hover:shadow-none hover:translate-y-0' : '',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : null}
      {children}
    </button>
  );
}
