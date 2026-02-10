"use client";

import { useState } from "react";
import Image from "next/image";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Trash2, Heart, Download } from "lucide-react";

import type { ImageWithTags } from "@/lib/db";
import type { ImageSize } from "@/components/gallery/tag-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { getImageVariantKey, buildImageUrl } from "@/lib/image-variants-utils";
import { getDemoImageUrl } from "@/lib/demo-mode";
import { env } from "@/lib/env";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

type GalleryGridProps = {
  images: ImageWithTags[];
  onSelectImage: (image: ImageWithTags) => void;
  onDeleteImage?: (imageId: string) => void;
  isReordering: boolean;
  isAdmin?: boolean;
  selectedImageIds?: Set<string>;
  onToggleSelection?: (imageId: string) => void;
  containerMode?: boolean;
  activeId?: string | null;
  imageSize?: ImageSize;
  demoMode?: boolean;
};

export function GalleryGrid({ 
  images, 
  onSelectImage,
  onDeleteImage,
  isReordering,
  isAdmin = false,
  selectedImageIds = new Set(),
  onToggleSelection,
  containerMode = false,
  activeId = null,
  imageSize = "medium",
  demoMode = false,
}: GalleryGridProps) {
  // Auswahlmodus ist aktiv, wenn mindestens ein Bild ausgewählt ist
  const isSelectionMode = selectedImageIds.size > 0;
  if (images.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
        Noch keine Bilder. Lade erste Dateien hoch, um zu starten.
      </div>
    );
  }

  // Bestimme die Grid-Klassen basierend auf der Bildgröße
  // small = viele kleine Kacheln, medium = mittlere Größe, large = 1 Bild pro Reihe
  const gridClasses = {
    small: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
    medium: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
    large: "grid-cols-1",
  };

  return (
    <>
      {/* Info-Box nur auf Desktop anzeigen */}
      <div className="mb-3 md:mb-4 rounded-lg border-2 border-dashed border-primary bg-primary/5 p-3 md:p-4 text-center hidden md:block">
        <p className="text-sm font-medium text-primary">
          🎯 Ziehe Bilder in die Container auf der rechten Seite um Tags zuzuweisen
        </p>
      </div>
      <div 
        className={cn("grid gap-2 md:gap-4", gridClasses[imageSize])}
        style={{ perspective: '1000px' }}
      >
        {images.map((image, index) => (
          <SortableImageCard
            key={image.id}
            image={image}
            onSelect={() => onSelectImage(image)}
            onDelete={onDeleteImage}
            isReordering={isReordering}
            isAdmin={isAdmin}
            isSelected={selectedImageIds.has(image.id)}
            onToggleSelection={onToggleSelection}
            isBeingDragged={activeId !== null && selectedImageIds.has(image.id)}
            isSelectionMode={isSelectionMode}
            demoMode={demoMode}
            imageIndex={index}
          />
        ))}
      </div>
    </>
  );
}

type SortableImageCardProps = {
  image: ImageWithTags;
  onSelect: () => void;
  isReordering: boolean;
  isAdmin?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (imageId: string) => void;
  onDelete?: (imageId: string) => void;
  isBeingDragged?: boolean;
  isSelectionMode?: boolean;
  demoMode?: boolean;
  imageIndex?: number;
};

