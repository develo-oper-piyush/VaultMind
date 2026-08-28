'use client';

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export interface StrokeTextProps {
  text: string;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  drawDuration?: number;
  fillDelay?: number;
  stagger?: number;
  ease?: string;
  trigger?: 'mount' | 'scroll' | 'hover';
  fillMode?: 'wipe' | 'fade' | 'none';
  fontSize?: number;
  fontWeight?: number | string;
  letterSpacing?: number;
  reverse?: boolean;
  className?: string;
}

export default function StrokeText({
  text = 'Intelligent Cloud Storage\nReimagined with AI',
  strokeColor = '#00ff70',
  fillColor = '#ffffff',
  strokeWidth = 1.4,
  drawDuration = 1.6,
  fillDelay = 0.4,
  stagger = 0.075,
  ease = 'power2.out',
  trigger = 'mount',
  fillMode = 'wipe',
  fontSize = 96,
  fontWeight = 800,
  letterSpacing = -3,
  reverse = false,
  className = '',
}: StrokeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textStrokeRef = useRef<SVGTextElement>(null);
  const textFillRef = useRef<SVGTextElement>(null);

  const lines = text.split('\n');
  const isMultiLine = lines.length > 1;

  useEffect(() => {
    if (!textStrokeRef.current || !textFillRef.current || !containerRef.current) return;

    const strokeEl = textStrokeRef.current;
    const fillEl = textFillRef.current;
    const container = containerRef.current;

    let strokeLen = 1500;
    try {
      strokeLen = strokeEl.getComputedTextLength() || 1500;
    } catch {
      strokeLen = 1500;
    }

    gsap.killTweensOf([strokeEl, fillEl]);

    const playAnimation = () => {
      gsap.set(strokeEl, {
        strokeDasharray: strokeLen,
        strokeDashoffset: reverse ? -strokeLen : strokeLen,
      });

      if (fillMode === 'wipe') {
        gsap.set(fillEl, {
          clipPath: 'inset(0 100% 0 0)',
          opacity: 1,
        });
      } else if (fillMode === 'fade') {
        gsap.set(fillEl, {
          opacity: 0,
          clipPath: 'none',
        });
      }

      const tl = gsap.timeline();

      tl.to(strokeEl, {
        strokeDashoffset: 0,
        duration: drawDuration,
        ease: ease,
      });

      if (fillMode === 'wipe') {
        tl.to(
          fillEl,
          {
            clipPath: 'inset(0 0% 0 0)',
            duration: drawDuration * 0.85,
            ease: 'power3.inOut',
          },
          `+=${fillDelay - drawDuration * 0.5}`
        );
      } else if (fillMode === 'fade') {
        tl.to(
          fillEl,
          {
            opacity: 1,
            duration: 0.8,
            ease: 'power2.out',
          },
          `+=${fillDelay - drawDuration * 0.5}`
        );
      }
    };

    if (trigger === 'scroll' && typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              playAnimation();
              observer.disconnect();
            }
          });
        },
        { threshold: 0.15 }
      );
      observer.observe(container);
      return () => observer.disconnect();
    } else {
      playAnimation();
    }
  }, [text, strokeColor, fillColor, drawDuration, fillDelay, ease, fillMode, reverse, trigger]);

  const viewBoxWidth = 1100;
  const viewBoxHeight = isMultiLine ? 230 : 150;

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full max-w-full overflow-visible select-none text-center ${className}`}
    >
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="w-full h-auto overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="strokeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={strokeColor} />
            <stop offset="50%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
          <linearGradient id="textFillGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={fillColor} />
            <stop offset="70%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>

        {/* Outer Stroke Layer */}
        <text
          ref={textStrokeRef}
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fill="none"
          stroke="url(#strokeGradient)"
          strokeWidth={strokeWidth * 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: fontWeight,
            letterSpacing: `${letterSpacing}px`,
            fontFamily: 'var(--font-sans), system-ui, sans-serif',
          }}
        >
          {lines.map((line, idx) => (
            <tspan
              key={idx}
              x="50%"
              dy={idx === 0 ? (isMultiLine ? '-0.55em' : '0') : '1.18em'}
            >
              {line}
            </tspan>
          ))}
        </text>

        {/* Inner Fill Layer */}
        <text
          ref={textFillRef}
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fill="url(#textFillGradient)"
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: fontWeight,
            letterSpacing: `${letterSpacing}px`,
            fontFamily: 'var(--font-sans), system-ui, sans-serif',
          }}
        >
          {lines.map((line, idx) => (
            <tspan
              key={idx}
              x="50%"
              dy={idx === 0 ? (isMultiLine ? '-0.55em' : '0') : '1.18em'}
            >
              {line}
            </tspan>
          ))}
        </text>
      </svg>
    </div>
  );
}
