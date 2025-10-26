"use client";

import Image from "next/image";
import { useMemo } from "react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";

import type { ImageWithTags } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
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
  isReordering: boolean;
};

export function GalleryGrid({ images, onSelectImage, isReordering }: GalleryGridProps) {
  const grouped = useMemo(() => {
    return images.reduce<ImageWithTags[][]>((acc, image, index) => {
      const chunkIndex = Math.floor(index / 3);
      acc[chunkIndex] = acc[chunkIndex] ? [...acc[chunkIndex], image] : [image];
      return acc;
    }, []);
  }, [images]);

  if (images.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
        Noch keine Bilder. Lade erste Dateien hoch, um zu starten.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {grouped.map((column, columnIndex) => (
        <div key={columnIndex} className="space-y-4">
          {column.map((image) => (
            <SortableImageCard
              key={image.id}
              image={image}
              onSelect={() => onSelectImage(image)}
              isReordering={isReordering}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

type SortableImageCardProps = {
  image: ImageWithTags;
  onSelect: () => void;
  isReordering: boolean;
};

function SortableImageCard({ image, onSelect, isReordering }: SortableImageCardProps) {
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, attributes, isDragging } = useSortable({
    id: image.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const fallback = `https://dummyimage.com/600x400/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
  const imageUrl = getImageUrl(image.key, fallback);

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition",
        isDragging ? "ring-2 ring-primary" : "",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        onClick={onSelect}
        className="block w-full"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={imageUrl}
            alt={image.filename}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {isReordering ? (
            <div className="absolute inset-0 bg-black/20" />
          ) : null}
        </div>
        <div className="space-y-2 p-4 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground truncate pr-2">{image.filename}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(image.created_at).toLocaleDateString("de-DE")}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
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
        </div>
      </button>
    </article>
  );
}
