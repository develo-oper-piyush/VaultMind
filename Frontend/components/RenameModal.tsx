'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { FileItem } from '@/types';
import {
  Pencil1Icon,
  Cross2Icon,
  CheckIcon,
  ExclamationTriangleIcon,
  FileTextIcon,
} from '@radix-ui/react-icons';

interface RenameModalProps {
  isOpen: boolean;
  file: FileItem | null;
  onClose: () => void;
  onRenamed: () => void;
}

export function RenameModal({ isOpen, file, onClose, onRenamed }: RenameModalProps) {
  const [baseName, setBaseName] = useState('');
  const [extension, setExtension] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateConflict, setDuplicateConflict] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && file) {
      const currentName = file.originalName || file.name;
      const lastDot = currentName.lastIndexOf('.');
      if (lastDot > 0) {
        setBaseName(currentName.substring(0, lastDot));
        setExtension(currentName.substring(lastDot));
      } else {
        setBaseName(currentName);
        setExtension('');
      }
      setError('');
      setDuplicateConflict(null);
    }
  }, [isOpen, file]);

  if (!isOpen || !file) return null;

  const currentFullName = file.originalName || file.name;
  const newFullName = `${baseName.trim()}${extension}`;

  const handleSubmit = async (e: React.FormEvent, forceDuplicate = false) => {
    e.preventDefault();
    if (!baseName.trim()) {
      setError('File name cannot be empty');
      return;
    }

    if (newFullName === currentFullName && !forceDuplicate) {
      onClose();
      return;
    }

    setLoading(true);
    setError('');
    setDuplicateConflict(null);

    try {
      await apiClient.renameFile(file.name, newFullName, file._id, forceDuplicate);
      onRenamed();
      onClose();
    } catch (err: unknown) {
      const errObj = err as { status?: number; data?: { error?: string } };
      if (errObj.status === 409) {
        setDuplicateConflict(
          errObj.data?.error || `A file with name "${newFullName}" already exists in your vault.`
        );
      } else {
        setError(err instanceof Error ? err.message : 'Failed to rename file');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Pencil1Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Rename File</h2>
              <p className="text-xs text-muted-foreground truncate max-w-[260px]">
                {currentFullName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
          >
            <Cross2Icon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={(e) => handleSubmit(e, false)} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {duplicateConflict && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-2">
              <div className="flex items-start gap-2 text-amber-400 font-semibold">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{duplicateConflict}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Do you want to save anyway?
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDuplicateConflict(null)}
                  className="px-3 py-1 bg-card border border-border/80 hover:bg-accent rounded-lg text-xs font-medium text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={loading}
                  className="px-3 py-1 bg-amber-500 text-amber-950 rounded-lg text-xs font-bold hover:bg-amber-400 transition-colors shadow-sm"
                >
                  Save Anyway
                </button>
              </div>
            </div>
          )}

          {/* Filename input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>New File Name</span>
              {extension && (
                <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Format: {extension}
                </span>
              )}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                placeholder="Enter filename..."
                className="flex-1 px-3.5 py-2.5 bg-card border border-input rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {extension && (
                <span className="px-3 py-2.5 bg-muted/40 border border-border/80 text-muted-foreground font-mono text-xs rounded-xl">
                  {extension}
                </span>
              )}
            </div>
          </div>

          {/* Quick Naming Convention DaisyUI Select Component */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <FileTextIcon className="w-3.5 h-3.5 text-primary" />
              <span>Format Helper</span>
            </label>
            <select
              defaultValue=""
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'title') {
                  setBaseName((prev) =>
                    prev.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase())
                  );
                } else if (val === 'kebab') {
                  setBaseName((prev) => prev.toLowerCase().replace(/\s+/g, '-'));
                } else if (val === 'snake') {
                  setBaseName((prev) => prev.toLowerCase().replace(/\s+/g, '_'));
                } else if (val === 'clean') {
                  setBaseName((prev) => prev.replace(/[^\w\s-]/gi, '').trim());
                }
                e.target.value = '';
              }}
              className="select select-bordered select-sm w-full bg-card border-border/80 text-foreground rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="" disabled>Choose quick formatting preset...</option>
              <option value="title">Capitalize Words (Title Case)</option>
              <option value="kebab">kebab-case (hyphen-separated)</option>
              <option value="snake">snake_case (underscore-separated)</option>
              <option value="clean">Clean Special Characters</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-border/60">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-card border border-border/80 hover:bg-accent text-foreground text-xs font-semibold rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !baseName.trim() || newFullName === currentFullName}
              className="px-5 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-md shadow-primary/20"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  <span>Renaming...</span>
                </>
              ) : (
                <>
                  <CheckIcon className="w-3.5 h-3.5" />
                  <span>Save Name</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

