'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { FileItem } from '@/types';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import DepthCarousel from '@/components/DepthCarousel';
import {
  ScrollProgressProvider,
  ScrollProgress,
} from '@/components/animate-ui/primitives/animate/scroll-progress';
import {
  ArchiveIcon,
  ImageIcon,
  PersonIcon,
  ChevronLeftIcon,
  MagicWandIcon,
} from '@radix-ui/react-icons';

const DEFAULT_SAMPLE_PHOTOS = [
  { image: 'https://picsum.photos/seed/a/800/1000', alt: 'Sample Photo One' },
  { image: 'https://picsum.photos/seed/b/800/1000', alt: 'Sample Photo Two' },
  { image: 'https://picsum.photos/seed/c/800/1000', alt: 'Sample Photo Three' },
  { image: 'https://picsum.photos/seed/d/800/1000', alt: 'Sample Photo Four' },
  { image: 'https://picsum.photos/seed/e/800/1000', alt: 'Sample Photo Five' },
];

export default function PhotosPage() {
  const router = useRouter();
  const { user, logout, loading: authLoading } = useAuth();
  const [photoFiles, setPhotoFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const fetchPhotos = async () => {
    try {
      const data = (await apiClient.getFiles()) as { files?: FileItem[] };
      const allFiles: FileItem[] = data.files || [];
      const imagesOnly = allFiles.filter((f) => {
        if (!f.mimetype) return /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(f.name);
        return f.mimetype.startsWith('image/');
      });
      setPhotoFiles(imagesOnly);
    } catch (err) {
      console.error('Failed to fetch photos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    fetchPhotos();
  }, []);

  // Convert uploaded photo items or fallback to sample items
  const userPhotoItems = photoFiles.map((f) => {
    let rawUrl = f.url;
    if (rawUrl && rawUrl.includes('localhost:5000')) {
      rawUrl = rawUrl.replace('localhost:5000', 'localhost:3000');
    }
    let finalUrl = rawUrl && rawUrl.startsWith('http') ? rawUrl : apiClient.getFileUrl(f.name);
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token && !finalUrl.includes('token=')) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
      }
    }
    return {
      image: finalUrl,
      alt: f.originalName || f.name,
    };
  });

  const carouselItems = userPhotoItems.length > 0 ? userPhotoItems : DEFAULT_SAMPLE_PHOTOS;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="w-8 h-8 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
          <span className="text-sm text-muted-foreground font-medium">Loading Photo Gallery...</span>
        </div>
      </div>
    );
  }

  return (
    <ScrollProgressProvider global>
      <ScrollProgress className="fixed top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-emerald-400 to-teal-300 z-[100] origin-left shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
      
      <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-10 flex flex-col justify-between">
        <div className="max-w-7xl mx-auto w-full">
          {/* Top Navbar Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-border/60">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary hover:scale-105 transition-transform"
              >
                <ArchiveIcon className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Photo Gallery</h1>
                <p className="text-xs text-muted-foreground">
                  3D Depth View for Uploaded Photo Assets ({photoFiles.length} uploaded)
                </p>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-3">
              <ThemeToggle />

              <Link
                href="/dashboard"
                className="px-4 py-2 bg-card border border-border/80 hover:bg-accent text-foreground text-sm font-medium rounded-xl transition-all flex items-center gap-2 shadow-sm"
              >
                <ChevronLeftIcon className="w-4 h-4 text-primary" />
                <span>Dashboard</span>
              </Link>

              <Link
                href="/photos"
                className="px-4 py-2 bg-primary/15 border border-primary/40 text-primary text-sm font-semibold rounded-xl transition-all flex items-center gap-2 shadow-sm"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Photos Carousel</span>
              </Link>

              <Link
                href="/profile"
                className="px-4 py-2 bg-card border border-border/80 hover:bg-accent text-foreground text-sm font-medium rounded-xl transition-all flex items-center gap-2 shadow-sm"
              >
                <PersonIcon className="w-4 h-4 text-primary" />
                <span>Profile</span>
              </Link>

              <button
                onClick={logout}
                className="px-4 py-2 bg-destructive/10 border border-destructive/30 hover:bg-destructive text-destructive hover:text-destructive-foreground text-sm font-medium rounded-xl transition-all"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Section Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-3">
              <MagicWandIcon className="w-3.5 h-3.5" />
              Interactive 3D Depth View
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              Glance Through Your Image Collection
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
              Drag, scroll, or let the carousel auto-play to inspect high-resolution photo assets stored in your vault.
            </p>
          </div>

          {/* 3D Depth Carousel Container */}
          <div className="w-full max-w-5xl mx-auto border border-border/50 bg-card/40 backdrop-blur-2xl rounded-3xl p-6 shadow-2xl overflow-hidden">
            <div style={{ height: '500px', position: 'relative' }}>
              <DepthCarousel
                items={carouselItems}
                depth={250}
                spread={165}
                tilt={18}
                tiltDirection="right"
                perspective={1600}
                visibleCards={4}
                falloff={0.18}
                blur={8}
                autoplay
                loop
                cardWidth={370}
                cardHeight={360}
                radius={33}
                tint="#54a450"
                duration={750}
                ease="power3.out"
                autoplayDelay={3200}
                showControls
                showIndicators={true}
                onChange={(idx) => setActiveIndex(idx)}
              />
            </div>

            {/* Active Photo Toolbar */}
            <div className="mt-4 pt-4 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold truncate max-w-md">
                  {carouselItems[activeIndex]?.alt || `Photo ${activeIndex + 1}`}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                  {activeIndex + 1} of {carouselItems.length}
                </span>
              </div>

              {carouselItems[activeIndex]?.image && (
                <button
                  type="button"
                  onClick={() => window.open(carouselItems[activeIndex].image, '_blank', 'noopener,noreferrer')}
                  className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 text-xs shadow-sm cursor-pointer"
                >
                  <MagicWandIcon className="w-3.5 h-3.5" />
                  <span>Open Full Resolution</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-12 text-center text-xs text-muted-foreground border-t border-border/40 pt-6">
          Showing {carouselItems.length} photos in 3D Depth Carousel view
        </div>
      </div>
    </ScrollProgressProvider>
  );
}