function SortableImageCard({ 
  image, 
  onSelect, 
  isReordering,
  isAdmin = false,
  isSelected = false,
  onToggleSelection,
  onDelete,
  isBeingDragged = false,
  isSelectionMode = false,
  demoMode = false,
  imageIndex = 0,
}: SortableImageCardProps) {
  const { listeners, setNodeRef, transform, transition, attributes, isDragging } = useSortable({
    id: image.id,
    // Keine Transition - Bilder bewegen sich nicht mehr automatisch
    transition: null,
  });

  // Track click position to detect if it was a drag or click
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLiked, setIsLiked] = useState(image.is_liked || false);
  const [isLiking, setIsLiking] = useState(false);

  // Prüfe ob Bild innerhalb der letzten Stunde hochgeladen wurde
  const canDeleteImage = () => {
    if (isAdmin) return false; // Admins brauchen diesen Button nicht
    const uploadTime = new Date(image.created_at).getTime();
    const now = Date.now();
    const oneHourInMs = 60 * 60 * 1000;
    return (now - uploadTime) < oneHourInMs;
  };

  const isDeletable = canDeleteImage();

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isLiking || image.is_liked === undefined) return;
    
    setIsLiking(true);
    
    // Optimistic update
    setIsLiked(!isLiked);
    
    try {
      const response = await fetch(`/api/images/${image.id}/like`, {
        method: "POST",
      });
      
      if (!response.ok) {
        // Revert on error
        setIsLiked(isLiked);
      }
    } catch (error) {
      // Revert on error
      setIsLiked(isLiked);
    } finally {
      setIsLiking(false);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Always download original, not variant
      const imageUrl = `${process.env.NEXT_PUBLIC_MINIO_BASE_URL}/${image.key}`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = image.imagename || image.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading image:", error);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setMouseDownPos({ x: e.clientX, y: e.clientY });
  };

  const handleClick = (e: React.MouseEvent) => {
    // Calculate distance moved since mousedown
    if (mouseDownPos) {
      const distance = Math.sqrt(
        Math.pow(e.clientX - mouseDownPos.x, 2) + 
        Math.pow(e.clientY - mouseDownPos.y, 2)
      );
      
      // If moved more than 10px, it was a drag, not a click
      if (distance > 10) {
        e.preventDefault();
        e.stopPropagation();
        setMouseDownPos(null);
        return;
      }
    }
    
    setMouseDownPos(null);
    
    // Wenn Auswahlmodus aktiv ist, immer zur Auswahl hinzufügen/entfernen
    if (isSelectionMode && onToggleSelection) {
      onToggleSelection(image.id);
    } else {
      // Ansonsten Detail-Modal öffnen
      onSelect();
    }
  };

  // Keine Transformation mehr - Bild bleibt an ursprünglicher Position
  const style = {
    opacity: (isDragging || isBeingDragged) ? 0.3 : 1,
    zIndex: isDragging ? 9999 : 'auto',
  };

  const fallback = `https://dummyimage.com/600x400/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
  const timestamp = image.updated_at || image.created_at;
  const gridKey = getImageVariantKey(image.key, 'grid', image.variant_status);
  
  // Use demo image if demo mode is enabled
  const imageUrl = demoMode 
    ? getDemoImageUrl(imageIndex)
    : buildImageUrl(BASE_URL, gridKey, fallback, timestamp);

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200",
        isDragging ? "ring-2 ring-primary shadow-2xl cursor-grabbing" : "hover:shadow-md cursor-grab",
        isSelected ? "ring-2 ring-blue-500" : "",
      )}
    >
      <div className="relative">
        {/* Checkbox - links oben */}
        {onToggleSelection && (
          <div
            className="absolute top-2 left-2 z-10"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelection(image.id)}
              className="h-5 w-5 cursor-pointer rounded border-2 border-border bg-background/80 hover:bg-background checked:bg-blue-600 checked:border-blue-600"
            />
          </div>
        )}

        {/* Like & Download Buttons - rechts oben */}
        {image.is_liked !== undefined && (
          <div
            className="absolute top-2 right-2 z-10 flex flex-col gap-1.5 md:gap-2"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleLike}
              disabled={isLiking}
              className={cn(
                "rounded-full p-2 md:p-2 backdrop-blur-sm transition-all duration-200 touch-manipulation active:scale-90",
                "bg-background/90 md:bg-background/80 hover:bg-background hover:scale-110",
                isLiked ? "text-red-500" : "text-muted-foreground hover:text-red-500",
                "shadow-md md:shadow-sm"
              )}
              title={isLiked ? "Unlike" : "Like"}
            >
              <Heart 
                className={cn("h-5 w-5 md:h-5 md:w-5", isLiked && "fill-red-500")} 
              />
            </button>
            
            {/* Download Button */}
            <button
              onClick={handleDownload}
              className={cn(
                "rounded-full p-2 md:p-2 backdrop-blur-sm transition-all duration-200 touch-manipulation active:scale-90",
                "bg-background/90 md:bg-background/80 hover:bg-background hover:scale-110",
                "text-primary hover:text-primary",
                "shadow-md md:shadow-sm"
              )}
              title="Herunterladen"
            >
              <Download className="h-5 w-5 md:h-5 md:w-5" />
            </button>
          </div>
        )}

        <div className="relative aspect-[4/3] overflow-hidden">
          {/* Loading Spinner */}
          {!imageLoaded && (
            <div className="absolute inset-0 bg-muted/50 flex items-center justify-center">
              <div className="relative">
                <div className="h-8 w-8 rounded-full border-4 border-muted-foreground/20 border-t-primary animate-spin" />
              </div>
            </div>
          )}
          
          <Image
            src={imageUrl}
            alt={image.filename}
            fill
            draggable={false}
            unoptimized // Disable Next.js optimization for better error handling
            className={cn(
              "object-cover transition-all duration-300 select-none pointer-events-none",
              imageLoaded ? "opacity-100 group-hover:scale-105" : "opacity-0"
            )}
            sizes="(max-width: 640px) 150px, (max-width: 768px) 200px, (max-width: 1024px) 250px, 300px"
            quality={50}
            loading="lazy"
            placeholder="blur"
            blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
            onLoad={() => setImageLoaded(true)}
          />
          {isReordering ? (
            <div className="absolute inset-0 bg-black/20" />
          ) : null}
        </div>
        <div className="space-y-2 p-4 text-left">
          <div className="space-y-1">
            {image.imagename && (
              <div className="text-sm font-semibold text-foreground truncate">
                {image.imagename}
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className={cn(
                "truncate pr-2",
                image.imagename ? "text-xs text-muted-foreground" : "font-medium text-foreground"
              )}>
                {image.filename}
              </span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(image.created_at).toLocaleDateString("de-DE")}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2 flex-1 min-w-0">
              {image.tags.length > 0 ? (
                image.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary">
                    {tag.name}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">Keine Tags</span>
              )}
            </div>
            {isDeletable && onDelete && (
              <>
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setMouseDownPos(null); // Reset mouse position tracking
                          setShowDeleteConfirm(true);
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setMouseDownPos(null); // Prevent click detection
                        }}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="z-[10000]">
                      <p className="text-xs">Bilder können innerhalb 1 Stunde nach Upload gelöscht werden</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <ConfirmDialog
                  open={showDeleteConfirm}
                  onOpenChange={setShowDeleteConfirm}
                  title="Bild löschen"
                  description="Möchtest du dieses Bild wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
                  confirmText="Löschen"
                  cancelText="Abbrechen"
                  variant="destructive"
                  onConfirm={() => onDelete(image.id)}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
