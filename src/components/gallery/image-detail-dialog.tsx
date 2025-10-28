"use client";

import { useEffect, useState } from "react";

import type { ImageWithTags, TagRecord } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { formatFileSize, cn } from "@/lib/utils";
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
  availableTags?: TagRecord[];
};

export function ImageDetailDialog({ image, onOpenChange, onSave, availableTags = [] }: ImageDetailDialogProps) {
  const [imageNameInput, setImageNameInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearchInput, setTagSearchInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (image) {
      setSelectedTags(image.tags.map((tag) => tag.name));
      setImageNameInput(image.imagename || "");
      setTagSearchInput("");
      setShowSuggestions(false);
    }
  }, [image]);

  if (!image) {
    return null;
  }

  const fallback = `https://dummyimage.com/1024x768/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
  const imageUrl = buildImageUrl(image.key, fallback);

  // Filter suggestions based on search input (ensure availableTags is an array)
  const suggestions = (Array.isArray(availableTags) ? availableTags : [])
    .filter(tag => 
      !selectedTags.includes(tag.name) && 
      tag.name.toLowerCase().includes(tagSearchInput.toLowerCase())
    )
    .slice(0, 10); // Limit to 10 suggestions

  const handleAddTag = (tagName: string) => {
    if (!selectedTags.includes(tagName)) {
      setSelectedTags([...selectedTags, tagName]);
    }
    setTagSearchInput("");
    setShowSuggestions(false);
  };

  const handleRemoveTag = (tagName: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tagName));
  };

  const handleSubmit = () => {
    onSave(image.id, {
      tags: selectedTags,
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
            <label className="text-sm font-medium text-muted-foreground">
              Tags
            </label>
            
            {/* Selected Tags */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedTags.map((tagName) => (
                  <Badge key={tagName} variant="secondary" className="gap-1">
                    {tagName}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tagName)}
                      className="ml-1 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Tag Search Input */}
            <div className="relative">
              <Input
                value={tagSearchInput}
                onChange={(e) => {
                  setTagSearchInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Tag hinzufügen..."
              />
              
              {/* Suggestions Dropdown */}
              {showSuggestions && tagSearchInput && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {suggestions.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleAddTag(tag.name)}
                      className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}

              {/* No results message */}
              {showSuggestions && tagSearchInput && suggestions.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg p-3 text-sm text-muted-foreground">
                  Kein existierender Tag gefunden. Nur vorhandene Tags können hinzugefügt werden.
                </div>
              )}
            </div>
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
