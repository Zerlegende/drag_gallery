"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation } from "@tanstack/react-query";

import { UploadDropzone, type UploadRequest } from "@/components/gallery/upload-dropzone";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { TagFilter } from "@/components/gallery/tag-filter";
import { ImageDetailDialog } from "@/components/gallery/image-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ImageWithTags, TagRecord } from "@/lib/db";
import { formatFileSize } from "@/lib/utils";

type ToastState = { type: "success" | "error"; message: string } | null;

export type GalleryShellProps = {
  initialImages: ImageWithTags[];
  allTags: TagRecord[];
  initialFilter?: string[];
};

export function GalleryShell({ initialImages, allTags, initialFilter = [] }: GalleryShellProps) {
  const [images, setImages] = useState(initialImages);
  const [availableTags, setAvailableTags] = useState(allTags);
  const [filterTags, setFilterTags] = useState<string[]>(initialFilter);
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [selectedImage, setSelectedImage] = useState<ImageWithTags | null>(null);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor));

  const filteredImages = useMemo(() => {
    return images.filter((image) => {
      const matchesSearch = searchTerm.length === 0 || image.filename.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (filterTags.length === 0) return true;
      const tagIds = new Set(image.tags.map((tag) => tag.id));
      return filterTags.every((tagId) => tagIds.has(tagId));
    });
  }, [filterTags, images, searchTerm]);

  const reorderMutation = useMutation({
    mutationFn: async (payload: { id: string; position: number }[]) => {
      const res = await fetch("/api/images/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: payload }),
      });
      if (!res.ok) {
        throw new Error("Konnte Reihenfolge nicht speichern");
      }
    },
    onError: (error: Error) => {
      setToast({ type: "error", message: error.message });
    },
    onSuccess: () => setToast({ type: "success", message: "Reihenfolge gespeichert." }),
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setImages((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      const sorted = arrayMove(prev, oldIndex, newIndex);
      reorderMutation.mutate(
        sorted.map((image, index) => ({ id: image.id, position: index })),
      );
      return sorted.map((image, index) => ({ ...image, position: index }));
    });
  };

  const uploadMutation = useMutation({
    mutationFn: async (payload: UploadRequest) => {
      const presignedResponse = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: payload.metadata.filename,
          mime: payload.metadata.mime,
          size: payload.metadata.size,
        }),
      });
      if (!presignedResponse.ok) {
        throw new Error("Konnte Upload-URL nicht erhalten");
      }
      const { url, fields, objectKey } = await presignedResponse.json();

      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value as string);
      });
      formData.append("file", payload.file);

      const uploadRes = await fetch(url, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        throw new Error("Upload zu MinIO fehlgeschlagen");
      }

      const metaResponse = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: payload.metadata.filename,
          key: objectKey,
          mime: payload.metadata.mime,
          size: payload.metadata.size,
          tags: payload.tags,
        }),
      });

      if (!metaResponse.ok) {
        throw new Error("Metadaten konnten nicht gespeichert werden");
      }

      const { image } = (await metaResponse.json()) as { image: ImageWithTags };
      return image;
    },
    onError: (error: Error) => {
      setToast({ type: "error", message: error.message });
    },
    onSuccess: (image) => {
      setImages((prev) => [{ ...image }, ...prev]);
      setToast({ type: "success", message: `${image.filename} wurde hochgeladen.` });
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
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; tags: string[] }) => {
      const res = await fetch(`/api/images/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: payload.tags }),
      });
      if (!res.ok) {
        throw new Error("Speichern fehlgeschlagen");
      }
      return (await res.json()) as { image: ImageWithTags };
    },
    onSuccess: ({ image }) => {
      setImages((prev) => prev.map((item) => (item.id === image.id ? image : item)));
      setSelectedImage(image);
      setToast({ type: "success", message: "Bild wurde aktualisiert." });
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
    onError: (error: Error) => setToast({ type: "error", message: error.message }),
  });

  const handleUploadBatch = async (payloads: UploadRequest[]) => {
    for (const payload of payloads) {
      await uploadMutation.mutateAsync(payload);
    }
  };

  const removeFilterTag = (tagId: string) => {
    setFilterTags((prev) => prev.filter((id) => id !== tagId));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4 md:max-w-2xl">
          <UploadDropzone
            isUploading={uploadMutation.isPending}
            onUpload={handleUploadBatch}
          />
          <TagFilter
            tags={availableTags}
            activeTagIds={filterTags}
            onToggle={(tagId) =>
              setFilterTags((prev) =>
                prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
              )
            }
            onSearchChange={setSearchTerm}
          />
          {filterTags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Aktive Filter:</span>
              {filterTags.map((tagId) => {
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
        <div className="self-start rounded-lg border border-dashed border-border bg-card/50 px-4 py-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Status</p>
          <p>{uploadMutation.isPending ? "Lade hoch..." : "Bereit für neue Uploads"}</p>
          {toast ? (
            <p className={`mt-2 text-xs ${toast.type === "error" ? "text-destructive" : "text-emerald-600"}`}>
              {toast.message}
            </p>
          ) : null}
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={filteredImages.map((image) => image.id)} strategy={rectSortingStrategy}>
          <GalleryGrid
            images={filteredImages}
            onSelectImage={setSelectedImage}
            isReordering={reorderMutation.isPending}
          />
        </SortableContext>
      </DndContext>

      <ImageDetailDialog
        image={selectedImage}
        onOpenChange={(open) => {
          if (!open) setSelectedImage(null);
        }}
        onSave={(id, tags) => updateMutation.mutate({ id, tags })}
      />

      <div className="rounded-md border border-border bg-card/40 p-4 text-sm text-muted-foreground">
        <p>
          Gesamtbilder: <span className="font-medium text-foreground">{images.length}</span>
        </p>
        <p>
          Gesamtgröße: {formatFileSize(images.reduce((acc, item) => acc + (item.size ?? 0), 0))}
        </p>
      </div>
    </div>
  );
}
