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
  Share1Icon,
  FileTextIcon,
  GridIcon,
  OpenInNewWindowIcon,
} from '@radix-ui/react-icons';
import { ShareModal } from '@/components/ShareModal';
import { OcrModal } from '@/components/OcrModal';

const DEFAULT_SAMPLE_PHOTOS = [
  { image: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop', alt: 'Renaissance Artwork (1:1)' },
  { image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&auto=format&fit=crop', alt: 'Yosemite Mountain Valley (16:9)' },
  { image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop', alt: 'Cosmic Starry Skies (9:16 Portrait)' },
  { image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1000&auto=format&fit=crop', alt: 'Modern Motherboard Chip (16:9)' },
  { image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop', alt: 'Vibrant Red Sneakers (4:5)' },
  { image: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=1200&auto=format&fit=crop', alt: 'Cyberpunk Neon Workstation (16:9)' },
  { image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop', alt: 'Architectural Minimalist Living (9:16)' },
  { image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1000&auto=format&fit=crop', alt: 'Coding Workspace Desk (16:9)' },
];

export default function PhotosPage() {
  const router = useRouter();
  const { user, logout, loading: authLoading } = useAuth();
  const [photoFiles, setPhotoFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'pinterest' | 'carousel'>('pinterest');
  const [activeIndex, setActiveIndex] = useState(0);

  // Share & OCR Modals
  const [selectedShareFile, setSelectedShareFile] = useState<FileItem | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [selectedOcrFile, setSelectedOcrFile] = useState<FileItem | null>(null);
  const [isOcrOpen, setIsOcrOpen] = useState(false);

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

  // Format image items for Carousel & Pinterest view
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
      id: f._id,
      url: finalUrl,
      image: finalUrl,
      alt: f.originalName || f.name,
      name: f.originalName || f.name,
      size: f.size,
      mimetype: f.mimetype || 'image/jpeg',
      fileItem: f,
    };
  });

  const carouselItems = userPhotoItems.length > 0 ? userPhotoItems : DEFAULT_SAMPLE_PHOTOS;

  const displayPinterestItems =
    userPhotoItems.length > 0
      ? userPhotoItems
      : DEFAULT_SAMPLE_PHOTOS.map((s, idx) => ({
          id: `sample-${idx}`,
          url: s.image,
          image: s.image,
          alt: s.alt,
          name: s.alt,
          size: 1024 * 720,
          mimetype: 'image/jpeg',
          fileItem: undefined,
        }));

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
                  Intelligent Visual Storage ({photoFiles.length} uploaded photo assets)
                </p>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-3 flex-wrap">
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
                <span>Photo Gallery</span>
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

          {/* Gallery View Switcher & Title Header */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">
                {viewMode === 'pinterest' ? 'Pinterest Visual Wall' : '3D Depth Carousel'}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {viewMode === 'pinterest'
                  ? 'Masonry flow preserving natural aspect ratios (9:16 portrait, 16:9 landscape, 1:1 square).'
                  : 'Interactive 3D depth deck with fluid physics and gestures.'}
              </p>
            </div>

            {/* View Mode Switcher Pills */}
            <div className="flex items-center gap-1.5 p-1 bg-muted/40 border border-border/80 rounded-2xl">
              <button
                type="button"
                onClick={() => setViewMode('pinterest')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  viewMode === 'pinterest'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <GridIcon className="w-3.5 h-3.5" />
                <span>Pinterest Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('carousel')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  viewMode === 'carousel'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <MagicWandIcon className="w-3.5 h-3.5" />
                <span>3D Carousel</span>
              </button>
            </div>
          </div>

          {/* MAIN VIEW CONTENT */}
          {viewMode === 'pinterest' ? (
            /* PINTEREST MASONRY LAYOUT */
            <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
              {displayPinterestItems.map((item, index) => (
                <div
                  key={item.id || item.url || index}
                  className="break-inside-avoid group relative overflow-hidden rounded-2xl bg-card border border-border/70 hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1.5 cursor-pointer"
                  onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                >
                  {/* Natural Aspect-Ratio Image (Preserves 9:16, 16:9, 1:1, etc.) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.name}
                    loading="lazy"
                    className="w-full h-auto block rounded-2xl transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                  />

                  {/* Pinterest-style Dark Gradient Overlay with Hover Actions */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-3.5 flex flex-col justify-between rounded-2xl">
                    {/* Top Action Pills */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 border border-white/20">
                        {item.mimetype?.split('/')[1] || 'IMAGE'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {item.fileItem && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedShareFile(item.fileItem!);
                                setIsShareOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium flex items-center gap-1 transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer"
                              title="Create secure share link"
                            >
                              <Share1Icon className="w-3 h-3 text-primary" />
                              <span>Share</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOcrFile(item.fileItem!);
                                setIsOcrOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium flex items-center gap-1 transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer"
                              title="Extract visual text with OCR"
                            >
                              <FileTextIcon className="w-3 h-3 text-primary" />
                              <span>OCR</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(item.url, '_blank', 'noopener,noreferrer');
                          }}
                          className="p-1.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer"
                          title="Open full resolution in new tab"
                        >
                          <OpenInNewWindowIcon className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Bottom Metadata */}
                    <div className="space-y-1">
                      <h3 className="text-white text-xs font-bold truncate drop-shadow-md">
                        {item.name}
                      </h3>
                      <div className="flex items-center justify-between text-[11px] text-white/80">
                        <span>{item.size ? (item.size / 1024).toFixed(0) + ' KB' : ''}</span>
                        <span className="text-[10px] text-emerald-300 font-semibold underline underline-offset-2">
                          Click to view full
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 3D DEPTH CAROUSEL VIEW */
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

                <div className="flex items-center gap-2 flex-wrap">
                  {photoFiles[activeIndex] && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedShareFile(photoFiles[activeIndex]);
                          setIsShareOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-card border border-border/80 hover:bg-accent text-foreground font-medium flex items-center gap-1.5 text-xs transition-colors shadow-sm cursor-pointer"
                        title="Create secure share link"
                      >
                        <Share1Icon className="w-3.5 h-3.5 text-primary" />
                        <span>Share</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOcrFile(photoFiles[activeIndex]);
                          setIsOcrOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-card border border-border/80 hover:bg-accent text-foreground font-medium flex items-center gap-1.5 text-xs transition-colors shadow-sm cursor-pointer"
                        title="Extract visual text with OCR"
                      >
                        <FileTextIcon className="w-3.5 h-3.5 text-primary" />
                        <span>Extract Text (OCR)</span>
                      </button>
                    </>
                  )}
                  {carouselItems[activeIndex]?.image && (
                    <button
                      type="button"
                      onClick={() =>
                        window.open(carouselItems[activeIndex].image, '_blank', 'noopener,noreferrer')
                      }
                      className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 text-xs shadow-sm cursor-pointer"
                    >
                      <MagicWandIcon className="w-3.5 h-3.5" />
                      <span>Open Full Resolution</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Share Modal */}
        <ShareModal
          isOpen={isShareOpen}
          file={selectedShareFile}
          onClose={() => setIsShareOpen(false)}
        />

        {/* OCR Modal */}
        <OcrModal
          isOpen={isOcrOpen}
          file={selectedOcrFile}
          onClose={() => setIsOcrOpen(false)}
        />

        {/* Footer info */}
        <div className="mt-12 text-center text-xs text-muted-foreground border-t border-border/40 pt-6">
          Showing {displayPinterestItems.length} photos in Pinterest Masonry & 3D Carousel view
        </div>
      </div>
    </ScrollProgressProvider>
  );
}
