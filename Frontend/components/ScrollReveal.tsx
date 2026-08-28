'use client';

import React from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';

export interface ScrollRevealProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  delay?: number;
  duration?: number;
  blur?: boolean;
  scale?: boolean;
  staggerChildren?: number;
  viewportAmount?: number;
  once?: boolean;
  className?: string;
}

export default function ScrollReveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.7,
  blur = true,
  scale = false,
  staggerChildren = 0,
  viewportAmount = 0.2,
  once = true,
  className = '',
  ...props
}: ScrollRevealProps) {
  const getInitialOffset = () => {
    switch (direction) {
      case 'up':
        return { y: 40, x: 0 };
      case 'down':
        return { y: -40, x: 0 };
      case 'left':
        return { x: 40, y: 0 };
      case 'right':
        return { x: -40, y: 0 };
      default:
        return { x: 0, y: 0 };
    }
  };

  const initialOffset = getInitialOffset();

  return (
    <motion.div
      initial={{
        opacity: 0,
        ...initialOffset,
        scale: scale ? 0.94 : 1,
        filter: blur ? 'blur(10px)' : 'blur(0px)',
      }}
      whileInView={{
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
      }}
      viewport={{ once, amount: viewportAmount }}
      transition={{
        duration,
        delay,
        ease: [0.21, 0.47, 0.32, 0.98],
        staggerChildren,
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
