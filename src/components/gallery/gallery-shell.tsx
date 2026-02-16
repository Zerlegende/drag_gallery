"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
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
import { Trash2, Grid3x3, Grid2x2, LayoutGrid, Download, Heart, RotateCw } from "lucide-react";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { TagFilter, type ImageSize } from "@/components/gallery/tag-filter";
import type { SortOption } from "@/components/gallery/tag-filter";
import { ImageDetailDialog } from "@/components/gallery/image-detail-dialog";
import { ImageFullscreenMobile } from "@/components/gallery/image-fullscreen-mobile";
import { InstaMode } from "@/components/gallery/insta-mode";
import { ContainerPanel } from "@/components/gallery/container-panel";
import { RotationQueue, type QueueItem } from "@/components/gallery/rotation-queue";
import { ProcessingStatusIndicator } from "@/components/gallery/processing-status-indicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ImageWithTags, TagRecord } from "@/lib/db";
import { formatFileSize, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useSidebar } from "@/components/sidebar-context";
import { getImageSize, saveImageSize, getImagesPerPage, saveImagesPerPage, getSortOption, saveSortOption, getDemoMode } from "@/lib/user-preferences";
import { anonymizeImage, anonymizeTag, getDemoImageUrl } from "@/lib/demo-mode";

export type GalleryShellProps = {
  initialImages: ImageWithTags[];
  allTags: TagRecord[];
  initialFilter?: string[];
};
export function GalleryShell({ initialImages, allTags, initialFilter = [] }: GalleryShellProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const { showToast } = useToast();
  const [isDemoMode, setIsDemoMode] = useState(false);
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
  const [showInstaMode, setShowInstaMode] = useState(false); // Track Insta-Mode
  const [rotationQueue, setRotationQueue] = useState<QueueItem[]>([]);
  const isProcessingQueue = useRef(false); // Track if queue is currently being processed
  const draggedImagesRef = useRef<string[]>([]);
  const hasLoadedPage = useRef(false); // Track ob die Seite bereits aus sessionStorage geladen wurde
  const prevFilterTags = useRef<string[]>(initialFilter);
  const prevSearchTerm = useRef("");
  
  // Physics state for drag animation - use ref to avoid re-renders
  const dragVelocityRef = useRef({ x: 0, y: 0 });
  const lastDragPos = useRef({ x: 0, y: 0, time: 0 });
  const dragOverlayRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const galleryTopRef = useRef<HTMLDivElement | null>(null);
  // Spring physics for smooth rotation
  const currentRotation = useRef(0); // current visual rotation
  const rotationVelocity = useRef(0); // angular velocity for inertia
  const targetRotation = useRef(0); // where we want to rotate to
  const isDraggingRef = useRef(false);
  const springLoopRef = useRef<number | null>(null);
  // Track client-side mounting für DndContext und Mobile detection
  useEffect(() => {
    setIsMounted(true);
    setIsDemoMode(getDemoMode());
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  // Load rotation queue from server on mount
  useEffect(() => {
    if (!isMounted || images.length === 0) return;
    
    const loadQueue = async () => {
      try {
        const response = await fetch('/api/rotation-queue');
        if (response.ok) {
          const data = await response.json();
          if (data.queue && data.queue.length > 0) {
            // Map server queue to client format
            const clientQueue: QueueItem[] = data.queue.map((item: any) => {
              const image = images.find(img => img.id === item.imageId);
              if (!image) return null;
              return {
                id: item.imageId,
                image,
                status: item.status,
                error: item.error,
              };
            }).filter((item: QueueItem | null): item is QueueItem => item !== null);
            
            setRotationQueue(clientQueue);
          }
        }
      } catch (error) {
        console.error("Failed to load rotation queue:", error);
      }
    };
    
    loadQueue();
  }, [isMounted, images.length]);
  // Save rotation queue to server whenever it changes
  useEffect(() => {
    // Don't sync to server during initial load
    if (!isMounted) return;
  }, [rotationQueue, isMounted]);
  // Auto-resume processing when there are pending items
  useEffect(() => {
    if (!isMounted) return;
    if (isProcessingQueue.current) return; // Already processing
    
    const pendingItems = rotationQueue.filter(item => item.status === "pending");
    
    // Only start processing if there are pending items
    if (pendingItems.length > 0) {
      processRotationQueue(pendingItems);
    }
  }, [rotationQueue, isMounted]);
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

  // Apply demo mode transformation if enabled
  const displayImages = useMemo(() => {
    if (!isDemoMode) return sortedImages;
    return sortedImages.map((img, index) => anonymizeImage(img, index));
  }, [sortedImages, isDemoMode]);

  const displayTags = useMemo(() => {
    if (!isDemoMode) return availableTags;
    return availableTags.map((tag, index) => anonymizeTag(tag, index));
  }, [availableTags, isDemoMode]);
  // Berechne sichtbare Bilder basierend auf aktueller Seite
  const visibleImages = useMemo(() => {
    const startIndex = (currentPage - 1) * imagesPerPage;
    const endIndex = startIndex + imagesPerPage;
    return displayImages.slice(startIndex, endIndex);
  }, [displayImages, currentPage, imagesPerPage]);
  const totalPages = Math.ceil(displayImages.length / imagesPerPage);

  // Handle page change with scroll to top for bottom pagination
  const handlePageChange = (newPage: number, scrollToTop: boolean = false) => {
    setCurrentPage(newPage);
    if (scrollToTop && galleryTopRef.current) {
      galleryTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Pagination component (reusable)
  const renderPagination = (scrollOnClick: boolean = false) => {
    if (totalPages <= 1) return null;
    
    return (
      <div className={cn(
        "flex justify-center items-center gap-2",
        scrollOnClick ? "mt-8" : "mb-6"
      )}>
        <Button
          onClick={() => handlePageChange(1, scrollOnClick)}
          disabled={currentPage === 1}
          size="sm"
          variant="outline"
        >
          Erste
        </Button>
        <Button
          onClick={() => handlePageChange(Math.max(1, currentPage - 1), scrollOnClick)}
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
                onClick={() => handlePageChange(pageNum, scrollOnClick)}
                size="sm"
                variant={currentPage === pageNum ? "default" : "outline"}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>
        <Button
          onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1), scrollOnClick)}
          disabled={currentPage === totalPages}
          size="sm"
          variant="outline"
        >
          Weiter
        </Button>
        <Button
          onClick={() => handlePageChange(totalPages, scrollOnClick)}
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
    );
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveId(null);
    dragVelocityRef.current = { x: 0, y: 0 };
    
    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Let spring physics settle back to 0deg with inertia
    isDraggingRef.current = false;
    targetRotation.current = 0;
    
    if (!over) {
      draggedImagesRef.current = [];
      return;
    }
    // Check if dropped on a container
    const overData = over.data.current;
    
    if (overData?.type === 'container') {
      const tagId = overData.tagId as string;
      
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
  // Bulk rotate function with queue
  const handleBulkRotate = async () => {
    const selectedImages = images.filter(img => selectedImageIds.has(img.id));
    
    if (selectedImages.length === 0) return;
    // Add to server queue
    try {
      const response = await fetch('/api/rotation-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          imageIds: selectedImages.map(img => img.id),
        }),
      });
      if (!response.ok) {
        showToast("error", "Fehler beim Hinzufügen zur Queue");
        return;
      }
      const data = await response.json();
      
      // Create new queue items for client
      const newQueueItems: QueueItem[] = data.added.map((item: any) => ({
        id: item.imageId,
        image: images.find(img => img.id === item.imageId)!,
        status: item.status,
      })).filter((item: QueueItem) => item.image);
      
      // Add to existing queue
      setRotationQueue(prev => [...prev, ...newQueueItems]);
      setSelectedImageIds(new Set()); // Clear selection immediately
      // Process new items in background
      processRotationQueue(newQueueItems);
    } catch (error) {
      showToast("error", "Netzwerkfehler");
    }
  };
  const processRotationQueue = async (queue: QueueItem[]) => {
    if (isProcessingQueue.current) {
      return; // Prevent double processing
    }
    
    isProcessingQueue.current = true;
    
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      
      // Skip if already processing, success, or error
      if (item.status !== "pending") {
        continue;
      }
      
      // Update to processing on server
      try {
        const updateResponse = await fetch('/api/rotation-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            imageId: item.id,
            status: 'processing',
          }),
        });
        if (!updateResponse.ok) {
          const errorData = await updateResponse.json();
          if (errorData.error === "Already processing") {
            continue;
          }
        }
      } catch (error) {
        console.error("Failed to update queue status:", error);
      }
      
      // Update local state to processing
      setRotationQueue(prev => 
        prev.map(q => q.id === item.id ? { ...q, status: "processing" } : q)
      );
      try {
        const response = await fetch(`/api/images/${item.id}/rotate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ degrees: 90 }),
        });
        if (response.ok) {
          // Update server
          await fetch('/api/rotation-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              imageId: item.id,
              status: 'success',
            }),
          });
          
          // Update local state
          setRotationQueue(prev => 
            prev.map(q => q.id === item.id ? { ...q, status: "success" } : q)
          );
        } else {
          const errorText = await response.text();
          
          // Update server
          await fetch('/api/rotation-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              imageId: item.id,
              status: 'error',
              error: errorText || "Fehler beim Drehen",
            }),
          });
          
          // Update local state
          setRotationQueue(prev => 
            prev.map(q => q.id === item.id ? { ...q, status: "error", error: errorText || "Fehler beim Drehen" } : q)
          );
        }
      } catch (error) {
        // Update server
        await fetch('/api/rotation-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            imageId: item.id,
            status: 'error',
            error: "Netzwerkfehler",
          }),
        });
        
        // Update local state
        setRotationQueue(prev => 
          prev.map(q => q.id === item.id ? { ...q, status: "error", error: "Netzwerkfehler" } : q)
        );
      }
    }
    isProcessingQueue.current = false;
    // Reload gallery after all rotations are done
    try {
      const res = await fetch('/api/images');
      if (res.ok) {
        const data = await res.json();
        setImages(data.images);
      }
    } catch (error) {
      console.error("Failed to reload images:", error);
    }
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
    
    setActiveId(draggedId);
    
    // Reset velocity tracking
    lastDragPos.current = { x: 0, y: 0, time: Date.now() };
    dragVelocityRef.current = { x: 0, y: 0 };
    
    // Wenn das gezogene Bild in der Auswahl ist, alle ausgewählten Bilder merken
    if (selectedImageIds.has(draggedId) && selectedImageIds.size > 1) {
      // Multi-Drag: Behalte alle selections
      draggedImagesRef.current = Array.from(selectedImageIds);
    } else {
      // Single-Drag: Nur dieses Bild
      draggedImagesRef.current = [draggedId];
      setSelectedImageIds(new Set([draggedId]));
    }
  };
  const handleDragMove = (event: DragMoveEvent) => {
    const { delta } = event;
    const now = Date.now();
    const timeDelta = now - lastDragPos.current.time;
    
    if (timeDelta > 0) {
      const velocityX = (delta.x - lastDragPos.current.x) / timeDelta;
      dragVelocityRef.current = { x: velocityX * 100, y: 0 };
      
      // Calculate target rotation from drag velocity - lighter, more responsive
      const velocityMagnitude = Math.abs(dragVelocityRef.current.x);
      const wobbleIntensity = Math.min(velocityMagnitude / 4, 25);
      const wobbleRotation = dragVelocityRef.current.x > 0 ? wobbleIntensity : -wobbleIntensity;
      targetRotation.current = wobbleRotation;
    }
    
    lastDragPos.current = { x: delta.x, y: delta.y, time: now };
    
    // Start spring animation loop if not already running
    if (!springLoopRef.current) {
      isDraggingRef.current = true;
      const springLoop = () => {
        // Spring constants - lighter feel, more responsive
        const stiffness = isDraggingRef.current ? 0.18 : 0.06;
        const damping = 0.82;
        
        // Spring force toward target
        const displacement = targetRotation.current - currentRotation.current;
        const springForce = displacement * stiffness;
        
        // Apply spring force to velocity, then dampen
        rotationVelocity.current += springForce;
        rotationVelocity.current *= damping;
        
        // Update position
        currentRotation.current += rotationVelocity.current;
        
        // Apply to DOM
        if (dragOverlayRef.current) {
          dragOverlayRef.current.style.transform = `rotate(${currentRotation.current}deg)`;
        }
        
        // Keep looping if still moving or dragging
        const isSettled = !isDraggingRef.current && 
          Math.abs(rotationVelocity.current) < 0.01 && 
          Math.abs(currentRotation.current) < 0.1;
        
        if (isSettled) {
          currentRotation.current = 0;
          if (dragOverlayRef.current) {
            dragOverlayRef.current.style.transform = `rotate(0deg)`;
          }
          springLoopRef.current = null;
        } else {
          springLoopRef.current = requestAnimationFrame(springLoop);
        }
      };
      springLoopRef.current = requestAnimationFrame(springLoop);
    }
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
          tags={displayTags}
          images={images}
          onRemoveImageFromTag={handleRemoveImageFromTag}
          containerMode={true}
          onTagCreated={handleTagCreated}
          onTagDeleted={handleTagDeleted}
          demoMode={isDemoMode}
        />
      
      {selectedImageIds.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:min-w-[300px] z-50 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 rounded-lg border border-border bg-card p-3 sm:p-4 shadow-2xl">
          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-4">
            <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
              {selectedImageIds.size} Bild(er)
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={deselectAllImages}
              className="text-xs"
            >
              Aufheben
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleBulkDownload}
              className="flex-1"
            >
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="sm:inline">Download</span>
            </Button>
            {isAdmin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkRotate}
                  className="flex-1"
                >
                  <RotateCw className="h-4 w-4 sm:mr-2" />
                  <span className="sm:inline">Drehen</span>
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4 sm:mr-2" />
                  <span className="sm:inline">
                    {bulkDeleteMutation.isPending ? "..." : "Löschen"}
                  </span>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4 md:gap-6 md:flex-row md:items-end md:justify-between mt-4 md:mt-8">
        <div className="space-y-3 md:space-y-4 w-full">
          <div className="flex flex-col items-stretch gap-3">
            <TagFilter
              tags={displayTags}
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
      <div ref={galleryTopRef}>
        {/* Top Pagination */}
        {renderPagination(false)}
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
        demoMode={isDemoMode}
      />
      {/* Bottom Pagination - scrolls to top on click */}
      {renderPagination(true)}
      {/* Desktop: Detail Dialog mit allen Funktionen */}
      {!isMobile && (
        <ImageDetailDialog
          image={selectedImage}
          onOpenChange={(open) => {
            if (!open) setSelectedImage(null);
          }}
          onSave={(id, data) => updateMutation.mutate({ id, ...data })}
          onRotate={async (id) => {
            // Reload the full gallery to get fresh images
            const res = await fetch('/api/images');
            if (res.ok) {
              const data = await res.json();
              setImages(data.images);
              // Update the selected image
              const updatedImage = data.images.find((img: ImageWithTags) => img.id === id);
              if (updatedImage) {
                setSelectedImage(updatedImage);
              }
            }
          }}
          availableTags={allTags}
        />
      )}
      {/* Mobile: Einfache Vollbildansicht */}
      {isMobile && (
        <ImageFullscreenMobile
          image={selectedImage}
          onClose={() => {
            setSelectedImage(null);
          }}
          availableTags={allTags}
          onSave={(id, data) => updateMutation.mutate({ id, ...data })}
          onNavigate={(direction) => {
            if (!selectedImage) {
              return;
            }
            const currentIndex = sortedImages.findIndex(img => img.id === selectedImage.id);
            if (currentIndex === -1) {
              return;
            }
            
            const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
            if (newIndex >= 0 && newIndex < sortedImages.length) {
              const newImage = sortedImages[newIndex];
              setSelectedImage(newImage);
            } else {
            }
          }}
          hasPrev={selectedImage ? sortedImages.findIndex(img => img.id === selectedImage.id) > 0 : false}
          hasNext={selectedImage ? sortedImages.findIndex(img => img.id === selectedImage.id) < sortedImages.length - 1 : false}
        />
      )}
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
      {/* Insta-Mode */}
      {showInstaMode && (
        <InstaMode
          images={sortedImages}
          onClose={() => {
            setShowInstaMode(false);
          }}
          demoMode={isDemoMode}
        />
      )}
      {/* Rotation Queue */}
      <RotationQueue
        items={rotationQueue}
        onClose={async () => {
          await fetch('/api/rotation-queue', { method: 'DELETE' });
          setRotationQueue([]);
        }}
        onUpdateItem={(id, status, error) => {
          setRotationQueue(prev =>
            prev.map(item => item.id === id ? { ...item, status, error } : item)
          );
        }}
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
          tags={displayTags}
          images={images}
          onRemoveImageFromTag={handleRemoveImageFromTag}
          containerMode={true}
          onTagCreated={handleTagCreated}
          onTagDeleted={handleTagDeleted}
          demoMode={isDemoMode}
        />
      )}
      
      {selectedImageIds.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:min-w-[300px] z-50 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 rounded-lg border border-border bg-card p-3 sm:p-4 shadow-2xl">
          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-4">
            <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
              {selectedImageIds.size} Bild(er)
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={deselectAllImages}
              className="text-xs"
            >
              Aufheben
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleBulkDownload}
              className="flex-1"
            >
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="sm:inline">Download</span>
            </Button>
            {isAdmin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkRotate}
                  className="flex-1"
                >
                  <RotateCw className="h-4 w-4 sm:mr-2" />
                  <span className="sm:inline">Drehen</span>
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4 sm:mr-2" />
                  <span className="sm:inline">
                    {bulkDeleteMutation.isPending ? "..." : "Löschen"}
                  </span>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between mt-8">
        <div className="space-y-4 w-full">
          <div className="flex flex-col items-stretch gap-3">
            <TagFilter
              tags={displayTags}
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
            
            {/* Insta-Mode Button - nur auf Mobile */}
            {isMobile && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShowInstaMode(true);
                }}
              >
                <Heart className="mr-2 h-4 w-4" />
                Insta-Mode
              </Button>
            )}
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
      <div ref={galleryTopRef} className="mt-6">
        {/* Top Pagination */}
        {renderPagination(false)}
      </div>
      <div className="mt-4">
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
            demoMode={isDemoMode}
          />
        </SortableContext>
        {/* Bottom Pagination - scrolls to top on click */}
        {renderPagination(true)}
      </div>
      {/* Desktop: Detail Dialog mit allen Funktionen */}
      {!isMobile && (
        <ImageDetailDialog
          image={selectedImage}
          onOpenChange={(open) => {
            if (!open) setSelectedImage(null);
          }}
          onSave={(id, data) => updateMutation.mutate({ id, ...data })}
          onRotate={async (id) => {
            // Reload the full gallery to get fresh images
            const res = await fetch('/api/images');
            if (res.ok) {
              const data = await res.json();
              setImages(data.images);
              // Update the selected image
              const updatedImage = data.images.find((img: ImageWithTags) => img.id === id);
              if (updatedImage) {
                setSelectedImage(updatedImage);
              }
            }
          }}
          availableTags={allTags}
        />
      )}
      {/* Mobile: Einfache Vollbildansicht */}
      {isMobile && (
        <ImageFullscreenMobile
          image={selectedImage}
          onClose={() => {
            setSelectedImage(null);
          }}
          availableTags={allTags}
          onSave={(id, data) => updateMutation.mutate({ id, ...data })}
          onNavigate={(direction) => {
            if (!selectedImage) {
              return;
            }
            const currentIndex = sortedImages.findIndex(img => img.id === selectedImage.id);
            if (currentIndex === -1) {
              return;
            }
            
            const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
            if (newIndex >= 0 && newIndex < sortedImages.length) {
              const newImage = sortedImages[newIndex];
              setSelectedImage(newImage);
            } else {
            }
          }}
          hasPrev={selectedImage ? sortedImages.findIndex(img => img.id === selectedImage.id) > 0 : false}
          hasNext={selectedImage ? sortedImages.findIndex(img => img.id === selectedImage.id) < sortedImages.length - 1 : false}
        />
      )}
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
              ref={dragOverlayRef}
              imageIds={draggedImagesRef.current} 
              images={displayImages}
              demoMode={isDemoMode}
            />
          ) : null}
        </DragOverlay>
      )}
      {/* Insta-Mode */}
      {showInstaMode && (
        <InstaMode
          images={sortedImages}
          onClose={() => {
            setShowInstaMode(false);
          }}
          demoMode={isDemoMode}
        />
      )}
      {/* Rotation Queue */}
      <RotationQueue
        items={rotationQueue}
        onClose={async () => {
          await fetch('/api/rotation-queue', { method: 'DELETE' });
          setRotationQueue([]);
        }}
        onUpdateItem={(id, status, error) => {
          setRotationQueue(prev =>
            prev.map(item => item.id === id ? { ...item, status, error } : item)
          );
        }}
      />

      {/* Processing Status Indicator */}
      <ProcessingStatusIndicator />
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
// Simple preview component for dragged images with physics - optimized with forwardRef
const SimpleDragPreview = React.forwardRef<
  HTMLDivElement,
  { 
    imageIds: string[]; 
    images: ImageWithTags[];
    demoMode?: boolean;
  }
>(function SimpleDragPreview({ imageIds, images, demoMode = false }, ref) {
  const BASE_URL = process.env.NEXT_PUBLIC_MINIO_BASE_URL;
  
  // Memoize filtered images to avoid recalculation
  const draggedImages = useMemo(
    () => images.filter(img => imageIds.includes(img.id)),
    [images, imageIds]
  );
  
  if (draggedImages.length === 0) return null;
  
  return (
    <div 
      ref={ref}
      style={{ 
        position: 'relative', 
        transform: 'rotate(0deg)', 
        pointerEvents: 'none',
        willChange: 'transform',
      }}
    >
      {draggedImages.map((image, index) => {
        const fallback = `https://dummyimage.com/600x400/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
        const imageUrl = demoMode 
          ? getDemoImageUrl(image.id)
          : (BASE_URL ? `${BASE_URL.replace(/\/$/, "")}/${image.key}` : fallback);
        
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
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale}) translateZ(0)`,
              opacity: 0.95 - (index * 0.1),
              zIndex: draggedImages.length - index,
              willChange: 'transform',
              backfaceVisibility: 'hidden',
            }}
          >
            <div className="relative aspect-[4/3]">
              <img
                src={imageUrl}
                alt={image.filename}
                className="w-full h-full object-cover"
                loading="eager"
                decoding="async"
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
});
