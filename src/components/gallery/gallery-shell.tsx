"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  DragMoveEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation } from "@tanstack/react-query";
import { Trash2, Grid3x3, Grid2x2, LayoutGrid, Download } from "lucide-react";

import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { TagFilter, type ImageSize } from "@/components/gallery/tag-filter";
import type { SortOption } from "@/components/gallery/tag-filter";
import { ImageDetailDialog } from "@/components/gallery/image-detail-dialog";
import { ContainerPanel } from "@/components/gallery/container-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ImageWithTags, TagRecord } from "@/lib/db";
import { formatFileSize } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useSidebar } from "@/components/sidebar-context";
import { getImageSize, saveImageSize, getImagesPerPage, saveImagesPerPage, getSortOption, saveSortOption } from "@/lib/user-preferences";

export type GalleryShellProps = {
  initialImages: ImageWithTags[];
  allTags: TagRecord[];
  initialFilter?: string[];
};

export function GalleryShell({ initialImages, allTags, initialFilter = [] }: GalleryShellProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const { showToast } = useToast();
  const { setRightSidebarOpen } = useSidebar();
  
  const [images, setImages] = useState(initialImages);
  const [availableTags, setAvailableTags] = useState(allTags);
  const [filterTags, setFilterTags] = useState<string[]>(initialFilter);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedImage, setSelectedImage] = useState<ImageWithTags | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize>("small"); // Default für SSR
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [imagesPerPage, setImagesPerPageState] = useState(50); // Default für SSR
  const [sortOption, setSortOption] = useState<SortOption>("none"); // Default für SSR
  const [isMounted, setIsMounted] = useState(false); // Track client-side mounting
  const [isMobile, setIsMobile] = useState(false); // Track mobile screen
  const draggedImagesRef = useRef<string[]>([]);
  const hasLoadedPage = useRef(false); // Track ob die Seite bereits aus sessionStorage geladen wurde
  const prevFilterTags = useRef<string[]>(initialFilter);
  const prevSearchTerm = useRef("");
  
  // Physics state for drag animation
  const [dragVelocity, setDragVelocity] = useState({ x: 0, y: 0 });
  const lastDragPos = useRef({ x: 0, y: 0, time: 0 });
  const velocityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track client-side mounting für DndContext und Mobile detection
  useEffect(() => {
    setIsMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Lade imageSize und currentPage aus Cookie/SessionStorage nach Hydration
  useEffect(() => {
    setImageSize(getImageSize());
    setImagesPerPageState(getImagesPerPage());
    setSortOption(getSortOption());
    
    // Lade die gespeicherte Seitenzahl aus sessionStorage
    const savedPage = sessionStorage.getItem('gallery-current-page');
    if (savedPage) {
      const pageNum = parseInt(savedPage, 10);
      if (!isNaN(pageNum) && pageNum > 0) {
        setCurrentPage(pageNum);
      }
    }
    
    hasLoadedPage.current = true;
    prevFilterTags.current = filterTags;
    prevSearchTerm.current = searchTerm;
  }, []);

  // Speichere die aktuelle Seite im sessionStorage
  useEffect(() => {
    if (isMounted && hasLoadedPage.current) {
      sessionStorage.setItem('gallery-current-page', currentPage.toString());
    }
  }, [currentPage, isMounted]);

  // Zurück zur ersten Seite wenn Filter oder Suchbegriff geändert werden
  useEffect(() => {
    if (hasLoadedPage.current) {
      // Prüfe ob sich tatsächlich etwas geändert hat
      const filtersChanged = JSON.stringify(prevFilterTags.current) !== JSON.stringify(filterTags);
      const searchChanged = prevSearchTerm.current !== searchTerm;
      
      if (filtersChanged || searchChanged) {
        setCurrentPage(1);
      }
    }
    
    prevFilterTags.current = filterTags;
    prevSearchTerm.current = searchTerm;
  }, [filterTags, searchTerm]);

  // Wrapper-Funktion für imagesPerPage die auch in Cookie speichert
  const setImagesPerPage = (count: number) => {
    setImagesPerPageState(count);
    saveImagesPerPage(count);
    setCurrentPage(1); // Zurück zur ersten Seite bei Änderung
  };

  // Wrapper-Funktion für imageSize die auch in Cookie speichert
  const handleImageSizeChange = (size: ImageSize) => {
    setImageSize(size);
    saveImageSize(size);
  };

  // Wrapper-Funktion für sortOption die auch in Cookie speichert
  const handleSortChange = (sort: SortOption) => {
    setSortOption(sort);
    saveSortOption(sort);
  };

  // Wrapper-Funktion für imagesPerPage aus Select (nimmt String entgegen)
  const handleImagesPerPageChange = (value: string) => {
    setImagesPerPage(Number(value));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimal drag distance
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 100, // Schnellere Touch-Aktivierung für mobile
        tolerance: 8, // Etwas mehr Toleranz für Touch
      },
    })
  );

  const filteredImages = useMemo(() => {
    return images.filter((image) => {
      // Suche in Filename, Imagename und Tags
      if (searchTerm.length > 0) {
        const term = searchTerm.toLowerCase();
        const matchesFilename = image.filename.toLowerCase().includes(term);
        const matchesImagename = image.imagename?.toLowerCase().includes(term);
        const matchesTags = image.tags.some((tag) => tag.name.toLowerCase().includes(term));
        
        if (!matchesFilename && !matchesImagename && !matchesTags) {
          return false;
        }
      }
      
      // Tag-Filter
      if (filterTags.length === 0) return true;
      
      // Check for "Ohne Tag" filter
      const hasNoTagFilter = filterTags.includes("__NO_TAG__");
      const regularTagFilters = filterTags.filter(id => id !== "__NO_TAG__");
      
      // If only "Ohne Tag" is selected, show images with no tags
      if (hasNoTagFilter && regularTagFilters.length === 0) {
        return image.tags.length === 0;
      }
      
      // If "Ohne Tag" and other tags are selected, show images that match either condition
      if (hasNoTagFilter && regularTagFilters.length > 0) {
        const hasNoTags = image.tags.length === 0;
        const tagIds = new Set(image.tags.map((tag) => tag.id));
        const hasRegularTags = regularTagFilters.every((tagId) => tagIds.has(tagId));
        return hasNoTags || hasRegularTags;
      }
      
      // Regular tag filtering (all selected tags must be present)
      const tagIds = new Set(image.tags.map((tag) => tag.id));
      return filterTags.every((tagId) => tagIds.has(tagId));
    });
  }, [filterTags, images, searchTerm]);

  // Sortiere die gefilterten Bilder
  const sortedImages = useMemo(() => {
    const sorted = [...filteredImages];
    
    switch (sortOption) {
      case "none":
        return sorted; // Keine Sortierung - Originale Reihenfolge
      case "date-desc":
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "date-asc":
        return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case "name-asc":
        return sorted.sort((a, b) => {
          const nameA = a.imagename || a.filename;
          const nameB = b.imagename || b.filename;
          return nameA.localeCompare(nameB);
        });
      case "name-desc":
        return sorted.sort((a, b) => {
          const nameA = a.imagename || a.filename;
          const nameB = b.imagename || b.filename;
          return nameB.localeCompare(nameA);
        });
      default:
        return sorted;
    }
  }, [filteredImages, sortOption]);

  // Berechne sichtbare Bilder basierend auf aktueller Seite
  const visibleImages = useMemo(() => {
    const startIndex = (currentPage - 1) * imagesPerPage;
    const endIndex = startIndex + imagesPerPage;
    return sortedImages.slice(startIndex, endIndex);
  }, [sortedImages, currentPage, imagesPerPage]);

  const totalPages = Math.ceil(sortedImages.length / imagesPerPage);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    console.log('DragEnd - active:', active.id);
    console.log('DragEnd - over:', over?.id, over?.data?.current);
    console.log('DragEnd - draggedImagesRef:', draggedImagesRef.current);
    
    setActiveId(null);
    setDragVelocity({ x: 0, y: 0 });
    
    // Clear velocity timeout
    if (velocityTimeoutRef.current) {
      clearTimeout(velocityTimeoutRef.current);
      velocityTimeoutRef.current = null;
    }
    
    if (!over) {
      draggedImagesRef.current = [];
      return;
    }

    // Check if dropped on a container
    const overData = over.data.current;
    console.log('DragEnd - overData type:', overData?.type);
    
    if (overData?.type === 'container') {
      const tagId = overData.tagId as string;
      
      console.log('DragEnd - Container drop detected, tagId:', tagId);
      console.log('DragEnd - affectedImages:', draggedImagesRef.current);
      
      // Nutze die im Ref gespeicherten IDs (diese sind synchron)
      const affectedImageIds = draggedImagesRef.current;
      
      // Füge Tag zu allen betroffenen Bildern hinzu
      let successCount = 0;
      let alreadyHasTag = 0;
      
      for (const imageId of affectedImageIds) {
        const image = images.find((img) => img.id === imageId);
        if (!image) continue;
        
        // Check if tag already exists
        if (image.tags.some((t) => t.id === tagId)) {
          alreadyHasTag++;
          continue;
        }
        
        const newTags = [...image.tags.map((t) => t.id), tagId];
        console.log('DragEnd - Updating image:', imageId, 'with tags:', newTags);
        updateMutation.mutate({ id: imageId, tags: newTags, skipModalOpen: true });
        successCount++;
      }
      
      if (successCount > 0) {
        showToast("success", `Tag zu ${successCount} Bild(ern) hinzugefügt`, 2000);
      }
      if (alreadyHasTag > 0) {
        showToast("info", `${alreadyHasTag} Bild(er) hatten den Tag bereits`, 2000);
      }
      
      // Auswahl aufheben nach dem Zuweisen
      setSelectedImageIds(new Set());
      
      draggedImagesRef.current = [];
      return;
    }
    
    draggedImagesRef.current = [];
  };

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; tags?: string[]; imagename?: string; skipModalOpen?: boolean }) => {
      const body: { tags?: string[]; imagename?: string } = {};
      if (payload.tags !== undefined) body.tags = payload.tags;
      if (payload.imagename !== undefined) body.imagename = payload.imagename;
      
      const res = await fetch(`/api/images/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error("Speichern fehlgeschlagen");
      }
      return { image: (await res.json()).image as ImageWithTags, skipModalOpen: payload.skipModalOpen };
    },
    onSuccess: ({ image, skipModalOpen }) => {
      setImages((prev) => prev.map((item) => (item.id === image.id ? image : item)));
      // Nur Modal öffnen wenn nicht durch Drag & Drop ausgelöst
      if (!skipModalOpen) {
        setSelectedImage(image);
      }
      showToast("success", "Bild wurde aktualisiert.", 2000);
      setAvailableTags((prev) => {
        const ids = new Set(prev.map((tag) => tag.id));
        const merged = [...prev];
        for (const tag of image.tags) {
          if (!ids.has(tag.id)) {
            merged.push(tag);
            ids.add(tag.id);
          }
        }
        return merged.sort((a, b) => a.name.localeCompare(b.name));
      });
    },
    onError: (error: Error) => showToast("error", error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const res = await fetch(`/api/images/${imageId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Löschen fehlgeschlagen");
      }
    },
    onSuccess: (_, imageId) => {
      setImages((prev) => prev.filter((item) => item.id !== imageId));
      setSelectedImage(null);
      showToast("success", "Bild wurde gelöscht.", 2000);
    },
    onError: (error: Error) => showToast("error", error.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (imageIds: string[]) => {
      const results = await Promise.allSettled(
        imageIds.map(async (id) => {
          const response = await fetch(`/api/images/${id}`, { method: "DELETE" });
          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `Failed to delete image ${id}`);
          }
          return id;
        })
      );
      
      const failed = results.filter((r) => r.status === "rejected");
      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
        .map((r) => r.value);
      
      if (failed.length > 0) {
        if (succeeded.length === 0) {
          // Alle fehlgeschlagen
          throw new Error(`Fehler beim Löschen: ${(failed[0] as PromiseRejectedResult).reason.message}`);
        } else {
          // Teilweise fehlgeschlagen
          throw new Error(`${failed.length} von ${imageIds.length} Bild(er) konnten nicht gelöscht werden`);
        }
      }
      
      return succeeded;
    },
    onSuccess: (succeededIds) => {
      setImages((prev) => prev.filter((item) => !succeededIds.includes(item.id)));
      setSelectedImageIds(new Set());
      showToast("success", `${succeededIds.length} Bild(er) wurden gelöscht.`, 3000);
    },
    onError: (error: Error) => showToast("error", error.message),
  });

  const removeFilterTag = (tagId: string) => {
    setFilterTags((prev) => prev.filter((id) => id !== tagId));
  };

  const handleRemoveImageFromTag = async (imageId: string, tagId: string) => {
    const image = images.find((img) => img.id === imageId);
    if (!image) return;

    const newTags = image.tags.filter((tag) => tag.id !== tagId).map((tag) => tag.id);
    updateMutation.mutate({ id: imageId, tags: newTags, skipModalOpen: true });
  };

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };

  const selectAllImages = () => {
    setSelectedImageIds(new Set(sortedImages.map((img) => img.id)));
  };

  const deselectAllImages = () => {
    setSelectedImageIds(new Set());
  };

  const handleBulkDelete = () => {
    const count = selectedImageIds.size;
    if (count === 0) return;
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedImageIds));
  };

  const handleSingleDelete = (imageId: string) => {
    bulkDeleteMutation.mutate([imageId]);
  };

  // Download functions
  const downloadImage = async (image: ImageWithTags) => {
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
      showToast("success", `"${image.imagename || image.filename}" heruntergeladen`);
    } catch (error) {
      showToast("error", "Fehler beim Herunterladen des Bildes");
    }
  };

  const handleBulkDownload = async () => {
    const selectedImages = images.filter(img => selectedImageIds.has(img.id));
    
    if (selectedImages.length === 0) return;

    showToast("info", `Lade ${selectedImages.length} Bild(er) herunter...`);

    // If only one image, download directly
    if (selectedImages.length === 1) {
      await downloadImage(selectedImages[0]);
      return;
    }

    // For multiple images, download one by one with delay
    for (let i = 0; i < selectedImages.length; i++) {
      await downloadImage(selectedImages[i]);
      // Small delay to avoid overwhelming the browser
      if (i < selectedImages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    showToast("success", `${selectedImages.length} Bild(er) erfolgreich heruntergeladen`);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const draggedId = event.active.id as string;
    
    console.log('DragStart - draggedId:', draggedId);
    console.log('DragStart - selectedImageIds:', Array.from(selectedImageIds));
    
    setActiveId(draggedId);
    
    // Reset velocity tracking
    lastDragPos.current = { x: 0, y: 0, time: Date.now() };
    setDragVelocity({ x: 0, y: 0 });
    
    // Wenn das gezogene Bild in der Auswahl ist, alle ausgewählten Bilder merken
    if (selectedImageIds.has(draggedId) && selectedImageIds.size > 1) {
      // Multi-Drag: Behalte alle selections
      draggedImagesRef.current = Array.from(selectedImageIds);
      console.log('DragStart - Multi-drag with:', draggedImagesRef.current);
    } else {
      // Single-Drag: Nur dieses Bild
      draggedImagesRef.current = [draggedId];
      console.log('DragStart - Single-drag with:', draggedImagesRef.current);
      setSelectedImageIds(new Set([draggedId]));
    }
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const { delta } = event;
    const now = Date.now();
    const timeDelta = now - lastDragPos.current.time;
    
    if (timeDelta > 0) {
      // Calculate velocity in pixels per millisecond
      const velocityX = (delta.x - lastDragPos.current.x) / timeDelta;
      const velocityY = (delta.y - lastDragPos.current.y) / timeDelta;
      
      setDragVelocity({ x: velocityX * 100, y: velocityY * 100 }); // Scale up for visibility
      
      // Clear previous timeout
      if (velocityTimeoutRef.current) {
        clearTimeout(velocityTimeoutRef.current);
      }
      
      // Reset velocity after a short delay if no movement
      velocityTimeoutRef.current = setTimeout(() => {
        setDragVelocity({ x: 0, y: 0 });
      }, 100);
    }
    
    lastDragPos.current = { x: delta.x, y: delta.y, time: now };
  };

  const handleTagCreated = async () => {
    // Reload tags after creating a new one
    try {
      const response = await fetch("/api/tags");
      if (response.ok) {
        const data = await response.json();
        setAvailableTags(data.tags);
      }
    } catch (error) {
      console.error("Failed to reload tags:", error);
    }
  };

  const handleTagDeleted = async () => {
    // Reload both tags and images after deleting a tag
    try {
      // Reload tags
      const tagsResponse = await fetch("/api/tags");
      if (tagsResponse.ok) {
        const tagsData = await tagsResponse.json();
        setAvailableTags(tagsData.tags);
      }

      // Reload images to update their tag assignments
      const imagesResponse = await fetch("/api/images");
      if (imagesResponse.ok) {
        const imagesData = await imagesResponse.json();
        setImages(imagesData.images);
      }
    } catch (error) {
      console.error("Failed to reload data:", error);
    }
  };

  // Render gallery without DnD during SSR
  if (!isMounted) {
    return (
      <>
        <ContainerPanel
          tags={availableTags}
          images={images}
          onRemoveImageFromTag={handleRemoveImageFromTag}
          containerMode={true}
          onTagCreated={handleTagCreated}
          onTagDeleted={handleTagDeleted}
        />
      
      {selectedImageIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-2xl min-w-[300px]">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedImageIds.size} Bild(er) ausgewählt
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={deselectAllImages}
            >
              Auswahl aufheben
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="default"
              onClick={handleBulkDownload}
              className="flex-1 sm:flex-none"
            >
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Herunterladen</span>
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
                className="flex-1 sm:flex-none"
              >
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">
                  {bulkDeleteMutation.isPending ? "Lösche..." : "Löschen"}
                </span>
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 md:gap-6 md:flex-row md:items-end md:justify-between mt-4 md:mt-8">
        <div className="space-y-3 md:space-y-4 w-full">
          <div className="flex flex-col items-stretch gap-3">
            <TagFilter
              tags={availableTags}
              activeTagIds={filterTags}
              onToggle={(tagId) =>
                setFilterTags((prev) =>
                  prev.includes(tagId)
                    ? prev.filter((id) => id !== tagId)
                    : [...prev, tagId]
                )
              }
              onSearchChange={setSearchTerm}
              imageSize={imageSize}
              onImageSizeChange={handleImageSizeChange}
              imagesPerPage={imagesPerPage}
              onImagesPerPageChange={setImagesPerPage}
              sortOption={sortOption}
              onSortChange={handleSortChange}
              onSelectAll={selectAllImages}
              hasSelection={selectedImageIds.size > 0}
            />
            {filterTags.length > 0 && (
              <Button
                onClick={() => setFilterTags([])}
                variant="ghost"
                size="sm"
                className="self-start"
              >
                Filter zurücksetzen
              </Button>
            )}
          </div>

          {filterTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Aktive Filter:</span>
              {filterTags.map((tagId) => {
                const tag = availableTags.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <Badge
                    key={tagId}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setFilterTags((prev) => prev.filter((id) => id !== tagId))}
                  >
                    {tag.name} ×
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <GalleryGrid
        images={visibleImages}
        onSelectImage={setSelectedImage}
        isReordering={false}
        isAdmin={isAdmin}
        selectedImageIds={selectedImageIds}
        onToggleSelection={toggleImageSelection}
        containerMode={true}
        activeId={null}
        imageSize={imageSize}
      />

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <Button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            size="sm"
            variant="outline"
          >
            Erste
          </Button>
          <Button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            size="sm"
            variant="outline"
          >
            Zurück
          </Button>
          
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <Button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  size="sm"
                  variant={currentPage === pageNum ? "default" : "outline"}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            size="sm"
            variant="outline"
          >
            Weiter
          </Button>
          <Button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            size="sm"
            variant="outline"
          >
            Letzte
          </Button>
          
          <span className="ml-4 text-sm text-muted-foreground">
            Seite {currentPage} von {totalPages} ({sortedImages.length} Bilder)
          </span>
        </div>
      )}

      <ImageDetailDialog
        image={selectedImage}
        onOpenChange={(open) => {
          if (!open) setSelectedImage(null);
        }}
        onSave={(id, data) => updateMutation.mutate({ id, ...data })}
        availableTags={allTags}
      />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title="Bilder löschen"
        description={`Möchtest du wirklich ${selectedImageIds.size} Bild(er) löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmText="Löschen"
        cancelText="Abbrechen"
        variant="destructive"
        onConfirm={confirmBulkDelete}
      />
      </>
    );
  }

  // Render gallery with DnD after mounting on client (Desktop only)
  const galleryContent = (
    <div>
      {/* Container Panel - nur auf Desktop */}
      {!isMobile && (
        <ContainerPanel
          tags={availableTags}
          images={images}
          onRemoveImageFromTag={handleRemoveImageFromTag}
          containerMode={true}
          onTagCreated={handleTagCreated}
          onTagDeleted={handleTagDeleted}
        />
      )}
      
      {selectedImageIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-2xl min-w-[300px]">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedImageIds.size} Bild(er) ausgewählt
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={deselectAllImages}
            >
              Auswahl aufheben
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleBulkDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              Herunterladen
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {bulkDeleteMutation.isPending ? "Lösche..." : "Löschen"}
              </Button>
            )}
          </div>
        </div>
      )}
      
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between mt-8">
        <div className="space-y-4 w-full">
          <div className="flex flex-col items-stretch gap-3">
            <TagFilter
              tags={availableTags}
              activeTagIds={filterTags}
              onToggle={(tagId) =>
                setFilterTags((prev) =>
                  prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
                )
              }
              onSearchChange={setSearchTerm}
              imageSize={imageSize}
              onImageSizeChange={handleImageSizeChange}
              imagesPerPage={imagesPerPage}
              onImagesPerPageChange={setImagesPerPage}
              sortOption={sortOption}
              onSortChange={handleSortChange}
              onSelectAll={isAdmin ? selectAllImages : undefined}
              hasSelection={selectedImageIds.size > 0}
            />
          </div>
          {filterTags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Aktive Filter:</span>
              {filterTags.map((tagId) => {
                // Handle "Ohne Tag" filter
                if (tagId === "__NO_TAG__") {
                  return (
                    <Badge key={tagId} variant="secondary" className="cursor-pointer" onClick={() => removeFilterTag(tagId)}>
                      Ohne Tag
                    </Badge>
                  );
                }
                
                // Handle regular tags
                const tag = availableTags.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <Badge key={tag.id} variant="secondary" className="cursor-pointer" onClick={() => removeFilterTag(tag.id)}>
                    {tag.name}
                  </Badge>
                );
              })}
              <Button variant="ghost" size="sm" onClick={() => setFilterTags([])}>
                Zurücksetzen
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-8">
        <SortableContext items={visibleImages.map((image) => image.id)} strategy={rectSortingStrategy}>
          <GalleryGrid
            images={visibleImages}
            onSelectImage={setSelectedImage}
            onDeleteImage={handleSingleDelete}
            isReordering={false}
            isAdmin={isAdmin}
            selectedImageIds={selectedImageIds}
            onToggleSelection={toggleImageSelection}
            containerMode={true}
            activeId={activeId}
            imageSize={imageSize}
          />
        </SortableContext>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 md:mt-8 mb-6 md:mb-8">
            {/* Mobile: Kompakte Version */}
            <div className="flex md:hidden flex-col gap-3">
              <div className="flex justify-between items-center gap-2">
                <Button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  Zurück
                </Button>
                <span className="text-sm text-muted-foreground whitespace-nowrap px-2">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  Weiter
                </Button>
              </div>
              <div className="text-xs text-center text-muted-foreground">
                {sortedImages.length} Bilder gesamt
              </div>
            </div>

            {/* Desktop: Vollständige Version */}
            <div className="hidden md:flex justify-center items-center gap-2 flex-wrap">
              <Button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                size="sm"
                variant="outline"
              >
                Erste
              </Button>
              <Button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                size="sm"
                variant="outline"
              >
                Zurück
              </Button>
              
              <div className="flex items-center gap-2">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <Button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      size="sm"
                      variant={currentPage === pageNum ? "default" : "outline"}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                size="sm"
                variant="outline"
              >
                Weiter
              </Button>
              <Button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                size="sm"
                variant="outline"
              >
                Letzte
              </Button>
              
              <span className="ml-4 text-sm text-muted-foreground">
                Seite {currentPage} von {totalPages} ({sortedImages.length} Bilder)
              </span>
            </div>
          </div>
        )}
      </div>

      <ImageDetailDialog
        image={selectedImage}
        onOpenChange={(open) => {
          if (!open) setSelectedImage(null);
        }}
        onSave={(id, data) => updateMutation.mutate({ id, ...data })}
        availableTags={allTags}
      />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title="Bilder löschen"
        description={`Möchtest du wirklich ${selectedImageIds.size} Bild(er) löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmText="Löschen"
        cancelText="Abbrechen"
        variant="destructive"
        onConfirm={confirmBulkDelete}
      />

      {/* DragOverlay nur auf Desktop */}
      {!isMobile && (
        <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
          {activeId ? (
            <SimpleDragPreview 
              imageIds={draggedImagesRef.current} 
              images={images}
              velocity={dragVelocity}
            />
          ) : null}
        </DragOverlay>
      )}
      </div>
  );

  // Auf Desktop: Mit DndContext, auf Mobile: Ohne DndContext
  return isMobile ? galleryContent : (
    <DndContext 
      sensors={sensors} 
      onDragEnd={handleDragEnd} 
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      collisionDetection={pointerWithin}
    >
      {galleryContent}
    </DndContext>
  );
}

// Simple preview component for dragged images with physics
function SimpleDragPreview({ 
  imageIds, 
  images, 
  velocity 
}: { 
  imageIds: string[]; 
  images: ImageWithTags[];
  velocity: { x: number; y: number };
}) {
  const BASE_URL = process.env.NEXT_PUBLIC_MINIO_BASE_URL;
  
  const draggedImages = images.filter(img => imageIds.includes(img.id));
  
  if (draggedImages.length === 0) return null;

  // Calculate wobble based on velocity
  const velocityMagnitude = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
  const wobbleIntensity = Math.min(velocityMagnitude / 10, 15); // Cap at 15 degrees
  const wobbleRotation = velocity.x > 0 ? wobbleIntensity : -wobbleIntensity;
  const baseRotation = -5;
  const totalRotation = baseRotation + wobbleRotation;

  return (
    <div style={{ 
      position: 'relative', 
      transform: `rotate(${totalRotation}deg)`, 
      pointerEvents: 'none',
      transition: 'transform 0.1s ease-out'
    }}>
      {draggedImages.map((image, index) => {
        const fallback = `https://dummyimage.com/600x400/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
        const imageUrl = BASE_URL ? `${BASE_URL.replace(/\/$/, "")}/${image.key}` : fallback;
        
        // Stapel-Effekt
        const offsetX = index * 8;
        const offsetY = index * 8;
        const scale = 0.6 - (index * 0.02);
        
        return (
          <div
            key={image.id}
            className="rounded-xl border-2 border-primary bg-card shadow-2xl overflow-hidden absolute top-0 left-0"
            style={{
              width: '200px',
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
              opacity: 0.95 - (index * 0.1),
              zIndex: draggedImages.length - index,
            }}
          >
            <div className="relative aspect-[4/3]">
              <img
                src={imageUrl}
                alt={image.filename}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-2 bg-card">
              <p className="text-xs font-medium truncate">{image.imagename || image.filename}</p>
            </div>
          </div>
        );
      })}
      {draggedImages.length > 1 && (
        <div 
          className="absolute -top-3 -right-3 bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg"
          style={{ zIndex: 9999 }}
        >
          {draggedImages.length}
        </div>
      )}
    </div>
  );
}
