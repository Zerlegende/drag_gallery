"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Plus, Trash2, ChevronsDownUp, ChevronsUpDown, Pencil, Heart, Download, Maximize2 } from "lucide-react";
import Image from "next/image";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ImageWithTags, TagRecord } from "@/lib/db";
import { env } from "@/lib/env";
import { useSidebar } from "@/components/sidebar-context";
import { useToast } from "@/components/ui/toast";
import { useSession } from "next-auth/react";
import { getExpandedTags, saveExpandedTags } from "@/lib/user-preferences";
import { ImageDetailDialog } from "./image-detail-dialog";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

function getImageUrl(key: string, fallback: string) {
  if (!BASE_URL) return fallback;
  return `${BASE_URL.replace(/\/$/, "")}/${key}`;
}

type ContainerPanelProps = {
  tags: TagRecord[];
  images: ImageWithTags[];
  onRemoveImageFromTag: (imageId: string, tagId: string) => void;
  containerMode: boolean;
  onTagCreated?: () => void;
  onTagDeleted?: () => void;
};

export function ContainerPanel({
  tags,
  images,
  onRemoveImageFromTag,
  containerMode,
  onTagCreated,
  onTagDeleted,
}: ContainerPanelProps) {
  const { rightSidebarOpen: contextOpen, setRightSidebarOpen: setContextOpen } = useSidebar();
  const { showToast } = useToast();
  const { data: session } = useSession();
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<{ id: string; name: string } | null>(null);
  const [expandedTags, setExpandedTags] = useState<Record<string, boolean>>({}); // Start leer für SSR
  const [isHydrated, setIsHydrated] = useState(false); // Track hydration status
  const [isMounted, setIsMounted] = useState(false); // Track wenn Component mounted ist
  const [expandedContainer, setExpandedContainer] = useState<{ tag: TagRecord; images: ImageWithTags[] } | null>(null);
  
  // Warte bis Component mounted ist, dann verwende Context-Wert
  const localOpen = isMounted ? contextOpen : false;
  
  // Wrapper für setRightSidebarOpen
  const setRightSidebarOpen = (open: boolean) => {
    setContextOpen(open);
  };

  const isAdmin = (session?.user as any)?.role === "admin";

  // Track wenn Component mounted ist
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Lade Tag-Zustände aus Cookie nach Hydration
  useEffect(() => {
    setExpandedTags(getExpandedTags(tags.map(t => t.id)));
    setIsHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Nur beim Mount

  // Speichere Tag-Zustände im Cookie, wenn sie sich ändern (aber nur nach Hydration)
  useEffect(() => {
    if (isHydrated) {
      saveExpandedTags(expandedTags);
    }
  }, [expandedTags, isHydrated]);

  // Aktualisiere expandedTags, wenn neue Tags hinzukommen (nur nach Hydration)
  useEffect(() => {
    if (!isHydrated) return; // Warte bis Hydration abgeschlossen ist
    
    const currentTagIds = tags.map(t => t.id);
    const savedStates = getExpandedTags(currentTagIds);
    
    // Prüfe ob neue Tags hinzugekommen sind
    const hasNewTags = currentTagIds.some(id => !(id in expandedTags));
    
    if (hasNewTags) {
      setExpandedTags(savedStates);
    }
  }, [tags, isHydrated, expandedTags]);

  const toggleAllTags = () => {
    const allExpanded = Object.values(expandedTags).every(v => v);
    const newState = tags.reduce((acc, tag) => ({ ...acc, [tag.id]: !allExpanded }), {});
    setExpandedTags(newState);
  };

  const toggleTag = (tagId: string) => {
    setExpandedTags(prev => ({ ...prev, [tagId]: !prev[tagId] }));
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      showToast("warning", "Bitte gib einen Tag-Namen ein");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Erstellen des Tags");
      }

      showToast("success", "Tag erfolgreich erstellt");
      setNewTagName("");
      setIsAddingTag(false);
      onTagCreated?.();
    } catch (error) {
      showToast("error", "Fehler beim Erstellen des Tags");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTag = async (tagId: string, tagName: string) => {
    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Fehler beim Löschen des Tags");
      }

      showToast("success", "Tag erfolgreich gelöscht");
      onTagDeleted?.();
    } catch (error) {
      showToast("error", "Fehler beim Löschen des Tags");
    }
  };

  const confirmDeleteTag = () => {
    if (tagToDelete) {
      handleDeleteTag(tagToDelete.id, tagToDelete.name);
      setTagToDelete(null);
    }
  };

  return (
    <>
      {/* Mobile: Floating Button */}
      <button
        onClick={() => setRightSidebarOpen(!localOpen)}
        className={cn(
          "fixed bottom-4 right-4 z-40 p-3 rounded-full bg-primary text-primary-foreground shadow-lg md:hidden",
          "hover:scale-110 active:scale-95 transition-transform"
        )}
        aria-label="Toggle Container Panel"
      >
        {localOpen ? <ChevronRight className="h-6 w-6" /> : <ChevronLeft className="h-6 w-6" />}
      </button>

      {/* Mobile: Overlay */}
      {localOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setRightSidebarOpen(false)}
        />
      )}

      {/* Panel */}
      <aside 
        className={cn(
          "fixed top-0 right-0 h-screen bg-background border-l border-border shadow-lg transition-all duration-300 z-30 flex flex-col",
          // Mobile: Full width when open, hidden when closed
          "w-full md:w-80",
          localOpen ? "translate-x-0" : "translate-x-full md:translate-x-0",
          // Desktop: Normal behavior
          !localOpen && "md:w-16"
        )}
      >
        {/* Toggle Button - Desktop only */}
        <div className="hidden md:flex h-14 items-center justify-center border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightSidebarOpen(!localOpen)}
            className="h-8 w-8 p-0"
          >
            {localOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Mobile: Header with Close Button */}
        <div className="flex md:hidden h-14 items-center justify-between px-4 border-b">
          <h2 className="text-lg font-semibold">Container</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightSidebarOpen(false)}
            className="h-8 w-8 p-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

      {/* Panel Content */}
      <div className={cn(
        "flex flex-col flex-1 overflow-hidden",
        !localOpen && "hidden"
      )}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-semibold">Container</h2>
              <p className="text-sm text-muted-foreground">
                {containerMode ? "Ziehe Bilder in Container" : "Aktiviere Container-Modus"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setIsAddingTag(true)}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Neuer Tag
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={toggleAllTags}
            className="w-full mt-2"
          >
            {Object.values(expandedTags).every(v => v) ? (
              <>
                <ChevronsDownUp className="mr-2 h-4 w-4" />
                Alle zuklappen
              </>
            ) : (
              <>
                <ChevronsUpDown className="mr-2 h-4 w-4" />
                Alle aufklappen
              </>
            )}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Keine Tags vorhanden. Erstelle Tags um Container zu nutzen.
            </p>
          ) : (
            tags.map((tag) => (
              <TagContainer
                key={tag.id}
                tag={tag}
                images={images.filter((img) => img.tags.some((t) => t.id === tag.id))}
                onRemoveImage={(imageId) => onRemoveImageFromTag(imageId, tag.id)}
                onDeleteTag={() => setTagToDelete({ id: tag.id, name: tag.name })}
                containerMode={containerMode}
                isAdmin={isAdmin}
                isExpanded={expandedTags[tag.id] ?? true}
                onToggleExpanded={() => toggleTag(tag.id)}
                onExpand={(tag, images) => setExpandedContainer({ tag, images })}
              />
            ))
          )}
        </div>
      </div>

      {/* Expanded Container Modal */}
      {expandedContainer && (
        <ContainerExpandedModal
          tag={expandedContainer.tag}
          images={expandedContainer.images}
          onClose={() => setExpandedContainer(null)}
          onRemoveImage={onRemoveImageFromTag}
        />
      )}

      {/* Confirm Delete Tag Dialog */}
      <ConfirmDialog
        open={tagToDelete !== null}
        onOpenChange={(open) => !open && setTagToDelete(null)}
        title="Tag löschen"
        description={`Möchtest du den Tag "${tagToDelete?.name}" wirklich löschen? Dies entfernt den Tag von allen Bildern.`}
        confirmText="Löschen"
        cancelText="Abbrechen"
        variant="destructive"
        onConfirm={confirmDeleteTag}
      />

      {/* Add Tag Dialog */}
      <Dialog open={isAddingTag} onOpenChange={setIsAddingTag}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuen Tag erstellen</DialogTitle>
            <DialogDescription>
              Erstelle einen neuen Tag für die Organisation deiner Bilder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="tag-name" className="text-sm font-medium">
                Tag-Name
              </label>
              <Input
                id="tag-name"
                placeholder="z.B. Landschaft, Portrait, etc."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSubmitting) {
                    handleCreateTag();
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddingTag(false);
                setNewTagName("");
              }}
              disabled={isSubmitting}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleCreateTag}
              disabled={isSubmitting || !newTagName.trim()}
            >
              {isSubmitting ? "Erstelle..." : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
    </>
  );
}

