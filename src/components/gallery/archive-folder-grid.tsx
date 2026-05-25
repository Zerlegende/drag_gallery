"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Plus, Pencil, Trash2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { ArchiveRecord } from "@/lib/db";

type ArchiveFolderGridProps = {
  archives: ArchiveRecord[];
  isAdmin?: boolean;
  onArchivesChanged?: () => void;
};

export function ArchiveFolderGrid({ archives, isAdmin = false, onArchivesChanged }: ArchiveFolderGridProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingArchive, setEditingArchive] = useState<ArchiveRecord | null>(null);
  const [deletingArchive, setDeletingArchive] = useState<ArchiveRecord | null>(null);
  const [newName, setNewName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/archives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error("Fehler beim Erstellen");
      showToast("success", `Archiv "${newName.trim()}" erstellt`, 2000);
      setShowCreateDialog(false);
      setNewName("");
      onArchivesChanged?.();
      router.refresh();
    } catch {
      showToast("error", "Archiv konnte nicht erstellt werden");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRename = async () => {
    if (!editingArchive || !newName.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/archives/${editingArchive.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error("Fehler beim Umbenennen");
      showToast("success", "Archiv umbenannt", 2000);
      setEditingArchive(null);
      setNewName("");
      onArchivesChanged?.();
      router.refresh();
    } catch {
      showToast("error", "Archiv konnte nicht umbenannt werden");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingArchive) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/archives/${deletingArchive.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Fehler beim Löschen");
      showToast("success", `Archiv "${deletingArchive.name}" gelöscht — Bilder sind wieder in der Hauptgalerie`, 3000);
      setDeletingArchive(null);
      onArchivesChanged?.();
      router.refresh();
    } catch {
      showToast("error", "Archiv konnte nicht gelöscht werden");
    } finally {
      setIsLoading(false);
    }
  };

  if (archives.length === 0 && !isAdmin) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Archive</h2>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setNewName(""); setShowCreateDialog(true); }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Neues Archiv
          </Button>
        )}
      </div>

      {archives.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
          Noch keine Archive. Erstelle ein Archiv um Bilder zu organisieren.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {archives.map((archive) => (
            <div
              key={archive.id}
              className="group relative rounded-xl border border-border bg-card p-4 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col items-center gap-2"
              onClick={() => router.push(`/archive/${archive.id}`)}
            >
              <FolderOpen className="h-10 w-10 text-yellow-500 group-hover:scale-110 transition-transform duration-200" />
              <span className="text-sm font-medium text-center truncate w-full text-center">
                {archive.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {archive.image_count ?? 0} Bild{(archive.image_count ?? 0) !== 1 ? "er" : ""}
              </span>

              {isAdmin && (
                <div
                  className="absolute top-1 right-1 hidden group-hover:flex gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="rounded p-1 hover:bg-muted transition-colors"
                    title="Umbenennen"
                    onClick={() => { setEditingArchive(archive); setNewName(archive.name); }}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    className="rounded p-1 hover:bg-destructive/10 transition-colors"
                    title="Löschen"
                    onClick={() => setDeletingArchive(archive)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Archiv erstellen */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Archiv erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Name des Archivs"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Abbrechen</Button>
              <Button onClick={handleCreate} disabled={isLoading || !newName.trim()}>Erstellen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archiv umbenennen */}
      <Dialog open={!!editingArchive} onOpenChange={(open) => { if (!open) setEditingArchive(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archiv umbenennen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Neuer Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingArchive(null)}>Abbrechen</Button>
              <Button onClick={handleRename} disabled={isLoading || !newName.trim()}>Speichern</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archiv löschen */}
      <ConfirmDialog
        open={!!deletingArchive}
        onOpenChange={(open) => { if (!open) setDeletingArchive(null); }}
        title="Archiv löschen"
        description={`Möchtest du das Archiv "${deletingArchive?.name}" wirklich löschen? Die enthaltenen Bilder werden zurück in die Hauptgalerie verschoben.`}
        confirmText="Löschen"
        cancelText="Abbrechen"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
