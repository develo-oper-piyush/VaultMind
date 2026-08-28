'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { FileItem } from '@/types';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import ThemeToggle from '@/components/ThemeToggle';
import { FileCard } from '@/components/FileCard';
import {
  PersonIcon,
  MagnifyingGlassIcon,
  UploadIcon,
  FileTextIcon,
  ImageIcon,
  VideoIcon,
  SpeakerLoudIcon,
  ArchiveIcon,
  BookmarkIcon,
  CaretSortIcon,
  CopyIcon,
  CheckIcon,
  TrashIcon,
  ExternalLinkIcon,
  DotsVerticalIcon,
  ReaderIcon,
} from '@radix-ui/react-icons';
import {
  ScrollProgressProvider,
  ScrollProgress,
} from '@/components/animate-ui/primitives/animate/scroll-progress';

export default function Dashboard() {
  const { user, logout, loading: authLoading } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name-asc');
  const [uploading, setUploading] = useState(false);
  const [fetchingFiles, setFetchingFiles] = useState(true);
  const [error, setError] = useState('');
  const [copiedFileName, setCopiedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processingFiles, setProcessingFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [user, authLoading]);

  useEffect(() => {
    fetchFiles();
    const interval = setInterval(pollProcessingStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    applyFilters();
  }, [files, searchQuery, typeFilter, categoryFilter, sortBy]);

  const fetchFiles = async () => {
    try {
      const data: any = await apiClient.getFiles();
      setFiles(data.files || []);
      setProcessingFiles(
        new Set(
          (data.files || [])
            .filter((f: FileItem) => f._id && (!f.processingStatus?.textExtracted || !f.processingStatus?.tagged || !f.processingStatus?.summarized))
            .map((f: FileItem) => f._id)
        )
      );
    } catch (err) {
      setError('Failed to fetch files');
    } finally {
      setFetchingFiles(false);
    }
  };

  const pollProcessingStatus = async () => {
    if (processingFiles.size === 0) return;

    for (const fileId of processingFiles) {
      try {
        const data: any = await apiClient.getFileStatus(fileId);
        if (
          data.processingStatus?.textExtracted &&
          data.processingStatus?.tagged &&
          data.processingStatus?.summarized
        ) {
          setProcessingFiles((prev) => {
            const next = new Set(prev);
            next.delete(fileId);
            return next;
          });
          fetchFiles();
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }
  };

  const getFileType = (mimetype: string) => {
    if (!mimetype) return 'other';
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (
      mimetype.includes('pdf') ||
      mimetype.includes('document') ||
      mimetype.includes('text') ||
      mimetype.includes('word') ||
      mimetype.includes('excel')
    )
      return 'document';
    return 'other';
  };

  const applyFilters = () => {
    let filtered = files;

    if (typeFilter !== 'all') {
      filtered = filtered.filter((f) => getFileType(f.mimetype) === typeFilter);
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter((f) => f.category === categoryFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.name.toLowerCase().includes(query) ||
          f.tags?.some((t) => t.toLowerCase().includes(query)) ||
          f.category?.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'date-newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'date-oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'size-largest':
          return b.size - a.size;
        case 'size-smallest':
          return a.size - b.size;
        default:
          return a.name.localeCompare(b.name);
      }
    });

    setFilteredFiles(filtered);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');

    try {
      await apiClient.uploadFile(file);
      await fetchFiles();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) return;

    try {
      await apiClient.deleteFile(fileName);
      await fetchFiles();
    } catch (err) {
      setError('Delete failed');
    }
  };

  const handleCopyLink = (file: FileItem) => {
    const link = file.url?.startsWith("http") ? file.url : apiClient.getFileUrl(file.name);
    navigator.clipboard.writeText(link);
    setCopiedFileName(file.name);
    setTimeout(() => setCopiedFileName(null), 2000);
  };

  // Full Page Skeleton Loading state
  if (authLoading || (fetchingFiles && files.length === 0)) {
    return (
      <ScrollProgressProvider global>
        <ScrollProgress className="fixed top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-emerald-400 to-teal-300 z-[100] origin-left shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
        <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-10">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Header Skeleton */}
            <div className="flex justify-between items-center pb-6 border-b border-border/60">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
              <div className="flex gap-3">
                <Skeleton className="h-10 w-24 rounded-xl" />
                <Skeleton className="h-10 w-24 rounded-xl" />
              </div>
            </div>

            {/* Search & Upload Bar Skeleton */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Skeleton className="h-12 flex-1 rounded-xl" />
              <Skeleton className="h-12 w-36 rounded-xl" />
            </div>

            {/* Filter Pills Skeleton */}
            <div className="flex gap-3 flex-wrap">
              <Skeleton className="h-9 w-36 rounded-xl" />
              <Skeleton className="h-9 w-36 rounded-xl" />
              <Skeleton className="h-9 w-36 rounded-xl" />
            </div>

            {/* Cards Grid Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-6 bg-card/40 border border-border/60 rounded-2xl space-y-4">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-3/4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-md" />
                    <Skeleton className="h-5 w-16 rounded-md" />
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <div className="flex gap-2 pt-2 border-t border-border/40">
                    <Skeleton className="h-9 flex-1 rounded-xl" />
                    <Skeleton className="h-9 w-20 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollProgressProvider>
    );
  }

  return (
    <ScrollProgressProvider global>
      <ScrollProgress className="fixed top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-emerald-400 to-teal-300 z-[100] origin-left shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
      <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-border/60">
          <div className="flex items-center gap-3">
            <Link href="/" className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary hover:scale-105 transition-transform">
              <ArchiveIcon className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">VaultMind Workspace</h1>
              <p className="text-xs text-muted-foreground">Smart Storage & AI Processing Workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/profile"
              className="px-4 py-2 bg-card border border-border hover:bg-accent text-foreground text-sm font-medium rounded-xl transition-all flex items-center gap-2 shadow-sm"
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

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-xs font-bold hover:underline">Dismiss</button>
          </div>
        )}

        {/* Search & Upload Bar */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search files by name, tags, or AI category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-card border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm shadow-sm"
            />
          </div>

          <label className="px-6 py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-xl cursor-pointer hover:opacity-95 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 min-w-[140px]">
            {uploading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <UploadIcon className="w-4 h-4" />
                <span>Upload File</span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>

        {/* DaisyUI Filter Controls Dropdowns with Radix UI Icons */}
        <div className="mb-8 flex flex-wrap gap-3 items-center">
          {/* File Types DaisyUI Dropdown */}
          <div className="dropdown dropdown-bottom">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-outline border-border/80 bg-card hover:bg-accent text-foreground text-xs font-semibold rounded-xl flex items-center gap-2"
            >
              <FileTextIcon className="w-3.5 h-3.5 text-primary" />
              <span>
                {typeFilter === 'all'
                  ? 'Types: All'
                  : typeFilter === 'document'
                  ? 'Documents'
                  : typeFilter === 'image'
                  ? 'Images'
                  : typeFilter === 'video'
                  ? 'Videos'
                  : typeFilter === 'audio'
                  ? 'Audio'
                  : 'Other'}
              </span>
              <CaretSortIcon className="w-3.5 h-3.5" />
            </div>
            <ul tabIndex={0} className="dropdown-content menu bg-card border border-border/80 rounded-xl z-30 w-52 p-2 shadow-2xl space-y-1 text-xs">
              <li><button onClick={() => setTypeFilter('all')} className={`flex items-center gap-2 ${typeFilter === 'all' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><FileTextIcon className="w-3.5 h-3.5" /> All Types</button></li>
              <li><button onClick={() => setTypeFilter('document')} className={`flex items-center gap-2 ${typeFilter === 'document' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><FileTextIcon className="w-3.5 h-3.5" /> Documents</button></li>
              <li><button onClick={() => setTypeFilter('image')} className={`flex items-center gap-2 ${typeFilter === 'image' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><ImageIcon className="w-3.5 h-3.5" /> Images</button></li>
              <li><button onClick={() => setTypeFilter('video')} className={`flex items-center gap-2 ${typeFilter === 'video' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><VideoIcon className="w-3.5 h-3.5" /> Videos</button></li>
              <li><button onClick={() => setTypeFilter('audio')} className={`flex items-center gap-2 ${typeFilter === 'audio' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><SpeakerLoudIcon className="w-3.5 h-3.5" /> Audio</button></li>
              <li><button onClick={() => setTypeFilter('other')} className={`flex items-center gap-2 ${typeFilter === 'other' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><ArchiveIcon className="w-3.5 h-3.5" /> Other</button></li>
            </ul>
          </div>

          {/* Categories DaisyUI Dropdown */}
          <div className="dropdown dropdown-bottom">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-outline border-border/80 bg-card hover:bg-accent text-foreground text-xs font-semibold rounded-xl flex items-center gap-2"
            >
              <BookmarkIcon className="w-3.5 h-3.5 text-primary" />
              <span>Category: {categoryFilter === 'all' ? 'All' : categoryFilter}</span>
              <CaretSortIcon className="w-3.5 h-3.5" />
            </div>
            <ul tabIndex={0} className="dropdown-content menu bg-card border border-border/80 rounded-xl z-30 w-52 p-2 shadow-2xl space-y-1 text-xs">
              <li><button onClick={() => setCategoryFilter('all')} className={`flex items-center gap-2 ${categoryFilter === 'all' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><BookmarkIcon className="w-3.5 h-3.5" /> All Categories</button></li>
              <li><button onClick={() => setCategoryFilter('Invoice')} className={`flex items-center gap-2 ${categoryFilter === 'Invoice' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><FileTextIcon className="w-3.5 h-3.5" /> Invoice</button></li>
              <li><button onClick={() => setCategoryFilter('Resume')} className={`flex items-center gap-2 ${categoryFilter === 'Resume' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><FileTextIcon className="w-3.5 h-3.5" /> Resume</button></li>
              <li><button onClick={() => setCategoryFilter('Contract')} className={`flex items-center gap-2 ${categoryFilter === 'Contract' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><FileTextIcon className="w-3.5 h-3.5" /> Contract</button></li>
              <li><button onClick={() => setCategoryFilter('Photo')} className={`flex items-center gap-2 ${categoryFilter === 'Photo' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><ImageIcon className="w-3.5 h-3.5" /> Photo</button></li>
              <li><button onClick={() => setCategoryFilter('Document')} className={`flex items-center gap-2 ${categoryFilter === 'Document' ? 'active bg-primary/20 text-primary font-bold' : ''}`}><FileTextIcon className="w-3.5 h-3.5" /> Document</button></li>
            </ul>
          </div>

          {/* Sort By DaisyUI Dropdown */}
          <div className="dropdown dropdown-bottom">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-outline border-border/80 bg-card hover:bg-accent text-foreground text-xs font-semibold rounded-xl flex items-center gap-2"
            >
              <CaretSortIcon className="w-3.5 h-3.5 text-primary" />
              <span>
                Sort:{' '}
                {sortBy === 'name-asc'
                  ? 'Name (A-Z)'
                  : sortBy === 'name-desc'
                  ? 'Name (Z-A)'
                  : sortBy === 'date-newest'
                  ? 'Newest'
                  : sortBy === 'date-oldest'
                  ? 'Oldest'
                  : sortBy === 'size-largest'
                  ? 'Largest'
                  : 'Smallest'}
              </span>
              <CaretSortIcon className="w-3.5 h-3.5" />
            </div>
            <ul tabIndex={0} className="dropdown-content menu bg-card border border-border/80 rounded-xl z-30 w-52 p-2 shadow-2xl space-y-1 text-xs">
              <li><button onClick={() => setSortBy('name-asc')} className={sortBy === 'name-asc' ? 'active bg-primary/20 text-primary font-bold' : ''}>Name (A-Z)</button></li>
              <li><button onClick={() => setSortBy('name-desc')} className={sortBy === 'name-desc' ? 'active bg-primary/20 text-primary font-bold' : ''}>Name (Z-A)</button></li>
              <li><button onClick={() => setSortBy('date-newest')} className={sortBy === 'date-newest' ? 'active bg-primary/20 text-primary font-bold' : ''}>Newest First</button></li>
              <li><button onClick={() => setSortBy('date-oldest')} className={sortBy === 'date-oldest' ? 'active bg-primary/20 text-primary font-bold' : ''}>Oldest First</button></li>
              <li><button onClick={() => setSortBy('size-largest')} className={sortBy === 'size-largest' ? 'active bg-primary/20 text-primary font-bold' : ''}>Largest Size</button></li>
              <li><button onClick={() => setSortBy('size-smallest')} className={sortBy === 'size-smallest' ? 'active bg-primary/20 text-primary font-bold' : ''}>Smallest Size</button></li>
            </ul>
          </div>

          <span className="ml-auto text-xs font-medium text-muted-foreground">
            Showing {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'}
          </span>
        </div>

        {/* Files Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Uploading Skeleton Card Placeholder */}
          {uploading && (
            <div className="p-6 bg-primary/5 border border-primary/40 rounded-2xl space-y-4 animate-pulse">
              <div className="flex justify-between items-center">
                <span className="text-[11px] bg-primary/20 text-primary px-2.5 py-1 rounded-full font-semibold">
                  Uploading File...
                </span>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-6 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
              <div className="flex gap-2 pt-2 border-t border-border/40">
                <Skeleton className="h-9 flex-1 rounded-xl" />
              </div>
            </div>
          )}

          {filteredFiles.length === 0 && !uploading ? (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-border/80 rounded-2xl bg-card/40 backdrop-blur-md">
              <div className="flex justify-center mb-3">
                <ArchiveIcon className="w-10 h-10 text-muted-foreground opacity-60" />
              </div>
              <h3 className="font-bold text-base text-foreground mb-1">No files found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Upload your first document, PDF, or image to get started with AI auto-tagging.
              </p>
            </div>
          ) : (
            filteredFiles.map((file) => (
              <FileCard
                key={file.name}
                file={file}
                isProcessing={processingFiles.has(file._id || '')}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </div>
    </div>
  </ScrollProgressProvider>
);
}
