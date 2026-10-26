'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type AvatarIconVariant = 'cyan-blue' | 'purple-magenta' | 'coral-orange' | 'emerald-teal';

interface AvatarGradientIconProps extends React.HTMLAttributes<HTMLDivElement> {
  variant: AvatarIconVariant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
};

export function AvatarGradientIcon({
  variant,
  size = 'lg',
  className,
  ...props
}: AvatarGradientIconProps) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.lg;

  if (variant === 'cyan-blue') {
    return (
      <div
        className={cn(
          'relative shrink-0 overflow-hidden rounded-[24px] shadow-lg transition-transform duration-300',
          sizeClass,
          className
        )}
        style={{
          background: 'radial-gradient(circle at 45% 45%, #38bdf8 0%, #6366f1 55%, #bae6fd 100%)',
          boxShadow: '0 8px 24px -6px rgba(56, 189, 248, 0.4)',
        }}
        {...props}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/30 via-transparent to-white/40 pointer-events-none" />
      </div>
    );
  }

  if (variant === 'purple-magenta') {
    return (
      <div
        className={cn(
          'relative shrink-0 overflow-hidden rounded-[18px] shadow-lg transition-transform duration-300',
          sizeClass,
          className
        )}
        style={{
          background: 'radial-gradient(circle at 50% 50%, #e879f9 0%, #9333ea 60%, #f472b6 100%)',
          boxShadow: '0 8px 24px -6px rgba(232, 121, 249, 0.4)',
        }}
        {...props}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-purple-800/30 via-transparent to-white/40 pointer-events-none" />
      </div>
    );
  }

  if (variant === 'coral-orange') {
    return (
      <div
        className={cn(
          'relative shrink-0 overflow-hidden rounded-full shadow-lg transition-transform duration-300',
          sizeClass,
          className
        )}
        style={{
          background: 'radial-gradient(circle at 45% 45%, #f97316 0%, #ef4444 60%, #fca5a5 100%)',
          boxShadow: '0 8px 24px -6px rgba(249, 115, 22, 0.4)',
        }}
        {...props}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-red-600/30 via-transparent to-white/40 pointer-events-none" />
      </div>
    );
  }

  // emerald-teal with active status dot badge
  return (
    <div className="relative inline-block shrink-0">
      <div
        className={cn(
          'relative shrink-0 overflow-hidden rounded-full shadow-lg transition-transform duration-300',
          sizeClass,
          className
        )}
        style={{
          background: 'radial-gradient(circle at 40% 45%, #34d399 0%, #0284c7 65%, #a7f3d0 100%)',
          boxShadow: '0 8px 24px -6px rgba(52, 211, 153, 0.4)',
        }}
        {...props}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-teal-700/30 via-transparent to-white/40 pointer-events-none" />
      </div>
      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#10b981] border-2 border-background shadow-sm" />
    </div>
  );
}
