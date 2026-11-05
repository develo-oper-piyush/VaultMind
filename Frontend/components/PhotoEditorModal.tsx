'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileItem } from '@/types';
import { apiClient } from '@/lib/api';
import { isUninterpretableOrRandomName } from '@/lib/filenameUtils';
import {
  Cross2Icon,
  MixerHorizontalIcon,
  Pencil1Icon,
  TextIcon,
  EraserIcon,
  ResetIcon,
  DownloadIcon,
  CheckIcon,
  TrashIcon,
  PlusIcon,
  ZoomInIcon,
  MagicWandIcon,
} from '@radix-ui/react-icons';

export interface PhotoAdjustments {
  brightness: number; // 0 - 200 (default 100)
  contrast: number;   // 0 - 200 (default 100)
  saturation: number; // 0 - 200 (default 100)
  blur: number;       // 0 - 20 (default 0)
  sepia: number;      // 0 - 100 (default 0)
  grayscale: number;  // 0 - 100 (default 0)
  hueRotate: number;  // 0 - 360 (default 0)
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  hueRotate: 0,
};

export interface Preset {
  id: string;
  name: string;
  isCustom?: boolean;
  adjustments: PhotoAdjustments;
}

export const BUILTIN_PRESETS: Preset[] = [
  { id: 'original', name: 'Original', adjustments: { ...DEFAULT_ADJUSTMENTS } },
  { id: 'vivid', name: 'Vivid Pop', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 108, contrast: 122, saturation: 145 } },
  { id: 'sunset', name: 'Warm Sunset', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 105, contrast: 112, saturation: 125, sepia: 32, hueRotate: 345 } },
  { id: 'noir', name: 'Cool Noir', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 110, contrast: 135, saturation: 0, grayscale: 100 } },
  { id: 'cyberpunk', name: 'Cyberpunk', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 112, contrast: 130, saturation: 175, hueRotate: 290 } },
  { id: 'vintage', name: 'Vintage 70s', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 96, contrast: 92, saturation: 85, sepia: 55, hueRotate: 15 } },
  { id: 'dramatic', name: 'Dramatic', adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 94, contrast: 142, saturation: 115, sepia: 15 } },
];

const MAX_CUSTOM_PRESETS = 3;
const CUSTOM_PRESETS_KEY = 'vaultmind_photo_custom_presets_v1';

interface Point {
  x: number; // 0 to 1 normalized
  y: number; // 0 to 1 normalized
}

interface Stroke {
  id: string;
  color: string;
  width: number;
  isEraser: boolean;
  points: Point[];
}

interface TextItem {
  id: string;
  text: string;
  x: number; // 0 to 1 normalized
  y: number; // 0 to 1 normalized
  fontSize: number; // base size
  color: string;
}

interface PhotoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  fileName: string;
  fileItem?: FileItem | null;
  onSaved?: () => void;
}

