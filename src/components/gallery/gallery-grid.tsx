"use client";

import { useState } from "react";
import Image from "next/image";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Trash2 } from "lucide-react";

import type { ImageWithTags } from "@/lib/db";
import type { ImageSize } from "@/components/gallery/tag-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

function getImageUrl(key: string, fallback: string) {
  if (!BASE_URL) return fallback;
  return `${BASE_URL.replace(/\/$/, "")}/${key}`;
}

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
  const gridClasses = {
    small: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6",
    medium: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
    large: "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3",
  };

  return (
    <>
      <div className="mb-4 rounded-lg border-2 border-dashed border-primary bg-primary/5 p-4 text-center">
        <p className="text-sm font-medium text-primary">
          🎯 Ziehe Bilder in die Container auf der rechten Seite um Tags zuzuweisen
        </p>
      </div>
      <div 
        className={cn("grid gap-4", gridClasses[imageSize])}
        style={{ perspective: '1000px' }}
      >
        {images.map((image) => (
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
}: SortableImageCardProps) {
  const { listeners, setNodeRef, transform, transition, attributes, isDragging } = useSortable({
    id: image.id,
    transition: {
      duration: 350,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  });

  // Track click position to detect if it was a drag or click
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Prüfe ob Bild innerhalb der letzten Stunde hochgeladen wurde
  const canDeleteImage = () => {
    if (isAdmin) return false; // Admins brauchen diesen Button nicht
    const uploadTime = new Date(image.created_at).getTime();
    const now = Date.now();
    const oneHourInMs = 60 * 60 * 1000;
    return (now - uploadTime) < oneHourInMs;
  };

  const isDeletable = canDeleteImage();

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

  // Berechne Neigung basierend auf Position
  const getTiltStyle = () => {
    if (!transform) return {};
    
    const { x, y } = transform;
    
    // Simple tilt basierend auf Position
    const tiltX = y / 20;
    const tiltY = -x / 20;
    
    return {
      transform: isDragging
        ? `translate3d(${x}px, ${y}px, 0) scale(0.55) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`
        : CSS.Transform.toString(transform),
      transition: isDragging 
        ? 'none'
        : transition || 'transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
    };
  };

  const style = {
    ...getTiltStyle(),
    opacity: (isDragging || isBeingDragged) ? 0.3 : 1,
    zIndex: isDragging ? 9999 : 'auto',
    willChange: isDragging ? 'transform' : 'auto',
  };

  const fallback = `https://dummyimage.com/600x400/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
  const imageUrl = getImageUrl(image.key, fallback);

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

        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={imageUrl}
            alt={image.filename}
            fill
            draggable={false}
            className="object-cover transition-transform duration-300 group-hover:scale-105 select-none pointer-events-none"
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
