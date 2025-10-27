"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Plus, Trash2, ChevronsDownUp, ChevronsUpDown, Pencil } from "lucide-react";
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
  const { rightSidebarOpen, setRightSidebarOpen } = useSidebar();
  const { showToast } = useToast();
  const { data: session } = useSession();
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<{ id: string; name: string } | null>(null);
  const [expandedTags, setExpandedTags] = useState<Record<string, boolean>>(() => {
    // Lade gespeicherte Zustände aus Cookie
    return getExpandedTags(tags.map(t => t.id));
  });

  const isAdmin = (session?.user as any)?.role === "admin";

  // Speichere Tag-Zustände im Cookie, wenn sie sich ändern
  useEffect(() => {
    saveExpandedTags(expandedTags);
  }, [expandedTags]);

  // Aktualisiere expandedTags, wenn neue Tags hinzukommen
  useEffect(() => {
    const currentTagIds = tags.map(t => t.id);
    const savedStates = getExpandedTags(currentTagIds);
    
    // Prüfe ob neue Tags hinzugekommen sind
    const hasNewTags = currentTagIds.some(id => !(id in expandedTags));
    
    if (hasNewTags) {
      setExpandedTags(savedStates);
    }
  }, [tags]);

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
    <aside 
      className={cn(
        "fixed top-0 right-0 h-screen bg-background border-l border-border shadow-lg transition-all duration-300 z-30 flex flex-col",
        rightSidebarOpen ? "w-80" : "w-16"
      )}
    >
      {/* Toggle Button */}
      <div className="flex h-14 items-center justify-center border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
          className="h-8 w-8 p-0"
        >
          {rightSidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Panel Content */}
      <div className={cn(
        "flex flex-col flex-1 overflow-hidden",
        !rightSidebarOpen && "hidden"
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
              />
            ))
          )}
        </div>
      </div>

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
};

function TagContainer({ tag, images, onRemoveImage, onDeleteTag, containerMode, isAdmin, isExpanded, onToggleExpanded }: TagContainerProps) {
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
                setIsRenaming(true);
              }}
              className="h-8 w-8 p-0 ml-2"
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