export function PhotoEditorModal({
  isOpen,
  onClose,
  imageUrl,
  fileName,
  fileItem,
  onSaved,
}: PhotoEditorModalProps) {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'adjust' | 'draw' | 'text'>('adjust');

  // Photo Adjustments state
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [activePresetId, setActivePresetId] = useState<string>('original');
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [isNamingPreset, setIsNamingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Drawing state
  const [isDrawingTool, setIsDrawingTool] = useState<'pen' | 'eraser'>('pen');
  const [strokeColor, setStrokeColor] = useState<string>('#10b981'); // Emerald green
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const isPaintingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);

  // Text items state
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [newTextInput, setNewTextInput] = useState<string>('Double click to edit');
  const [textColor, setTextColor] = useState<string>('#ffffff');
  const [textFontSize, setTextFontSize] = useState<number>(28);
  const draggingTextRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Canvas and image refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Load custom presets from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_PRESETS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCustomPresets(parsed.slice(0, MAX_CUSTOM_PRESETS));
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save custom presets to localStorage
  const saveCustomPresets = (newPresets: Preset[]) => {
    setCustomPresets(newPresets);
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(newPresets));
    } catch {
      // Ignore storage errors
    }
  };

  // Reset editor state when a new image is opened
  useEffect(() => {
    if (!isOpen) return;

    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
    setActivePresetId('original');
    setStrokes([]);
    setTextItems([]);
    setSelectedTextId(null);
    setSaveSuccessMsg('');
    setErrorMsg('');
    setImageLoaded(false);

    // Load base image into memory
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      loadedImageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      setErrorMsg('Could not load image data for editing.');
    };
  }, [isOpen, imageUrl]);

  // Generate CSS filter string
  const filterString = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) blur(${adjustments.blur}px) sepia(${adjustments.sepia}%) grayscale(${adjustments.grayscale}%) hue-rotate(${adjustments.hueRotate}deg)`;

  // Global pointerup & blur listener to guarantee painting and dragging stop immediately when mouse is released
  useEffect(() => {
    const onGlobalPointerUp = () => {
      isPaintingRef.current = false;
      currentStrokeRef.current = null;
      draggingTextRef.current = null;
    };
    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('blur', onGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('blur', onGlobalPointerUp);
    };
  }, []);

  // Reset painting and dragging state when switching tabs or tools
  useEffect(() => {
    isPaintingRef.current = false;
    currentStrokeRef.current = null;
    draggingTextRef.current = null;
  }, [activeTab, isDrawingTool]);

  // Redraw the canvas whenever adjustments, strokes, or texts change
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to image dimensions
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    // 1. Draw base photo with CSS filters onto main canvas
    ctx.save();
    ctx.filter = filterString;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 2. Render all strokes onto an offscreen drawing layer so eraser only erases drawings, NEVER the photo!
    if (strokes.length > 0) {
      const drawCanvas = document.createElement('canvas');
      drawCanvas.width = canvas.width;
      drawCanvas.height = canvas.height;
      const drawCtx = drawCanvas.getContext('2d');

      if (drawCtx) {
        strokes.forEach((stroke) => {
          if (!stroke.points || stroke.points.length === 0) return;

          drawCtx.save();
          const scaledWidth = Math.max(1, stroke.width * (canvas.width / 800));

          if (stroke.isEraser) {
            // Destination-out on drawing layer erases drawn pixels to transparent, cleanly revealing the photo underneath!
            drawCtx.globalCompositeOperation = 'destination-out';
            drawCtx.strokeStyle = 'rgba(0,0,0,1)';
            drawCtx.fillStyle = 'rgba(0,0,0,1)';
          } else {
            drawCtx.globalCompositeOperation = 'source-over';
            drawCtx.strokeStyle = stroke.color;
            drawCtx.fillStyle = stroke.color;
          }

          if (stroke.points.length === 1) {
            // Support single-click dots
            drawCtx.beginPath();
            drawCtx.arc(
              stroke.points[0].x * canvas.width,
              stroke.points[0].y * canvas.height,
              scaledWidth / 2,
              0,
              Math.PI * 2
            );
            drawCtx.fill();
          } else {
            drawCtx.beginPath();
            drawCtx.lineCap = 'round';
            drawCtx.lineJoin = 'round';
            drawCtx.lineWidth = scaledWidth;
            drawCtx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
            for (let i = 1; i < stroke.points.length; i++) {
              drawCtx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
            }
            drawCtx.stroke();
          }
          drawCtx.restore();
        });

        // 3. Composite drawing layer over the photo
        ctx.drawImage(drawCanvas, 0, 0);
      }
    }

    // 4. Draw text annotations
    textItems.forEach((item) => {
      ctx.save();
      const scaledFontSize = Math.max(16, item.fontSize * (canvas.width / 900));
      ctx.font = `bold ${scaledFontSize}px sans-serif`;
      ctx.fillStyle = item.color;

      // Draw subtle shadow for readability
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      const px = item.x * canvas.width;
      const py = item.y * canvas.height;
      ctx.fillText(item.text, px, py);
      ctx.restore();
    });
  }, [filterString, strokes, textItems, imageLoaded]);

  useEffect(() => {
    if (imageLoaded) {
      redrawCanvas();
    }
  }, [imageLoaded, redrawCanvas]);

  // Coordinate normalizer (converts clientX/Y to 0..1 relative coords)
  const getNormalizedCoords = (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  // Pointer event handlers for drawing & dragging text
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Only accept primary button (left-click or touch)
    if (e.button !== 0 && e.buttons !== 1) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture unsupported
    }

    const pt = getNormalizedCoords(e);
    if (!pt) return;

    if (activeTab === 'draw') {
      isPaintingRef.current = true;
      const newStroke: Stroke = {
        id: `stroke-${Date.now()}-${Math.random()}`,
        color: strokeColor,
        width: strokeWidth,
        isEraser: isDrawingTool === 'eraser',
        points: [pt],
      };
      currentStrokeRef.current = newStroke;
      setStrokes((prev) => [...prev, newStroke]);
    } else if (activeTab === 'text') {
      // Check if user clicked near any text annotation
      const canvas = canvasRef.current;
      if (!canvas) return;
      const clickedText = textItems.find((item) => {
        const dx = Math.abs(item.x - pt.x);
        const dy = Math.abs(item.y - pt.y);
        return dx < 0.15 && dy < 0.08;
      });

      if (clickedText) {
        setSelectedTextId(clickedText.id);
        draggingTextRef.current = {
          id: clickedText.id,
          startX: pt.x,
          startY: pt.y,
          origX: clickedText.x,
          origY: clickedText.y,
        };
      } else {
        setSelectedTextId(null);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // CRITICAL FIX: If mouse button is not actively pressed down, cancel painting/dragging immediately!
    // Prevents drawing on hover or reviving undone strokes!
    if (e.buttons !== 1) {
      if (isPaintingRef.current) {
        isPaintingRef.current = false;
        currentStrokeRef.current = null;
      }
      if (draggingTextRef.current) {
        draggingTextRef.current = null;
      }
      return;
    }

    const pt = getNormalizedCoords(e);
    if (!pt) return;

    if (activeTab === 'draw' && isPaintingRef.current && currentStrokeRef.current) {
      const updatedStroke = {
        ...currentStrokeRef.current,
        points: [...currentStrokeRef.current.points, pt],
      };
      currentStrokeRef.current = updatedStroke;
      setStrokes((prev) => {
        if (prev.length === 0) return [updatedStroke];
        return [...prev.slice(0, -1), updatedStroke];
      });
    } else if (activeTab === 'text' && draggingTextRef.current) {
      const { id, startX, startY, origX, origY } = draggingTextRef.current;
      const dx = pt.x - startX;
      const dy = pt.y - startY;
      setTextItems((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, x: Math.max(0.02, Math.min(0.95, origX + dx)), y: Math.max(0.05, Math.min(0.95, origY + dy)) } : t
        )
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture unsupported
    }
    isPaintingRef.current = false;
    currentStrokeRef.current = null;
    draggingTextRef.current = null;
  };

  // Add a new text label to the canvas
  const handleAddText = () => {
    if (!newTextInput.trim()) return;
    const newItem: TextItem = {
      id: `text-${Date.now()}`,
      text: newTextInput.trim(),
      x: 0.35,
      y: 0.5,
      fontSize: textFontSize,
      color: textColor,
    };
    setTextItems((prev) => [...prev, newItem]);
    setSelectedTextId(newItem.id);
    setNewTextInput('');
  };

  // Delete selected text
  const handleDeleteText = (id: string) => {
    setTextItems((prev) => prev.filter((t) => t.id !== id));
    if (selectedTextId === id) setSelectedTextId(null);
  };

  // Undo last stroke (safely clears currentStrokeRef so hover cannot re-add it)
  const handleUndoStroke = () => {
    isPaintingRef.current = false;
    currentStrokeRef.current = null;
    setStrokes((prev) => prev.slice(0, -1));
  };

  // Clear all drawings (safely clears currentStrokeRef)
  const handleClearStrokes = () => {
    isPaintingRef.current = false;
    currentStrokeRef.current = null;
    setStrokes([]);
  };

  // Apply a preset
  const handleApplyPreset = (preset: Preset) => {
    setAdjustments({ ...preset.adjustments });
    setActivePresetId(preset.id);
  };

  // Save current adjustments as a custom preset (max 3)
  const handleSaveCustomPreset = () => {
    if (!newPresetName.trim()) return;
    if (customPresets.length >= MAX_CUSTOM_PRESETS) {
      setErrorMsg(`Maximum ${MAX_CUSTOM_PRESETS} custom presets reached. Delete one first.`);
      return;
    }

    const newPreset: Preset = {
      id: `custom-${Date.now()}`,
      name: newPresetName.trim(),
      isCustom: true,
      adjustments: { ...adjustments },
    };

    const updated = [...customPresets, newPreset];
    saveCustomPresets(updated);
    setActivePresetId(newPreset.id);
    setNewPresetName('');
    setIsNamingPreset(false);
  };

  // Delete a custom preset
  const handleDeleteCustomPreset = (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter((p) => p.id !== presetId);
    saveCustomPresets(updated);
    if (activePresetId === presetId) {
      setActivePresetId('original');
    }
  };

  // Reset all adjustments to default
  const handleResetAdjustments = () => {
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
    setActivePresetId('original');
  };

  // Export full-res image blob from canvas
  const getExportBlob = async (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
    });
  };

  // Save a copy directly into user's VaultMind drive
  const handleSaveToDrive = async () => {
    try {
      setIsSaving(true);
      setErrorMsg('');
      setSaveSuccessMsg('');

      const blob = await getExportBlob();
      if (!blob) {
        throw new Error('Failed to generate image data.');
      }

      const isRandom = isUninterpretableOrRandomName(fileName);
      const cleanBaseName = isRandom ? 'Photo' : fileName.replace(/\.[^/.]+$/, '');
      const editedFileName = `${cleanBaseName}_edited_${Date.now().toString().slice(-4)}.png`;
      const editedFile = new File([blob], editedFileName, { type: 'image/png' });

      // Upload using apiClient (passes allowDuplicate = true)
      await apiClient.uploadFile(editedFile, true);

      setSaveSuccessMsg(`Saved copy "${editedFileName}" directly into your VaultMind Drive!`);
      if (onSaved) onSaved();

      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: unknown) {
      console.error('Error saving edited image:', err);
      const message = err instanceof Error ? err.message : 'Failed to save copy to drive.';
      setErrorMsg(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Download locally as PNG
  const handleDownloadLocally = async () => {
    try {
      const blob = await getExportBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/\.[^/.]+$/, '')}_edited.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[92vh] max-h-[900px] bg-card border border-border/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-foreground">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <MagicWandIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">Photo Studio</h2>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                  Visual Editor
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-md">
                Editing: <span className="font-semibold text-foreground">{fileName}</span>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadLocally}
              className="px-3.5 py-1.5 rounded-xl bg-card border border-border hover:bg-accent text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              title="Download edited PNG to your computer"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              type="button"
              onClick={handleSaveToDrive}
              disabled={isSaving || !imageLoaded}
              className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  <span>Saving to Drive...</span>
                </>
              ) : (
                <>
                  <CheckIcon className="w-4 h-4" />
                  <span>Save Copy to Drive</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-card border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors ml-1 cursor-pointer"
              title="Close editor"
            >
              <Cross2Icon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications & Status Banner */}
        {saveSuccessMsg && (
          <div className="px-6 py-2 bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckIcon className="w-4 h-4" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="px-6 py-2 bg-destructive/15 border-b border-destructive/30 text-destructive text-xs font-semibold flex items-center justify-between animate-in fade-in">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg('')} className="underline text-[11px] cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Main Body (Split into Canvas Workspace & Tool Controls Sidebar) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Canvas Workspace */}
          <div
            ref={containerRef}
            className="flex-1 bg-black/60 relative flex items-center justify-center p-4 overflow-hidden select-none"
          >
            {!imageLoaded && (
              <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
                <span className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <span>Loading photo into Studio canvas...</span>
              </div>
            )}

            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-all duration-150 ${
                activeTab === 'draw'
                  ? 'cursor-crosshair'
                  : activeTab === 'text'
                  ? 'cursor-move'
                  : 'cursor-default'
              }`}
              style={{ touchAction: 'none' }}
            />

            {/* Quick Helper Pill */}
            <div className="absolute bottom-3 left-4 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] text-white/80 font-medium">
              {activeTab === 'adjust' && 'Adjust sliders or apply presets'}
              {activeTab === 'draw' && `Drawing with ${isDrawingTool} (stroke: ${strokeWidth}px)`}
              {activeTab === 'text' && 'Click & drag text to position anywhere on image'}
            </div>
          </div>

          {/* Right Tools & Presets Panel */}
          <div className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-border/60 bg-card/60 flex flex-col overflow-hidden">
            {/* Tool Category Tabs */}
            <div className="flex items-center p-2 gap-1.5 border-b border-border/60 bg-muted/10">
              <button
                type="button"
                onClick={() => setActiveTab('adjust')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'adjust'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <MixerHorizontalIcon className="w-3.5 h-3.5" />
                <span>Filters & Presets</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('draw')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'draw'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <Pencil1Icon className="w-3.5 h-3.5" />
                <span>Draw</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'text'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <TextIcon className="w-3.5 h-3.5" />
                <span>Add Text</span>
              </button>
            </div>

            {/* Scrollable Tool Options */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
              {/* TAB 1: FILTERS & PRESETS */}
              {activeTab === 'adjust' && (
                <div className="space-y-6">
                  {/* Built-in Presets */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Style Presets
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {BUILTIN_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleApplyPreset(preset)}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all cursor-pointer ${
                            activePresetId === preset.id
                              ? 'bg-primary/15 border-primary text-primary font-bold shadow-sm shadow-primary/10'
                              : 'bg-card border-border/70 text-foreground hover:bg-accent'
                          }`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Presets (Limited to 3 overall) */}
                  <div className="space-y-2 p-3 bg-muted/20 border border-border/60 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] font-bold text-foreground uppercase tracking-wider">
                          My Presets
                        </label>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-primary/20 text-primary font-bold">
                          {customPresets.length} / {MAX_CUSTOM_PRESETS}
                        </span>
                      </div>
                      {customPresets.length < MAX_CUSTOM_PRESETS && !isNamingPreset && (
                        <button
                          type="button"
                          onClick={() => setIsNamingPreset(true)}
                          className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <PlusIcon className="w-3 h-3" />
                          <span>Save Current</span>
                        </button>
                      )}
                    </div>

                    {/* Create Custom Preset Input */}
                    {isNamingPreset && (
                      <div className="pt-1 space-y-2 animate-in fade-in">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Preset name (e.g. Dreamy)..."
                            value={newPresetName}
                            onChange={(e) => setNewPresetName(e.target.value)}
                            maxLength={18}
                            className="flex-1 px-3 py-1.5 bg-card border border-input rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          <button
                            type="button"
                            onClick={handleSaveCustomPreset}
                            className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsNamingPreset(false)}
                            className="p-1.5 bg-card border border-border text-muted-foreground hover:text-foreground rounded-xl cursor-pointer"
                          >
                            <Cross2Icon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* List of Custom Presets */}
                    <div className="space-y-1.5 pt-1">
                      {customPresets.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic py-1">
                          No custom presets yet. Adjust sliders below and click &quot;Save Current&quot; (max 3).
                        </p>
                      ) : (
                        customPresets.map((preset) => (
                          <div
                            key={preset.id}
                            onClick={() => handleApplyPreset(preset)}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs border transition-all cursor-pointer ${
                              activePresetId === preset.id
                                ? 'bg-primary/15 border-primary text-primary font-bold'
                                : 'bg-card border-border/70 hover:bg-accent'
                            }`}
                          >
                            <span className="truncate">{preset.name}</span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteCustomPreset(preset.id, e)}
                              className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors cursor-pointer"
                              title="Delete custom preset"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Sliders Section */}
                  <div className="space-y-4 pt-1">
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Fine Adjustments
                      </label>
                      <button
                        type="button"
                        onClick={handleResetAdjustments}
                        className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 cursor-pointer"
                      >
                        <ResetIcon className="w-3 h-3" />
                        <span>Reset All</span>
                      </button>
                    </div>

                    {/* Brightness */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">Brightness</span>
                        <span className="text-muted-foreground font-mono">{adjustments.brightness}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        value={adjustments.brightness}
                        onChange={(e) => {
                          setAdjustments({ ...adjustments, brightness: Number(e.target.value) });
                          setActivePresetId('');
                        }}
                        className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Contrast */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">Contrast</span>
                        <span className="text-muted-foreground font-mono">{adjustments.contrast}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        value={adjustments.contrast}
                        onChange={(e) => {
                          setAdjustments({ ...adjustments, contrast: Number(e.target.value) });
                          setActivePresetId('');
                        }}
                        className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Saturation */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">Saturation</span>
                        <span className="text-muted-foreground font-mono">{adjustments.saturation}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        value={adjustments.saturation}
                        onChange={(e) => {
                          setAdjustments({ ...adjustments, saturation: Number(e.target.value) });
                          setActivePresetId('');
                        }}
                        className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Blur */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">Soft Blur</span>
                        <span className="text-muted-foreground font-mono">{adjustments.blur}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="16"
                        step="0.5"
                        value={adjustments.blur}
                        onChange={(e) => {
                          setAdjustments({ ...adjustments, blur: Number(e.target.value) });
                          setActivePresetId('');
                        }}
                        className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Sepia */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">Sepia Warmth</span>
                        <span className="text-muted-foreground font-mono">{adjustments.sepia}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={adjustments.sepia}
                        onChange={(e) => {
                          setAdjustments({ ...adjustments, sepia: Number(e.target.value) });
                          setActivePresetId('');
                        }}
                        className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Grayscale */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">Grayscale (B&W)</span>
                        <span className="text-muted-foreground font-mono">{adjustments.grayscale}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={adjustments.grayscale}
                        onChange={(e) => {
                          setAdjustments({ ...adjustments, grayscale: Number(e.target.value) });
                          setActivePresetId('');
                        }}
                        className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Hue Rotate */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">Hue Shift</span>
                        <span className="text-muted-foreground font-mono">{adjustments.hueRotate}°</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={adjustments.hueRotate}
                        onChange={(e) => {
                          setAdjustments({ ...adjustments, hueRotate: Number(e.target.value) });
                          setActivePresetId('');
                        }}
                        className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: DRAW ON IMAGE */}
              {activeTab === 'draw' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Drawing Tool
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsDrawingTool('pen')}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                          isDrawingTool === 'pen'
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-card border-border hover:bg-accent text-foreground'
                        }`}
                      >
                        <Pencil1Icon className="w-3.5 h-3.5" />
                        <span>Pen Brush</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsDrawingTool('eraser')}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                          isDrawingTool === 'eraser'
                            ? 'bg-destructive text-destructive-foreground border-destructive shadow-sm'
                            : 'bg-card border-border hover:bg-accent text-foreground'
                        }`}
                      >
                        <EraserIcon className="w-3.5 h-3.5" />
                        <span>Eraser</span>
                      </button>
                    </div>
                  </div>

                  {/* Stroke Color Palette */}
                  {isDrawingTool === 'pen' && (
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Stroke Color
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#ffffff', '#000000'].map(
                          (c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setStrokeColor(c)}
                              className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                                strokeColor === c
                                  ? 'border-primary scale-110 shadow-md ring-2 ring-primary/40'
                                  : 'border-white/30 hover:scale-105'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          )
                        )}
                        <input
                          type="color"
                          value={strokeColor}
                          onChange={(e) => setStrokeColor(e.target.value)}
                          className="w-7 h-7 rounded-full overflow-hidden border border-border cursor-pointer bg-transparent"
                          title="Custom Color"
                        />
                      </div>
                    </div>
                  )}

                  {/* Brush Size Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">Stroke Thickness</span>
                      <span className="text-muted-foreground font-mono">{strokeWidth}px</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="36"
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(Number(e.target.value))}
                      className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Undo & Clear Buttons */}
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUndoStroke}
                      disabled={strokes.length === 0}
                      className="flex-1 py-2 rounded-xl bg-card border border-border hover:bg-accent text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <ResetIcon className="w-3.5 h-3.5" />
                      <span>Undo Stroke ({strokes.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleClearStrokes}
                      disabled={strokes.length === 0}
                      className="py-2 px-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
                      title="Clear all drawings"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: ADD TEXT ON IMAGE */}
              {activeTab === 'text' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      New Text Caption
                    </label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Type text to place..."
                        value={newTextInput}
                        onChange={(e) => setNewTextInput(e.target.value)}
                        className="w-full px-3 py-2 bg-card border border-input rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="text-xs text-muted-foreground font-medium">Color:</span>
                          <input
                            type="color"
                            value={textColor}
                            onChange={(e) => setTextColor(e.target.value)}
                            className="w-7 h-7 rounded-lg overflow-hidden border border-border cursor-pointer bg-transparent"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleAddText}
                          disabled={!newTextInput.trim()}
                          className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                        >
                          Place Text
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Font Size Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">Font Size</span>
                      <span className="text-muted-foreground font-mono">{textFontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="72"
                      value={textFontSize}
                      onChange={(e) => setTextFontSize(Number(e.target.value))}
                      className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Active Text Labels List */}
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Active Text Items ({textItems.length})
                    </label>
                    {textItems.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">
                        No text items placed yet. Type above and click &quot;Place Text&quot;, then drag it on the image.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {textItems.map((item) => (
                          <div
                            key={item.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                              selectedTextId === item.id
                                ? 'bg-primary/10 border-primary font-semibold text-primary'
                                : 'bg-card border-border/70 text-foreground'
                            }`}
                          >
                            <span className="truncate max-w-[170px]" style={{ color: item.color }}>
                              &ldquo;{item.text}&rdquo;
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteText(item.id)}
                                className="p-1 hover:text-destructive text-muted-foreground transition-colors cursor-pointer"
                                title="Remove text"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

