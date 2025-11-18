"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Heart, X, Download } from "lucide-react";
import type { ImageWithTags, TagRecord } from "@/lib/db";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { ImageDetailDialog } from "@/components/gallery/image-detail-dialog";
import { ImageFullscreenMobile } from "@/components/gallery/image-fullscreen-mobile";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

function getImageUrl(key: string, fallback: string) {
  if (!BASE_URL) return fallback;
  return `${BASE_URL.replace(/\/$/, "")}/${key}`;
}

type LikedGalleryViewProps = {
  images: ImageWithTags[];
  availableTags: TagRecord[];
};

export function LikedGalleryView({ images, availableTags }: LikedGalleryViewProps) {
  const [selectedImage, setSelectedImage] = useState<ImageWithTags | null>(null);
  const [localImages, setLocalImages] = useState(images);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle unlike (remove from view optimistically)
  const handleUnlike = async (imageId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    try {
      const response = await fetch(`/api/images/${imageId}/like`, {
        method: "POST",
      });
      
      if (response.ok) {
        // Remove from local state
        setLocalImages(prev => prev.filter(img => img.id !== imageId));
        
        // Close modal if this image was selected
        if (selectedImage?.id === imageId) {
          setSelectedImage(null);
        }
      }
    } catch (error) {
      console.error("Error unliking image:", error);
    }
  };

  const handleSave = async (id: string, data: { tags?: string[]; imagename?: string }) => {
    try {
      const response = await fetch(`/api/images/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        // Update local state
        setLocalImages(prev => prev.map(img => {
          if (img.id === id) {
            return {
              ...img,
              imagename: data.imagename || img.imagename,
              tags: data.tags 
                ? data.tags.map(tagName => {
                    const existingTag = availableTags.find(t => t.name === tagName);
                    return existingTag || { id: tagName, name: tagName };
                  })
                : img.tags
            };
          }
          return img;
        }));
        
        // Update selected image if it's the one being edited
        if (selectedImage?.id === id) {
          setSelectedImage(prev => prev ? {
            ...prev,
            imagename: data.imagename || prev.imagename,
            tags: data.tags 
              ? data.tags.map(tagName => {
                  const existingTag = availableTags.find(t => t.name === tagName);
                  return existingTag || { id: tagName, name: tagName };
                })
              : prev.tags
          } : null);
        }
        
        setSelectedImage(null);
      }
    } catch (error) {
      console.error("Error updating image:", error);
    }
  };

  if (localImages.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border p-16 text-center">
        <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-xl font-semibold mb-2">Noch keine gelikten Bilder</h3>
        <p className="text-muted-foreground">
          Klicke auf das Herz-Icon bei einem Bild, um es zu deinen Favoriten hinzuzufügen.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {localImages.map((image) => (
          <LikedImageCard
            key={image.id}
            image={image}
            onSelect={() => setSelectedImage(image)}
            onUnlike={(e) => handleUnlike(image.id, e)}
          />
        ))}
      </div>

      {/* Desktop: Detail Dialog mit allen Funktionen */}
      {!isMobile && selectedImage && (
        <ImageDetailDialog
          image={selectedImage}
          onOpenChange={(open) => {
            if (!open) setSelectedImage(null);
          }}
          onSave={handleSave}
          availableTags={availableTags}
        />
      )}

      {/* Mobile: Einfache Vollbildansicht */}
      {isMobile && (
        <ImageFullscreenMobile
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
          availableTags={availableTags}
          onSave={handleSave}
          onNavigate={(direction) => {
            if (!selectedImage) return;
            const currentIndex = localImages.findIndex(img => img.id === selectedImage.id);
            if (currentIndex === -1) return;
            
            const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
            if (newIndex >= 0 && newIndex < localImages.length) {
              setSelectedImage(localImages[newIndex]);
            }
          }}
          hasPrev={selectedImage ? localImages.findIndex(img => img.id === selectedImage.id) > 0 : false}
          hasNext={selectedImage ? localImages.findIndex(img => img.id === selectedImage.id) < localImages.length - 1 : false}
        />
      )}
    </>
  );
}

type LikedImageCardProps = {
  image: ImageWithTags;
  onSelect: () => void;
  onUnlike: (e: React.MouseEvent) => void;
};

function LikedImageCard({ image, onSelect, onUnlike }: LikedImageCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isUnliking, setIsUnliking] = useState(false);

  const handleUnlikeClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUnliking(true);
    await onUnlike(e);
    setIsUnliking(false);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
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

  const fallback = `https://dummyimage.com/600x400/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
  const imageUrl = getImageUrl(image.key, fallback);

  return (
    <article
      onClick={onSelect}
      className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:shadow-md cursor-pointer"
    >
      {/* Action Buttons */}
      <div
        className="absolute top-2 right-2 z-10 flex gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleDownload}
          className={cn(
            "rounded-full p-2 backdrop-blur-sm transition-all duration-200",
            "bg-background/80 hover:bg-background hover:scale-110",
            "text-primary hover:text-primary"
          )}
          title="Herunterladen"
        >
          <Download className="h-5 w-5" />
        </button>
        <button
          onClick={handleUnlikeClick}
          disabled={isUnliking}
          className={cn(
            "rounded-full p-2 backdrop-blur-sm transition-all duration-200",
            "bg-background/80 hover:bg-background hover:scale-110",
            "text-red-500"
          )}
          title="Unlike"
        >
          <Heart 
            className={cn("h-5 w-5 fill-red-500", isUnliking && "opacity-50")} 
          />
        </button>
      </div>

      {/* Image */}
      <div className="relative aspect-square overflow-hidden">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-muted animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
          </div>
        )}
        
        <Image
          src={imageUrl}
          alt={image.filename}
          fill
          className={cn(
            "object-cover transition-all duration-300",
            imageLoaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setImageLoaded(true)}
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
        />
      </div>

      {/* Tags */}
      {image.tags.length > 0 && (
        <div className="p-3 border-t bg-card/50 backdrop-blur-sm">
          <div className="flex flex-wrap gap-1.5">
            {image.tags.slice(0, 3).map((tag) => (
              <Badge 
                key={tag.id} 
                variant="secondary" 
                className="text-xs"
              >
                {tag.name}
              </Badge>
            ))}
            {image.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{image.tags.length - 3}
              </Badge>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
