'use client';

import * as React from 'react';
import {
  Pencil1Icon,
  Cross2Icon,
  UploadIcon,
  ExclamationTriangleIcon,
  ImageIcon,
  FileTextIcon,
  CheckIcon,
} from '@radix-ui/react-icons';
import { generateSuggestedName } from '@/lib/filenameUtils';

export interface PreUploadRenameModalProps {
  isOpen: boolean;
  incomingFile: File | null;
  onCancel: () => void;
  onConfirmRename: (renamedFile: File) => void;
  onUploadAsOriginal: (originalFile: File) => void;
  isUploading?: boolean;
}

export function PreUploadRenameModal({
  isOpen,
  incomingFile,
  onCancel,
  onConfirmRename,
  onUploadAsOriginal,
  isUploading = false,
}: PreUploadRenameModalProps) {
  const [baseName, setBaseName] = React.useState('');
  const [extension, setExtension] = React.useState('');
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');

  const isImage = React.useMemo(() => {
    if (!incomingFile) return false;
    return incomingFile.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg|avif)$/i.test(incomingFile.name);
  }, [incomingFile]);

  // Generate thumbnail preview URL and split extension
  React.useEffect(() => {
    if (!isOpen || !incomingFile) {
      setPreviewUrl(null);
      setBaseName('');
      setExtension('');
      setError('');
      return;
    }

    const lastDot = incomingFile.name.lastIndexOf('.');
    const ext = lastDot > 0 ? incomingFile.name.substring(lastDot) : '';
    setExtension(ext);

    // Initial suggested clean base name
    const defaultSuggestion = generateSuggestedName(incomingFile.name, incomingFile.type);
    const suggestedBase = defaultSuggestion.replace(/\.[^/.]+$/, '');
    setBaseName(suggestedBase);

    if (isImage) {
      const objectUrl = URL.createObjectURL(incomingFile);
      setPreviewUrl(objectUrl);
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [isOpen, incomingFile, isImage]);

  if (!isOpen || !incomingFile) return null;

  const formattedSize = (incomingFile.size / 1024).toFixed(1) + ' KB';

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBase = baseName.trim().replace(/[/\\?%*:|"<>]/g, '');
    if (!cleanBase) {
      setError('Please enter a valid file name.');
      return;
    }

    const finalName = `${cleanBase}${extension}`;
    const renamedFile = new File([incomingFile], finalName, {
      type: incomingFile.type,
      lastModified: incomingFile.lastModified || Date.now(),
    });

    onConfirmRename(renamedFile);
  };

  const handleUploadOriginal = () => {
    onUploadAsOriginal(incomingFile);
  };

  const applyPresetName = (preset: string) => {
    const now = new Date();
    const dateStr = `${now.toLocaleString('en-US', { month: 'short' })}${String(now.getDate()).padStart(2, '0')}`;
    setBaseName(`${preset}_${dateStr}`);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Pencil1Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Rename File Before Upload</h2>
              <p className="text-xs text-muted-foreground">Give this file an interpretable name for your drive</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Cross2Icon className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">
          {/* Machine-Name Notice Pill */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
              <span className="font-semibold block">Random / Machine Name Detected</span>
              <p className="text-muted-foreground">
                Original:{' '}
                <code className="text-xs font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded break-all">
                  {incomingFile.name}
                </code>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Renaming now ensures accurate organization, searchability, and clean AI tags.
              </p>
            </div>
          </div>

          {/* Visual Asset Preview (If Image) */}
          {isImage && previewUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-border/80 bg-black/40 flex items-center justify-center max-h-48">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="File preview"
                className="max-h-48 w-auto object-contain rounded-lg"
              />
              <div className="absolute top-2 left-2 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 backdrop-blur-md text-white border border-white/20 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3 text-emerald-400" />
                  <span>{formattedSize}</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 backdrop-blur-md text-white border border-white/20 uppercase">
                  {extension.replace('.', '') || 'IMAGE'}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-border/80 bg-muted/30 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                <FileTextIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{incomingFile.name}</p>
                <p className="text-xs text-muted-foreground">{formattedSize}</p>
              </div>
            </div>
          )}

          {/* New Name Form */}
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="fileNameInput" className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Enter Clean File Name:</span>
                <span className="text-[11px] text-muted-foreground font-normal">Extension preserved</span>
              </label>
              <div className="flex items-center rounded-xl border border-input bg-card focus-within:ring-2 focus-within:ring-primary/50 overflow-hidden shadow-sm">
                <input
                  id="fileNameInput"
                  type="text"
                  value={baseName}
                  onChange={(e) => {
                    setBaseName(e.target.value);
                    if (error) setError('');
                  }}
                  autoFocus
                  disabled={isUploading}
                  placeholder="e.g. Modern_Bedroom_Wallpaper"
                  className="flex-1 px-4 py-2.5 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                />
                <span className="px-3 py-2.5 text-xs font-bold font-mono bg-muted text-muted-foreground border-l border-input select-none">
                  {extension || ''}
                </span>
              </div>
              {error && <p className="text-xs text-destructive font-medium">{error}</p>}
            </div>

            {/* Quick Suggestion Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Quick Suggestions:</span>
              <div className="flex flex-wrap gap-1.5">
                {(isImage
                  ? ['Photo_Asset', 'Wallpaper_Art', 'Camera_Shot', 'Graphic_Design', 'Cover_Art']
                  : ['Document', 'Work_Report', 'Project_File', 'Notes_Draft']
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyPresetName(preset)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-border/80 bg-card hover:bg-accent text-foreground hover:border-primary/50 transition-colors"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleUploadOriginal}
                disabled={isUploading}
                className="w-full sm:w-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 cursor-pointer order-3 sm:order-1"
                title="Upload file with its original name anyway"
              >
                Upload with original name
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end order-1 sm:order-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isUploading}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-border/80 hover:bg-muted transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !baseName.trim()}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-95 shadow-md shadow-primary/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <CheckIcon className="w-4 h-4" />
                      <span>Rename & Upload</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

