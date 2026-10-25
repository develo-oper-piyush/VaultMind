'use client';

import * as React from 'react';
import {
  ExclamationTriangleIcon,
  Cross2Icon,
  FileTextIcon,
  CheckCircledIcon,
  UploadIcon,
  Pencil1Icon,
  CrossCircledIcon,
} from '@radix-ui/react-icons';

export interface DuplicateCandidate {
  fileId?: string;
  fileName: string;
  originalName: string;
  size: number;
  mimetype?: string;
  category?: string;
  createdAt?: string;
  similarityScore: number;
  confidenceLevel: string; // 'EXACT' | 'HIGH' | 'MODERATE' | 'NONE'
  reasons: string[];
}

export interface DuplicateWarningModalProps {
  isOpen: boolean;
  incomingFile: File | null;
  confidenceLevel: 'EXACT' | 'HIGH' | 'MODERATE' | 'NONE';
  highestScore: number;
  duplicates: DuplicateCandidate[];
  onCancel: () => void;
  onUploadAnyway: () => void;
  onRenameAndSave: (newName: string) => void;
  isUploading?: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function DuplicateWarningModal({
  isOpen,
  incomingFile,
  confidenceLevel,
  highestScore,
  duplicates,
  onCancel,
  onUploadAnyway,
  onRenameAndSave,
  isUploading = false,
}: DuplicateWarningModalProps) {
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [customName, setCustomName] = React.useState('');

  const topMatch = duplicates && duplicates.length > 0 ? duplicates[0] : null;

  // Prepopulate suggested rename when modal opens or incomingFile changes
  React.useEffect(() => {
    if (incomingFile) {
      const name = incomingFile.name;
      const lastDot = name.lastIndexOf('.');
      const base = lastDot !== -1 ? name.substring(0, lastDot) : name;
      const ext = lastDot !== -1 ? name.substring(lastDot) : '';
      setCustomName(`${base}_v2${ext}`);
      setIsRenaming(false);
    }
  }, [incomingFile, isOpen]);

  if (!isOpen || !incomingFile) {
    return null;
  }

  const isExact = confidenceLevel === 'EXACT' || highestScore >= 0.95;
  const isHigh = confidenceLevel === 'HIGH';

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customName.trim();
    if (trimmed.length > 0 && trimmed !== incomingFile.name) {
      onRenameAndSave(trimmed);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md transition-all duration-300 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800/80 flex items-start justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isExact
                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                  : isHigh
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
              }`}
            >
              <ExclamationTriangleIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="duplicate-modal-title" className="text-lg font-semibold text-white">
                  Duplicate File Detected
                </h3>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded-full border uppercase tracking-wider ${
                    isExact
                      ? 'bg-red-950/60 text-red-400 border-red-800/50'
                      : isHigh
                      ? 'bg-amber-950/60 text-amber-300 border-amber-800/50'
                      : 'bg-yellow-950/60 text-yellow-300 border-yellow-800/50'
                  }`}
                >
                  {isExact ? 'Exact Match' : `${confidenceLevel} Confidence`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isExact
                  ? 'An identical copy of this document already exists in your workspace.'
                  : 'A very similar document already exists in your workspace.'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isUploading}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <Cross2Icon className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">
          {/* Comparison Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Incoming File */}
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Incoming File
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  New Upload
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <FileTextIcon className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate" title={incomingFile.name}>
                    {incomingFile.name}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                    <span>{formatBytes(incomingFile.size)}</span>
                    <span>•</span>
                    <span className="truncate">{incomingFile.type || 'Document'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Existing Match File */}
            {topMatch && (
              <div className="p-4 rounded-xl bg-slate-950/50 border border-amber-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    Existing in Vault
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30">
                    {Math.round(topMatch.similarityScore * 100)}% Match
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <FileTextIcon className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate" title={topMatch.originalName}>
                      {topMatch.originalName}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                      <span>{formatBytes(topMatch.size)}</span>
                      <span>•</span>
                      <span>{topMatch.category || 'Document'}</span>
                      {topMatch.createdAt && (
                        <>
                          <span>•</span>
                          <span>{new Date(topMatch.createdAt).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rationale / Explanations */}
          {topMatch && topMatch.reasons && topMatch.reasons.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
              <div className="text-xs font-semibold text-slate-300 mb-2.5 flex items-center gap-2">
                <span>Matching Rationale</span>
              </div>
              <ul className="space-y-1.5">
                {topMatch.reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircledIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Inline Rename Form */}
          {isRenaming ? (
            <form onSubmit={handleRenameSubmit} className="p-4 rounded-xl bg-slate-950/60 border border-blue-500/40 space-y-3">
              <label htmlFor="rename-input" className="block text-xs font-semibold text-slate-200">
                Rename Document to Avoid Collision
              </label>
              <div className="flex gap-2">
                <input
                  id="rename-input"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Enter new filename"
                  autoFocus
                  disabled={isUploading}
                />
                <button
                  type="submit"
                  disabled={isUploading || !customName.trim() || customName.trim() === incomingFile.name}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Save & Upload
                </button>
              </div>
              <p className="text-xs text-slate-400">
                A new original filename will be used for indexing and storage.
              </p>
            </form>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/30 border border-slate-800/60">
              <div className="text-xs text-slate-400">
                Want to keep both versions without overwriting?
              </div>
              <button
                type="button"
                onClick={() => setIsRenaming(true)}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-700"
              >
                <Pencil1Icon className="w-3.5 h-3.5 text-blue-400" />
                <span>Rename File</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/40 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50"
          >
            Cancel Upload
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onUploadAnyway}
              disabled={isUploading}
              className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                isExact
                  ? 'bg-amber-600/90 hover:bg-amber-500 text-white border border-amber-500/30'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              <UploadIcon className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Uploading...' : 'Upload Anyway'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
