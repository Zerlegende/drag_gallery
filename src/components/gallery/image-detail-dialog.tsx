"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import type { ImageWithTags, TagRecord } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, RotateCw, Settings } from "lucide-react";
import Link from "next/link";
import { formatFileSize, cn } from "@/lib/utils";
import { getImageVariantKey, buildImageUrl } from "@/lib/image-variants-utils";
import { env } from "@/lib/env";
import { getDemoMode } from "@/lib/user-preferences";
import { getDemoImageUrl } from "@/lib/demo-mode";
import { useToast } from "@/components/ui/toast";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

export type ImageDetailDialogProps = {
  image: ImageWithTags | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: { tags?: string[]; imagename?: string }) => void;
  onRotate?: (id: string) => void;
  availableTags?: TagRecord[];
};

export function ImageDetailDialog({ image, onOpenChange, onSave, onRotate, availableTags = [] }: ImageDetailDialogProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const isDemoMode = getDemoMode();
  const { showToast } = useToast();
  
  const [imageNameInput, setImageNameInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearchInput, setTagSearchInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageKey, setImageKey] = useState(0); // For forcing image reload

  useEffect(() => {
    if (image) {
      setSelectedTags(image.tags.map((tag) => tag.name));
      setImageNameInput(image.imagename || "");
      setTagSearchInput("");
      setShowSuggestions(false);
      setImageKey(prev => prev + 1); // Force reload image
    }
  }, [image]);

  // Handle browser back button / gesture navigation
  useEffect(() => {
    if (!image) return;

    // Add hash to URL when opening
    window.history.pushState(null, "", "#detail");

    // Listen for back button
    const handlePopState = () => {
      onOpenChange(false);
    };

    window.addEventListener("popstate", handlePopState);

    // Cleanup: remove listener and reset URL
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Remove hash from URL without navigating back
      if (window.location.hash === "#detail") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
  }, [image, onOpenChange]);

  if (!image) {
    return null;
  }

  const fallback = `https://dummyimage.com/1024x768/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
  const timestamp = image.updated_at || image.created_at;
  const fullscreenKey = getImageVariantKey(image.key, 'fullscreen', image.variant_status);
  
  // In demo mode, use demo image with proper seed
  const imageUrl = isDemoMode 
    ? getDemoImageUrl(image.id, 1920, 1080)
    : buildImageUrl(BASE_URL, fullscreenKey, fallback, timestamp);

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

  const handleCreateAndAddTag = () => {
    const trimmedInput = tagSearchInput.trim();
    if (trimmedInput && !selectedTags.includes(trimmedInput)) {
      setSelectedTags([...selectedTags, trimmedInput]);
      setTagSearchInput("");
      setShowSuggestions(false);
    }
  };

  const handleRemoveTag = (tagName: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tagName));
  };

  const handleSubmit = async () => {
    if (isDemoMode) {
      // In demo mode, simulate saving with a delay
      setIsSaving(true);
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsSaving(false);
      showToast({
        title: "Demo-Modus",
        description: "Änderungen werden im Demo-Modus nicht gespeichert.",
      });
      onOpenChange(false);
      return;
    }
    
    onSave(image.id, {
      tags: selectedTags,
      imagename: imageNameInput.trim() || undefined,
    });
  };

  const handleRotate = async () => {
    if (!image || isRotating) return;
    
    setIsRotating(true);
    try {
      const response = await fetch(`/api/images/${image.id}/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ degrees: 90 }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error("Rotation failed:", errorData);
        throw new Error(errorData.error || "Failed to rotate image");
      }

      // Notify parent to refresh gallery - this will update the image object with new updated_at
      if (onRotate) {
        await onRotate(image.id);
      }
      
      // Force image reload by incrementing key
      setImageKey(prev => prev + 1);
    } catch (error) {
      console.error("Error rotating image:", error);
      alert(`Fehler beim Drehen des Bildes: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    } finally {
      setIsRotating(false);
    }
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
          <div className="overflow-hidden rounded-lg border border-border relative">
            <img 
              key={imageKey} 
              src={imageUrl}
              alt={image.filename} 
              className="w-full"
            />
            {isAdmin && (
              <div className="absolute top-2 right-2 flex gap-2">
                {onRotate && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRotate}
                    disabled={isRotating}
                  >
                    <RotateCw className={cn("h-4 w-4", isRotating && "animate-spin")} />
                  </Button>
                )}
                <Link href={`/admin/images/${image.id}/variants`}>
                  <Button
                    variant="secondary"
                    size="sm"
                    title="Varianten verwalten"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isDemoMode && tagSearchInput.trim()) {
                    e.preventDefault();
                    handleCreateAndAddTag();
                  }
                }}
                placeholder={isDemoMode ? "Demo-Tag hinzufügen..." : "Tag hinzufügen..."}
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

              {/* No results message or demo mode hint */}
              {showSuggestions && tagSearchInput && suggestions.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg p-3 text-sm text-muted-foreground">
                  {isDemoMode ? (
                    <>
                      <div className="font-medium text-foreground mb-1">Demo-Modus</div>
                      Drücke Enter um &quot;{tagSearchInput}&quot; als Demo-Tag hinzuzufügen. Änderungen werden nicht gespeichert.
                    </>
                  ) : (
                    "Kein existierender Tag gefunden. Nur vorhandene Tags können hinzugefügt werden."
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Schließen
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Speichere..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
