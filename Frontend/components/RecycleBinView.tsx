'use client';

import * as React from 'react';
import { apiClient } from '@/lib/api';
import { RecycleBinItem } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrashIcon,
  ResetIcon,
  ExclamationTriangleIcon,
  CheckCircledIcon,
  Cross2Icon,
  FileTextIcon,
  ImageIcon,
  VideoIcon,
  SpeakerLoudIcon,
  ArchiveIcon,
  MagnifyingGlassIcon,
  CaretSortIcon,
  ClockIcon,
  InfoCircledIcon,
  ReloadIcon,
  LayersIcon,
} from '@radix-ui/react-icons';

export interface RecycleBinViewProps {
  onFileRestored?: (fileId: string, restoredName?: string, renamed?: boolean) => void;
  onActiveFilesRefreshNeeded?: () => void;
  onNavigateToActiveFiles?: () => void;
  activeFileCount?: number;
  maxActiveFiles?: number;
  onCountChange?: (count: number) => void;
}

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return 'Unknown date';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

const getFileIcon = (mimetype?: string, name?: string) => {
  const mime = mimetype || '';
  const n = name || '';

  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(n)) {
    return <ImageIcon className="w-4 h-4 text-emerald-400" />;
  }
  if (mime.startsWith('video/') || /\.(mp4|webm|mkv|mov)$/i.test(n)) {
    return <VideoIcon className="w-4 h-4 text-purple-400" />;
  }
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|flac)$/i.test(n)) {
    return <SpeakerLoudIcon className="w-4 h-4 text-pink-400" />;
  }
  if (
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('text') ||
    mime.includes('word') ||
    mime.includes('excel') ||
    /\.(pdf|doc|docx|txt|xls|xlsx|ppt|pptx)$/i.test(n)
  ) {
    return <FileTextIcon className="w-4 h-4 text-blue-400" />;
  }
  return <ArchiveIcon className="w-4 h-4 text-cyan-400" />;
};

