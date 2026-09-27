"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Modal } from "@/components/modal";

export type CropAspectRatio = "square" | "cover" | "food";

interface ImageCropModalProps {
  open: boolean;
  imageSrc: string | null;
  aspectRatio?: CropAspectRatio; // square (1:1), cover (16:9), food (4:3)
  title?: string;
  onClose: () => void;
  onCropComplete: (croppedFile: File) => void;
}

export function ImageCropModal({
  open,
  imageSrc,
  aspectRatio = "square",
  title = "Scale & Position Photo",
  onClose,
  onCropComplete,
}: ImageCropModalProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isExporting, setIsExporting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom and pan when a new image is loaded
  useEffect(() => {
    if (open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [open, imageSrc]);

  // Determine crop box dimensions in pixels inside the modal container
  const boxWidth = 320;
  const boxHeight =
    aspectRatio === "cover" ? 180 : aspectRatio === "food" ? 220 : 320;

  // Handle Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Perform Crop on Canvas and Export as JPEG File
  const handleCrop = async () => {
    if (!imageRef.current) return;
    setIsExporting(true);

    try {
      const img = imageRef.current;
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;

      // Desired output resolution
      const targetWidth = aspectRatio === "cover" ? 1200 : aspectRatio === "food" ? 800 : 600;
      const targetHeight = Math.round((targetWidth * boxHeight) / boxWidth);

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("Could not create canvas context");

      // Background fill in case of edge transparency
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Compute transformation from preview display to target canvas
      // When zoom = 1, the image fills the crop box by its minimum dimension
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

      // Convert canvas to Blob
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
        0.92
      );
    } catch {
      setIsExporting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4 select-none">
        <p className="text-xs text-slate-500">
          Drag to position and use the scale slider to adjust which portion will be displayed on the website.
        </p>

        {/* Viewport Frame with Dark Mask */}
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
          className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-slate-900 cursor-grab active:cursor-grabbing touch-none"
        >
          {/* Underlying Image being dragged and scaled */}
          {imageSrc && (
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop preview"
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: isDragging ? "none" : "transform 0.05s ease-out",
                maxWidth: "none",
                maxHeight: "none",
              }}
              className="pointer-events-none absolute origin-center max-w-none select-none object-contain"
            />
          )}

          {/* Mask / Cutout frame showing visible website window */}
          <div
            style={{ width: `${boxWidth}px`, height: `${boxHeight}px` }}
            className={`pointer-events-none absolute border-2 border-amber-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.65)] ${
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
        </div>

        {/* Zoom Scale Controls */}
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-black/5 p-3">
          <span className="text-xs font-semibold text-slate-600">Zoom</span>
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.max(1, prev - 0.2))}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 cursor-pointer"
          >
            -
          </button>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 accent-amber-500 cursor-pointer"
          />
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

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCrop}
            disabled={isExporting}
            className="rounded-full bg-amber-500 hover:bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            {isExporting ? "Processing..." : "Crop & Upload"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
