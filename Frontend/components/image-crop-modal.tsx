"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Modal } from "@/components/modal";

export type CropAspectRatio = "square" | "cover" | "food";

interface ImageCropModalProps {
  open: boolean;
  imageSrc: string | null;
  originalFile?: File | null;
  aspectRatio?: CropAspectRatio; // square (1:1), cover (16:9), food (4:3)
  title?: string;
  onClose: () => void;
  onCropComplete: (file: File) => void;
}

export function ImageCropModal({
  open,
  imageSrc,
  originalFile,
  aspectRatio = "square",
  title = "Picture Preview & Crop Options",
  onClose,
  onCropComplete,
}: ImageCropModalProps) {
  const [mode, setMode] = useState<"full" | "crop">("full");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom, pan, and mode when a new image is loaded
  useEffect(() => {
    if (open) {
      setMode("full");
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsDragging(false);
      setImageMeta(null);
    }
  }, [open, imageSrc]);

  // Determine crop box dimensions in pixels inside the modal container
  const boxWidth = 340;
  const boxHeight =
    aspectRatio === "cover" ? 190 : aspectRatio === "food" ? 240 : 340;

  // Handle Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== "crop") return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || mode !== "crop") return;
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart, mode]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (mode !== "crop" || e.touches.length !== 1) return;
    setIsDragging(true);
    setDragStart({
      x: e.touches[0].clientX - pan.x,
      y: e.touches[0].clientY - pan.y,
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || mode !== "crop" || e.touches.length !== 1) return;
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Handler for uploading the full, original resolution file directly (No Crop)
  const handleUseFullPicture = async () => {
    if (originalFile) {
      onCropComplete(originalFile);
      onClose();
      return;
    }

    // Fallback if original File object is not available: convert imageSrc data URL to full resolution File
    if (!imageRef.current) return;
    setIsExporting(true);
    try {
      const img = imageRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 1200;
      canvas.height = img.naturalHeight || 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas context");
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setIsExporting(false);
            return;
          }
          const fullFile = new File([blob], "full_image.jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          onCropComplete(fullFile);
          setIsExporting(false);
          onClose();
        },
        "image/jpeg",
        0.95
      );
    } catch {
      setIsExporting(false);
    }
  };

  // Perform Crop on Canvas at Natural Resolution and Export as JPEG File
  const handleCrop = async () => {
    if (!imageRef.current) return;
    setIsExporting(true);

    try {
      const img = imageRef.current;
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;

      // Preserve full native image resolution (up to 3840px 4K width)
      const targetWidth = Math.min(Math.max(naturalWidth, boxWidth), 3840);
      const targetHeight = Math.round((targetWidth * boxHeight) / boxWidth);

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("Could not create canvas context");

      // Clean background fill
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // In crop mode, base scale fits the whole image inside the crop window so user can zoom in or out
      const baseScale = Math.max(boxWidth / naturalWidth, boxHeight / naturalHeight);
      const currentScale = baseScale * zoom;

      // Position in preview box coordinates
      const renderedWidth = naturalWidth * currentScale;
      const renderedHeight = naturalHeight * currentScale;

      const centerOffsetX = (boxWidth - renderedWidth) / 2 + pan.x;
      const centerOffsetY = (boxHeight - renderedHeight) / 2 + pan.y;

      // Scale to target canvas coordinates
      const targetScaleFactor = targetWidth / boxWidth;

      const destX = centerOffsetX * targetScaleFactor;
      const destY = centerOffsetY * targetScaleFactor;
      const destWidth = renderedWidth * targetScaleFactor;
      const destHeight = renderedHeight * targetScaleFactor;

      ctx.drawImage(img, destX, destY, destWidth, destHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setIsExporting(false);
            return;
          }
          const croppedFile = new File([blob], "cropped_image.jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          onCropComplete(croppedFile);
          setIsExporting(false);
          onClose();
        },
        "image/jpeg",
        0.95
      );
    } catch {
      setIsExporting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4 select-none">
        {/* Mode Selector Tabs */}
        <div className="flex items-center justify-between gap-2 border-b border-black/10 pb-3">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode("full");
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                mode === "full"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🖼️ Full Picture (Recommended)
            </button>
            <button
              type="button"
              onClick={() => setMode("crop")}
              className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                mode === "crop"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              ✂️ Crop & Scale
            </button>
          </div>

          {imageMeta && (
            <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
              {imageMeta.width} × {imageMeta.height} px
            </span>
          )}
        </div>

        {/* Viewport Frame */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ width: "100%", height: `${boxHeight + 40}px` }}
          className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-slate-950 ${
            mode === "crop" ? "cursor-grab active:cursor-grabbing touch-none" : ""
          }`}
        >
          {/* Ambient blur backdrop */}
          {imageSrc && (
            <img
              src={imageSrc}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover blur-2xl opacity-30 scale-110 pointer-events-none select-none"
            />
          )}

          {/* Underlying Image */}
          {imageSrc && (
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Preview"
              onLoad={(e) => {
                const img = e.currentTarget;
                setImageMeta({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              draggable={false}
              style={
                mode === "crop"
                  ? {
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transition: isDragging ? "none" : "transform 0.05s ease-out",
                      maxWidth: "none",
                      maxHeight: "none",
                    }
                  : {
                      maxHeight: `${boxHeight + 20}px`,
                      maxWidth: "92%",
                    }
              }
              className={`select-none ${
                mode === "crop"
                  ? "pointer-events-none absolute origin-center max-w-none object-contain"
                  : "relative z-10 object-contain drop-shadow-md rounded-lg"
              }`}
            />
          )}

          {/* Mask / Cutout frame showing visible website window (Only in crop mode) */}
          {mode === "crop" && (
            <div
              style={{ width: `${boxWidth}px`, height: `${boxHeight}px` }}
              className={`pointer-events-none absolute border-2 border-amber-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.7)] ${
                aspectRatio === "square" ? "rounded-3xl" : "rounded-2xl"
              }`}
            >
              {/* Rule of thirds grid lines */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20 border border-white/40">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>

              {/* Corner Indicators */}
              <div className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-amber-400" />
              <div className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-amber-400" />
              <div className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-amber-400" />
              <div className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-amber-400" />
            </div>
          )}
        </div>

        {/* Informative description */}
        {mode === "full" ? (
          <p className="text-xs text-slate-500">
            The entire picture will be displayed fully in its full native resolution, scaled to the site area without cropping.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Drag to reposition and use the zoom slider below to frame the image. The cropped portion will be saved in full high definition.
          </p>
        )}

        {/* Zoom Scale Controls (Active only in crop mode) */}
        {mode === "crop" && (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-black/5 p-3">
            <span className="text-xs font-semibold text-slate-600">Zoom</span>
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.max(0.6, prev - 0.2))}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 cursor-pointer"
            >
              -
            </button>
            <input
              type="range"
              min="0.6"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-amber-500 cursor-pointer"
            >
            </input>
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.min(3, prev + 0.2))}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 cursor-pointer"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="text-[11px] font-semibold text-amber-700 hover:underline px-1 cursor-pointer"
            >
              Reset
            </button>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-black/5">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {mode === "crop" ? (
              <>
                <button
                  type="button"
                  onClick={handleUseFullPicture}
                  disabled={isExporting}
                  className="rounded-full border border-amber-300 bg-amber-50 hover:bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-900 transition cursor-pointer"
                >
                  Upload Full Picture Instead
                </button>
                <button
                  type="button"
                  onClick={handleCrop}
                  disabled={isExporting}
                  className="rounded-full bg-amber-500 hover:bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {isExporting ? "Processing..." : "Crop & Upload"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMode("crop")}
                  disabled={isExporting}
                  className="rounded-full border border-black/10 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 transition cursor-pointer"
                >
                  ✂️ Crop / Frame
                </button>
                <button
                  type="button"
                  onClick={handleUseFullPicture}
                  disabled={isExporting}
                  className="rounded-full bg-amber-500 hover:bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isExporting ? "Uploading..." : "✓ Upload Full Picture"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