export function RecycleBinView({
  onFileRestored,
  onActiveFilesRefreshNeeded,
  onNavigateToActiveFiles,
  maxActiveFiles = 12,
  onCountChange,
}: RecycleBinViewProps) {
  const [items, setItems] = React.useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [sortBy, setSortBy] = React.useState<string>('deleted-newest');

  // Action states to prevent duplicate requests
  const [restoringFileId, setRestoringFileId] = React.useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = React.useState<string | null>(null);
  const [emptyLoading, setEmptyLoading] = React.useState<boolean>(false);

  // Dialog states
  const [itemToPermanentlyDelete, setItemToPermanentlyDelete] = React.useState<RecycleBinItem | null>(null);
  const [showEmptyModal, setShowEmptyModal] = React.useState<boolean>(false);
  const [fileToRestore, setFileToRestore] = React.useState<RecycleBinItem | null>(null);

  // Notification banners / toasts
  const [notification, setNotification] = React.useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  } | null>(null);

  const isMountedRef = React.useRef<boolean>(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadRecycleBin = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.getRecycleBin();
      if (!isMountedRef.current) return;
      const fileList = res.files || [];
      setItems(fileList);
      onCountChange?.(fileList.length);
    } catch (err) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load Recycle Bin items';
      setError(msg);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [onCountChange]);

  React.useEffect(() => {
    let active = true;
    const fetchBin = async () => {
      try {
        const res = await apiClient.getRecycleBin();
        if (!active) return;
        const fileList = res.files || [];
        setItems(fileList);
        setLoading(false);
        onCountChange?.(fileList.length);
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Failed to load Recycle Bin items';
        setError(msg);
        setLoading(false);
      }
    };
    fetchBin();
    return () => {
      active = false;
    };
  }, [onCountChange]);

  // Dismiss notification helper
  const clearNotification = () => setNotification(null);

  // Filter and sort items
  const filteredItems = React.useMemo(() => {
    let list = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          (item.originalName || item.fileName || '').toLowerCase().includes(q) ||
          item.tags?.some((t) => t.toLowerCase().includes(q)) ||
          item.category?.toLowerCase().includes(q) ||
          item.summary?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case 'deleted-oldest': {
          const dateA = new Date(a.deletedAt || 0).getTime();
          const dateB = new Date(b.deletedAt || 0).getTime();
          return dateA - dateB;
        }
        case 'expiring-soon': {
          return a.daysRemaining - b.daysRemaining;
        }
        case 'size-largest': {
          return (b.size || 0) - (a.size || 0);
        }
        case 'size-smallest': {
          return (a.size || 0) - (b.size || 0);
        }
        case 'name-asc': {
          return (a.originalName || a.fileName || '').localeCompare(
            b.originalName || b.fileName || ''
          );
        }
        case 'name-desc': {
          return (b.originalName || b.fileName || '').localeCompare(
            a.originalName || a.fileName || ''
          );
        }
        case 'deleted-newest':
        default: {
          const dateA = new Date(a.deletedAt || 0).getTime();
          const dateB = new Date(b.deletedAt || 0).getTime();
          return dateB - dateA;
        }
      }
    });

    return list;
  }, [items, searchQuery, sortBy]);

  // Total storage held in Recycle Bin
  const totalTrashSize = React.useMemo(() => {
    return items.reduce((acc, curr) => acc + (curr.size || 0), 0);
  }, [items]);

  // Restore action handler
  const handleConfirmRestore = async (item: RecycleBinItem) => {
    if (!item._id || restoringFileId) return;

    setRestoringFileId(item._id);
    setFileToRestore(null);
    clearNotification();

    try {
      const result = await apiClient.restoreFileFromTrash(item._id);

      if (!isMountedRef.current) return;

      // Check if renamed by backend
      const restoredDisplayName = result.restoredName || item.originalName || item.fileName;
      const isRenamed = !!result.renamed;

      let msg = `"${restoredDisplayName}" has been restored to your active workspace.`;
      if (isRenamed) {
        msg = `"${item.originalName || item.fileName}" was restored as "${restoredDisplayName}" to resolve a name conflict with an existing active file.`;
      }

      setNotification({
        type: 'success',
        title: isRenamed ? 'File Restored (Renamed)' : 'File Restored Successfully',
        message: msg,
      });

      // Update local state without waiting for slow refetch
      setItems((prev) => {
        const next = prev.filter((f) => f._id !== item._id);
        onCountChange?.(next.length);
        return next;
      });

      // Notify parent dashboard
      onFileRestored?.(item._id, restoredDisplayName, isRenamed);
      onActiveFilesRefreshNeeded?.();
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const errMsg = err instanceof Error ? err.message : 'Failed to restore file';

      // Check for active quota limit error
      const isQuotaError = errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit');

      setNotification({
        type: 'error',
        title: isQuotaError ? 'Active Workspace Quota Reached' : 'Restoration Failed',
        message: isQuotaError
          ? `Cannot restore "${item.originalName || item.fileName}": Your active workspace has reached the limit of ${maxActiveFiles} files. Move or permanently delete an active file first.`
          : errMsg,
      });
    } finally {
      if (isMountedRef.current) {
        setRestoringFileId(null);
      }
    }
  };

  // Permanent delete single item handler
  const handleConfirmPermanentDelete = async (item: RecycleBinItem) => {
    if (!item._id || deletingFileId) return;

    setDeletingFileId(item._id);
    clearNotification();

    try {
      await apiClient.permanentlyDeleteFile(item._id);

      if (!isMountedRef.current) return;

      const displayName = item.originalName || item.fileName;
      setNotification({
        type: 'success',
        title: 'File Permanently Deleted',
        message: `"${displayName}" and all associated versions were permanently purged from cloud storage.`,
      });

      // Remove from local list
      setItems((prev) => {
        const next = prev.filter((f) => f._id !== item._id);
        onCountChange?.(next.length);
        return next;
      });

      setItemToPermanentlyDelete(null);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const errMsg = err instanceof Error ? err.message : 'Failed to permanently delete file from Recycle Bin.';
      setNotification({
        type: 'error',
        title: 'Permanent Deletion Failed',
        message: errMsg,
      });
      // Retain item in UI as required
      setItemToPermanentlyDelete(null);
    } finally {
      if (isMountedRef.current) {
        setDeletingFileId(null);
      }
    }
  };

  // Empty Recycle Bin handler
  const handleConfirmEmptyRecycleBin = async () => {
    if (emptyLoading) return;

    setEmptyLoading(true);
    clearNotification();

    try {
      const res = await apiClient.emptyRecycleBin();

      if (!isMountedRef.current) return;

      const purgedCount = res.deletedCount ?? items.length;
      setNotification({
        type: 'success',
        title: 'Recycle Bin Emptied',
        message: `Successfully purged ${purgedCount} ${purgedCount === 1 ? 'file' : 'files'} and all historical revisions permanently.`,
      });

      setItems([]);
      onCountChange?.(0);
      setShowEmptyModal(false);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const errMsg = err instanceof Error ? err.message : 'Failed to empty Recycle Bin. Some items may still remain.';
      setNotification({
        type: 'error',
        title: 'Empty Recycle Bin Failed',
        message: errMsg,
      });
      setShowEmptyModal(false);
      // Reload actual state from backend
      loadRecycleBin();
    } finally {
      if (isMountedRef.current) {
        setEmptyLoading(false);
      }
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Retention Policy Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-rose-500/10 border border-amber-500/30 text-foreground backdrop-blur-md shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 flex-shrink-0 mt-0.5">
              <ExclamationTriangleIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                  Recycle Bin — 30-Day Recovery Holding State
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/40">
                  30-Day Retention Policy
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-3xl">
                Items placed in the Recycle Bin are safely preserved for up to <strong>30 days</strong> from the deletion date.
                During this window, you can restore files back to your active workspace with their complete version history intact,
                or purge them permanently.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowEmptyModal(true)}
              disabled={loading || items.length === 0 || emptyLoading}
              className="px-4 py-2.5 bg-destructive/15 hover:bg-destructive text-destructive hover:text-destructive-foreground disabled:opacity-40 disabled:cursor-not-allowed border border-destructive/30 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 shadow-sm"
              title="Permanently delete all items currently in the Recycle Bin"
            >
              <TrashIcon className="w-4 h-4" />
              <span>Empty Recycle Bin</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : notification.type === 'error'
              ? 'bg-destructive/10 border-destructive/30 text-destructive'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}
          role="alert"
        >
          <div className="flex items-start gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircledIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-400" />
            ) : notification.type === 'error' ? (
              <Cross2Icon className="w-5 h-5 flex-shrink-0 mt-0.5 text-destructive" />
            ) : (
              <InfoCircledIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
            )}
            <div>
              <p className="text-xs font-bold">{notification.title}</p>
              <p className="text-xs opacity-90 mt-0.5">{notification.message}</p>
            </div>
          </div>
          <button
            onClick={clearNotification}
            className="text-xs font-semibold hover:underline opacity-80 hover:opacity-100 flex-shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search, Filter, Sort & Stats Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search deleted files by name, tags, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-xs shadow-sm"
          />
        </div>

        {/* Sort and Refresh */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sort dropdown */}
          <div className="dropdown dropdown-bottom">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-outline border-border/80 bg-card hover:bg-accent text-foreground text-xs font-semibold rounded-xl flex items-center gap-2 h-10 min-h-0"
            >
              <CaretSortIcon className="w-3.5 h-3.5 text-primary" />
              <span>
                {sortBy === 'deleted-newest'
                  ? 'Deleted: Newest First'
                  : sortBy === 'deleted-oldest'
                  ? 'Deleted: Oldest First'
                  : sortBy === 'expiring-soon'
                  ? 'Expiring Soonest'
                  : sortBy === 'size-largest'
                  ? 'Size: Largest'
                  : sortBy === 'size-smallest'
                  ? 'Size: Smallest'
                  : 'Name (A-Z)'}
              </span>
            </div>
            <ul
              tabIndex={0}
              className="dropdown-content menu bg-card border border-border/80 rounded-xl z-30 w-52 p-2 shadow-2xl space-y-1 text-xs text-foreground"
            >
              <li>
                <button
                  type="button"
                  onClick={() => setSortBy('deleted-newest')}
                  className={sortBy === 'deleted-newest' ? 'active bg-primary/20 text-primary font-bold' : ''}
                >
                  Deleted: Newest First
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setSortBy('deleted-oldest')}
                  className={sortBy === 'deleted-oldest' ? 'active bg-primary/20 text-primary font-bold' : ''}
                >
                  Deleted: Oldest First
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setSortBy('expiring-soon')}
                  className={sortBy === 'expiring-soon' ? 'active bg-primary/20 text-primary font-bold' : ''}
                >
                  Expiring Soonest
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setSortBy('size-largest')}
                  className={sortBy === 'size-largest' ? 'active bg-primary/20 text-primary font-bold' : ''}
                >
                  Size: Largest
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setSortBy('size-smallest')}
                  className={sortBy === 'size-smallest' ? 'active bg-primary/20 text-primary font-bold' : ''}
                >
                  Size: Smallest
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setSortBy('name-asc')}
                  className={sortBy === 'name-asc' ? 'active bg-primary/20 text-primary font-bold' : ''}
                >
                  Name (A-Z)
                </button>
              </li>
            </ul>
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={loadRecycleBin}
            disabled={loading}
            className="p-2.5 bg-card border border-border/80 hover:bg-accent text-foreground rounded-xl transition-all shadow-sm flex items-center justify-center disabled:opacity-40"
            title="Refresh Recycle Bin"
          >
            <ReloadIcon className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : ''}`} />
          </button>

          {/* Storage & Item Stats */}
          <div className="text-xs text-muted-foreground ml-auto sm:ml-0 flex items-center gap-2">
            <span className="font-semibold text-foreground">{items.length}</span>{' '}
            {items.length === 1 ? 'item' : 'items'}
            {items.length > 0 && (
              <>
                <span>•</span>
                <span>{formatBytes(totalTrashSize)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Loading Skeleton State */}
      {loading && items.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 bg-card/40 border border-border/60 rounded-2xl space-y-4 animate-pulse">
              <div className="flex justify-between items-center">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-6 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
              <div className="flex gap-2 pt-2 border-t border-border/40">
                <Skeleton className="h-9 flex-1 rounded-xl" />
                <Skeleton className="h-9 w-24 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error & Retry State */}
      {error && !loading && (
        <div className="p-8 text-center border border-destructive/40 bg-destructive/5 rounded-2xl space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive">
            <ExclamationTriangleIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground">Failed to Load Recycle Bin</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{error}</p>
          </div>
          <button
            type="button"
            onClick={loadRecycleBin}
            className="px-5 py-2 bg-destructive/15 hover:bg-destructive text-destructive hover:text-destructive-foreground border border-destructive/30 text-xs font-semibold rounded-xl transition-all shadow-sm"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div className="py-20 text-center border-2 border-dashed border-border/80 rounded-2xl bg-card/40 backdrop-blur-md space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-center text-muted-foreground shadow-inner">
            <TrashIcon className="w-8 h-8 opacity-60" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-bold text-lg text-foreground tracking-tight">Recycle Bin is Empty</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              No files have been moved to the Recycle Bin. Items you delete from your active workspace will be
              held here safely for up to 30 days before permanent deletion.
            </p>
          </div>
          {onNavigateToActiveFiles && (
            <button
              type="button"
              onClick={onNavigateToActiveFiles}
              className="mt-2 px-5 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-95 transition-all shadow-md shadow-primary/20"
            >
              Return to Active Workspace
            </button>
          )}
        </div>
      )}

      {/* No Search Matches */}
      {!loading && !error && items.length > 0 && filteredItems.length === 0 && (
        <div className="py-16 text-center border border-border/80 rounded-2xl bg-card/30 space-y-3">
          <MagnifyingGlassIcon className="w-8 h-8 mx-auto text-muted-foreground opacity-60" />
          <h4 className="font-bold text-sm text-foreground">No matching deleted files</h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No items in the Recycle Bin match &quot;{searchQuery}&quot;. Try a different keyword or clear your search.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs text-primary font-semibold hover:underline"
          >
            Clear Search
          </button>
        </div>
      )}

      {/* Recycle Bin Grid */}
      {!loading && !error && filteredItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => {
            const displayName = item.originalName || item.fileName || 'Untitled File';
            const isItemRestoring = restoringFileId === item._id;
            const isItemDeleting = deletingFileId === item._id;
            const isActionRunning = isItemRestoring || isItemDeleting || emptyLoading;

            // Determine retention badge color
            const days = item.daysRemaining ?? 30;
            const isUrgent = days <= 3;
            const isExpiringToday = days <= 0;

            return (
              <div
                key={item._id || item.fileName}
                className="group relative rounded-2xl border border-border/70 bg-card/85 backdrop-blur-xl p-6 shadow-lg hover:shadow-2xl hover:border-primary/40 transition-all duration-300 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Top Badges Row */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {/* Retention Countdown Badge */}
                    <div
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5 shadow-sm ${
                        isExpiringToday
                          ? 'bg-destructive/20 text-destructive border-destructive/40 animate-pulse'
                          : isUrgent
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          : days <= 7
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}
                      title={
                        item.deletionExpiresAt
                          ? `Expires: ${formatDate(item.deletionExpiresAt)}`
                          : `${days} days until permanent deletion`
                      }
                    >
                      <ClockIcon className="w-3 h-3 flex-shrink-0" />
                      <span>
                        {isExpiringToday
                          ? 'Expires Today'
                          : `${days} ${days === 1 ? 'day' : 'days'} left`}
                      </span>
                    </div>

                    {/* Version Count Badge */}
                    <div className="flex items-center gap-1.5">
                      {(item.versionCount || 1) > 1 ? (
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1"
                          title={`${item.versionCount} historical versions will be restored or permanently purged together`}
                        >
                          <LayersIcon className="w-3 h-3" />
                          <span>{item.versionCount} versions</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-muted-foreground px-2 py-0.5 rounded-full bg-muted/40 border border-border/40">
                          v1
                        </span>
                      )}

                      {item.category && item.category !== 'Other' && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary/30 text-secondary-foreground border border-border/40">
                          {item.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* File Name & Icon */}
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-muted/60 border border-border/60 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                      {getFileIcon(item.mimetype, displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4
                        className="font-bold text-base text-foreground truncate tracking-tight"
                        title={displayName}
                      >
                        {displayName}
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span>{formatBytes(item.size || 0)}</span>
                        <span>•</span>
                        <span>Folder: {item.originalFolder || '/'}</span>
                      </p>
                    </div>
                  </div>

                  {/* Deletion Date & Location Details */}
                  <div className="p-3 bg-muted/20 border border-border/50 rounded-xl space-y-1 text-[11px] text-muted-foreground">
                    <div className="flex justify-between items-center">
                      <span>Deleted:</span>
                      <span className="font-medium text-foreground">{formatDate(item.deletedAt)}</span>
                    </div>
                    {item.deletionExpiresAt && (
                      <div className="flex justify-between items-center">
                        <span>Auto-Purge:</span>
                        <span className="font-medium text-foreground">{formatDate(item.deletionExpiresAt)}</span>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] bg-muted/50 border border-border/60 text-muted-foreground px-2 py-0.5 rounded-md font-medium"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* AI Summary snippet */}
                  {item.summary && (
                    <p
                      className="text-xs text-muted-foreground italic line-clamp-2 leading-relaxed bg-muted/15 p-2.5 rounded-lg border border-border/40"
                      title={item.summary}
                    >
                      &ldquo;{item.summary}&rdquo;
                    </p>
                  )}
                </div>

                {/* Actions Bottom Bar */}
                <div className="pt-3 border-t border-border/50 flex items-center gap-2">
                  {/* Restore Button */}
                  <button
                    type="button"
                    onClick={() => setFileToRestore(item)}
                    disabled={isActionRunning}
                    className="flex-1 py-2.5 px-3 bg-emerald-600/90 hover:bg-emerald-600 active:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Restore file back to active workspace"
                  >
                    {isItemRestoring ? (
                      <>
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        <span>Restoring...</span>
                      </>
                    ) : (
                      <>
                        <ResetIcon className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </>
                    )}
                  </button>

                  {/* Delete Permanently Button */}
                  <button
                    type="button"
                    onClick={() => setItemToPermanentlyDelete(item)}
                    disabled={isActionRunning}
                    className="py-2.5 px-3 bg-destructive/15 hover:bg-destructive active:bg-destructive/90 text-destructive hover:text-destructive-foreground font-semibold text-xs rounded-xl border border-destructive/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Permanently destroy this file and all version history"
                  >
                    {isItemDeleting ? (
                      <>
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-destructive/30 border-t-destructive animate-spin" />
                        <span className="sr-only">Deleting...</span>
                      </>
                    ) : (
                      <>
                        <TrashIcon className="w-3.5 h-3.5" />
                        <span>Delete Permanently</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. Restore Confirmation Dialog */}
      {/* ======================================================== */}
      {fileToRestore && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="restore-modal-title"
          onClick={() => !restoringFileId && setFileToRestore(null)}
        >
          <div
            className="w-full max-w-md bg-card border border-border text-foreground rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <ResetIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 id="restore-modal-title" className="text-base font-bold text-foreground">
                  Restore File to Active Workspace?
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs" title={fileToRestore.originalName || fileToRestore.fileName}>
                  {fileToRestore.originalName || fileToRestore.fileName}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-muted/40 border border-border/60 rounded-xl text-xs text-foreground/85 space-y-2 leading-relaxed">
              <p>
                Restoring this file will return it to your active workspace in folder{' '}
                <strong className="text-foreground">{fileToRestore.originalFolder || '/'}</strong>.
              </p>
              {(fileToRestore.versionCount || 1) > 1 && (
                <p className="text-primary font-medium">
                  All <strong>{fileToRestore.versionCount} historical versions</strong> will also be restored completely intact.
                </p>
              )}
              <p className="text-muted-foreground text-[11px]">
                Note: If an active file already exists with the same name, the system will automatically append a restored suffix to prevent accidental overwrite.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setFileToRestore(null)}
                disabled={!!restoringFileId}
                className="px-4 py-2 border border-border/80 hover:bg-accent text-foreground text-xs font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmRestore(fileToRestore)}
                disabled={!!restoringFileId}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md flex items-center gap-1.5"
              >
                {restoringFileId ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <ResetIcon className="w-3.5 h-3.5" />
                    <span>Confirm Restore</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. Permanent Delete Single Item Confirmation Dialog */}
      {/* ======================================================== */}
      {itemToPermanentlyDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="perm-delete-title"
          onClick={() => !deletingFileId && setItemToPermanentlyDelete(null)}
        >
          <div
            className="w-full max-w-md bg-card border border-destructive/40 text-foreground rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive flex-shrink-0">
                <TrashIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 id="perm-delete-title" className="text-base font-bold text-destructive">
                  Permanently Delete This File?
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs" title={itemToPermanentlyDelete.originalName || itemToPermanentlyDelete.fileName}>
                  {itemToPermanentlyDelete.originalName || itemToPermanentlyDelete.fileName}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-foreground space-y-2 leading-relaxed">
              <p className="font-semibold text-destructive">
                ⚠️ This action is IRREVERSIBLE and cannot be undone.
              </p>
              <p className="text-xs text-foreground/80">
                The storage binary will be purged from cloud storage, and database records will be permanently removed.
              </p>
              {(itemToPermanentlyDelete.versionCount || 1) > 1 && (
                <p className="text-xs text-destructive font-medium">
                  All <strong>{itemToPermanentlyDelete.versionCount} historical versions</strong> and RAG document chunks
                  will also be destroyed permanently.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setItemToPermanentlyDelete(null)}
                disabled={!!deletingFileId}
                className="px-4 py-2 border border-border/80 hover:bg-accent text-foreground text-xs font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmPermanentDelete(itemToPermanentlyDelete)}
                disabled={!!deletingFileId}
                className="px-5 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold rounded-xl transition-all shadow-md flex items-center gap-1.5"
              >
                {deletingFileId ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <TrashIcon className="w-3.5 h-3.5" />
                    <span>Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. Empty Recycle Bin Confirmation Dialog */}
      {/* ======================================================== */}
      {showEmptyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="empty-recycle-bin-title"
          onClick={() => !emptyLoading && setShowEmptyModal(false)}
        >
          <div
            className="w-full max-w-lg bg-card border border-destructive/50 text-foreground rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-destructive/20 border border-destructive/40 flex items-center justify-center text-destructive flex-shrink-0">
                <TrashIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 id="empty-recycle-bin-title" className="text-lg font-bold text-destructive">
                  Empty Entire Recycle Bin?
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Purging {items.length} {items.length === 1 ? 'file' : 'files'} ({formatBytes(totalTrashSize)})
                </p>
              </div>
            </div>

            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-foreground space-y-2.5 leading-relaxed">
              <p className="font-bold text-destructive text-sm">
                ⚠️ CRITICAL: This operation will permanently destroy all {items.length} items.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-foreground/80">
                <li>All cloud storage binaries will be completely deleted.</li>
                <li>All historical version snapshots and change logs will be destroyed.</li>
                <li>All document RAG embeddings and chunk indexes will be purged.</li>
                <li>You will NOT be able to recover any of these files later.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEmptyModal(false)}
                disabled={emptyLoading}
                className="px-4 py-2 border border-border/80 hover:bg-accent text-foreground text-xs font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEmptyRecycleBin}
                disabled={emptyLoading}
                className="px-5 py-2.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-bold rounded-xl transition-all shadow-lg shadow-destructive/20 flex items-center gap-2"
              >
                {emptyLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Purging Recycle Bin...</span>
                  </>
                ) : (
                  <>
                    <TrashIcon className="w-4 h-4" />
                    <span>Yes, Empty Recycle Bin</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
