"use client";

import { useEffect, useState } from "react";

import type { ImageWithTags } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatFileSize } from "@/lib/utils";
import { env } from "@/lib/env";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

function buildImageUrl(key: string, fallback: string) {
  if (!BASE_URL) return fallback;
  return `${BASE_URL.replace(/\/$/, "")}/${key}`;
}

export type ImageDetailDialogProps = {
  image: ImageWithTags | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: { tags?: string[]; imagename?: string }) => void;
};

export function ImageDetailDialog({ image, onOpenChange, onSave }: ImageDetailDialogProps) {
  const [tagInput, setTagInput] = useState("");
  const [imageNameInput, setImageNameInput] = useState("");

  useEffect(() => {
    if (image) {
      setTagInput(image.tags.map((tag) => tag.name).join(", "));
      setImageNameInput(image.imagename || "");
    }
  }, [image]);

  if (!image) {
    return null;
  }

  const fallback = `https://dummyimage.com/1024x768/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
  const imageUrl = buildImageUrl(image.key, fallback);

  const handleSubmit = () => {
    const tags = tagInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    
    onSave(image.id, {
      tags,
      imagename: imageNameInput.trim() || undefined,
    });
  };

  return (
    <Dialog open={Boolean(image)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{image.filename}</DialogTitle>
          <DialogDescription>
            Hochgeladen am {new Date(image.created_at).toLocaleString("de-DE")} · {formatFileSize(image.size ?? 0)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-border">
            <img src={imageUrl} alt={image.filename} className="w-full" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="detail-imagename">
              Bildname
            </label>
            <Input
              id="detail-imagename"
              value={imageNameInput}
              onChange={(event) => setImageNameInput(event.target.value)}
              placeholder="Optionaler Name für das Bild"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="detail-tags">
              Tags aktualisieren
            </label>
            <Input
              id="detail-tags"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="Schlüsselwörter mit Kommas trennen"
            />
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          <Button onClick={handleSubmit}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