type TagContainerProps = {
  tag: TagRecord;
  images: ImageWithTags[];
  onRemoveImage: (imageId: string) => void;
  onDeleteTag: () => void;
  containerMode: boolean;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onExpand: (tag: TagRecord, images: ImageWithTags[]) => void;
};

function TagContainer({ tag, images, onRemoveImage, onDeleteTag, containerMode, isAdmin, isExpanded, onToggleExpanded, onExpand }: TagContainerProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `container-${tag.id}`,
    data: {
      type: 'container',
      tagId: tag.id,
    },
  });

  const { showToast } = useToast();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(tag.name);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRename = async () => {
    if (!newName.trim() || newName === tag.name) {
      setIsRenaming(false);
      setNewName(tag.name);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tags/${tag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (!response.ok) {
        throw new Error("Fehler beim Umbenennen des Tags");
      }

      showToast("success", "Tag erfolgreich umbenannt");
      setIsRenaming(false);
      // Reload page to refresh tags
      window.location.reload();
    } catch (error) {
      showToast("error", "Fehler beim Umbenennen des Tags");
      setNewName(tag.name);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "rounded-lg border border-border bg-card/50 overflow-hidden transition-colors",
        isOver && "ring-2 ring-primary bg-primary/5"
      )}
    >
      <div className="p-3 flex items-center justify-between hover:bg-accent transition-colors">
        {isRenaming ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSubmitting) {
                  handleRename();
                } else if (e.key === "Escape") {
                  setIsRenaming(false);
                  setNewName(tag.name);
                }
              }}
              onBlur={handleRename}
              autoFocus
              disabled={isSubmitting}
              className="h-7 text-sm"
            />
          </div>
        ) : (
          <>
            <button
              onClick={onToggleExpanded}
              className="flex items-center gap-2 flex-1"
            >
              <Badge variant="secondary">{tag.name}</Badge>
              <span className="text-xs text-muted-foreground">({images.length})</span>
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform ml-auto",
                  isExpanded ? "rotate-90" : ""
                )}
              />
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onExpand(tag, images);
              }}
              className="h-8 w-8 p-0 ml-2"
              title="Container vergrößern"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsRenaming(true);
              }}
              className="h-8 w-8 p-0 ml-1"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTag();
                }}
                className="h-8 w-8 p-0 ml-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>

      {isExpanded && !isRenaming && (
        <div 
          className={cn(
            "p-2 transition-colors",
            "bg-muted/20"
          )}
        >
          {images.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4 border-2 border-dashed border-border rounded">
              Leer - Ziehe Bilder hierher
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {images.map((image) => (
                <ContainerImageItem
                  key={image.id}
                  image={image}
                  onRemove={() => onRemoveImage(image.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ContainerImageItemProps = {
  image: ImageWithTags;
  onRemove: () => void;
};

function ContainerImageItem({ image, onRemove }: ContainerImageItemProps) {
  const fallback = `https://dummyimage.com/100x100/1e293b/ffffff&text=${encodeURIComponent(image.filename.slice(0, 2))}`;
  const imageUrl = getImageUrl(image.key, fallback);

  return (
    <div className="group relative shrink-0">
      <div className="relative w-16 h-16 rounded overflow-hidden">
        <Image
          src={imageUrl}
          alt={image.filename}
          fill
          className="object-cover"
          draggable={false}
          sizes="64px"
          quality={50}
          loading="lazy"
          placeholder="blur"
          blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        />
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all shadow-lg"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// Expanded Container Modal
type ContainerExpandedModalProps = {
  tag: TagRecord;
  images: ImageWithTags[];
  onClose: () => void;
  onRemoveImage: (imageId: string, tagId: string) => void;
};

function ContainerExpandedModal({ tag, images, onClose, onRemoveImage }: ContainerExpandedModalProps) {
  const [selectedImage, setSelectedImage] = useState<ImageWithTags | null>(null);
  const [localImages, setLocalImages] = useState(images);
  const [availableTags, setAvailableTags] = useState<TagRecord[]>([]);

  // Fetch available tags for the image detail dialog
  useEffect(() => {
    fetch('/api/tags')
      .then(res => res.json())
      .then(data => {
        // API returns { tags: [...] }
        const tagsArray = data.tags || data;
        if (Array.isArray(tagsArray)) {
          setAvailableTags(tagsArray);
        } else {
          console.error('Tags response is not an array:', data);
          setAvailableTags([]);
        }
      })
      .catch(err => {
        console.error('Error fetching tags:', err);
        setAvailableTags([]);
      });
  }, []);

  const handleRemove = (imageId: string) => {
    onRemoveImage(imageId, tag.id);
    setLocalImages(prev => prev.filter(img => img.id !== imageId));
  };

  const handleLike = async (imageId: string, currentlyLiked: boolean) => {
    try {
      await fetch(`/api/images/${imageId}/like`, {
        method: "POST",
      });
      
      // Update local state
      setLocalImages(prev => prev.map(img => 
        img.id === imageId 
          ? { ...img, is_liked: !currentlyLiked }
          : img
      ));
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  const handleDownload = async (image: ImageWithTags) => {
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

  return (
    <>
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-[98vw] md:max-w-[95vw] max-h-[98vh] md:max-h-[95vh] overflow-hidden flex flex-col p-3 md:p-6">
          <DialogHeader>
            <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <Badge variant="secondary" className="text-base md:text-lg">{tag.name}</Badge>
              <span className="text-xs md:text-sm text-muted-foreground">({localImages.length} Bilder)</span>
            </DialogTitle>
            <DialogDescription className="text-xs md:text-sm">
              Verwalte die Bilder in diesem Container
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-3 md:-mx-0">
            {localImages.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Keine Bilder in diesem Container
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-3 p-2">
                {localImages.map((image) => (
                  <ContainerImageCard
                    key={image.id}
                    image={image}
                    onRemove={() => handleRemove(image.id)}
                    onLike={() => handleLike(image.id, image.is_liked || false)}
                    onDownload={() => handleDownload(image)}
                    onClick={() => setSelectedImage(image)}
                  />
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex-row gap-2 sm:gap-0">
            <Button 
              variant="secondary" 
              onClick={onClose}
              className="w-full sm:w-auto"
            >
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedImage && (
        <ImageDetailDialog
          image={selectedImage}
          availableTags={availableTags}
          onOpenChange={(open) => !open && setSelectedImage(null)}
          onSave={(imageId, data) => {
            // Update the image locally
            setLocalImages(prev => prev.map(img => {
              if (img.id === imageId) {
                const updatedImg = { ...img };
                if (data.imagename !== undefined) {
                  updatedImg.imagename = data.imagename;
                }
                if (data.tags) {
                  // Convert string[] to TagRecord[]
                  updatedImg.tags = data.tags.map(tagName => {
                    const existingTag = availableTags.find(t => t.name === tagName);
                    return existingTag || { id: '', name: tagName };
                  });
                }
                return updatedImg;
              }
              return img;
            }));
          }}
        />
      )}
    </>
  );
}

// Image Card for Expanded Container
type ContainerImageCardProps = {
  image: ImageWithTags;
  onRemove: () => void;
  onLike: () => void;
  onDownload: () => void;
  onClick: () => void;
};

function ContainerImageCard({ image, onRemove, onLike, onDownload, onClick }: ContainerImageCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const fallback = `https://dummyimage.com/300x300/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
  const imageUrl = getImageUrl(image.key, fallback);

  return (
    <div 
      className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-card hover:shadow-lg active:scale-95 transition-all cursor-pointer touch-manipulation"
      onClick={onClick}
    >
      {/* Image */}
      <div className="relative w-full h-full">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-muted animate-pulse" />
        )}
        <Image
          src={imageUrl}
          alt={image.filename}
          fill
          className={cn(
            "object-cover transition-opacity",
            imageLoaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setImageLoaded(true)}
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
        />
      </div>

      {/* Action Buttons - Always visible on mobile, hover on desktop */}
      <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLike();
          }}
          className={cn(
            "p-2 md:p-1.5 rounded-full backdrop-blur-sm bg-background/90 md:bg-background/80 hover:bg-background transition-all touch-manipulation active:scale-90",
            image.is_liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
          )}
          title={image.is_liked ? "Unlike" : "Like"}
        >
          <Heart className={cn("h-5 w-5 md:h-4 md:w-4", image.is_liked && "fill-red-500")} />
        </button>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          className="p-2 md:p-1.5 rounded-full backdrop-blur-sm bg-background/90 md:bg-background/80 hover:bg-background text-primary transition-all touch-manipulation active:scale-90"
          title="Herunterladen"
        >
          <Download className="h-5 w-5 md:h-4 md:w-4" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-2 md:p-1.5 rounded-full backdrop-blur-sm bg-background/90 md:bg-background/80 hover:bg-destructive hover:text-destructive-foreground text-destructive transition-all touch-manipulation active:scale-90"
          title="Aus Container entfernen"
        >
          <X className="h-5 w-5 md:h-4 md:w-4" />
        </button>
      </div>
    </div>
  );
}
