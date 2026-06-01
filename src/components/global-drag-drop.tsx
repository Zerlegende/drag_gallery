"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useUploadQueue } from "@/contexts/upload-queue-context";

const ACCEPTED = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "image/avif"];

export function GlobalDragDrop() {
  const { queueExpanded, uploadDialogOpen, openUploadDialog } = useUploadQueue();
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);

  const suppress = queueExpanded || uploadDialogOpen;

  const hasImageFiles = (e: DragEvent) =>
    Array.from(e.dataTransfer?.items ?? []).some(
      item => item.kind === "file" && ACCEPTED.includes(item.type)
    );

  const onDragEnter = useCallback((e: DragEvent) => {
    if (suppress || !hasImageFiles(e)) return;
    counter.current++;
    setDragging(true);
  }, [suppress]);

  const onDragLeave = useCallback(() => {
    if (suppress) return;
    counter.current--;
    if (counter.current === 0) setDragging(false);
  }, [suppress]);

  const onDragOver = useCallback((e: DragEvent) => {
    if (!suppress && hasImageFiles(e)) e.preventDefault();
  }, [suppress]);

  const onDrop = useCallback((e: DragEvent) => {
    if (suppress) return;
    e.preventDefault();
    counter.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []).filter(f => ACCEPTED.includes(f.type));
    if (files.length === 0) return;
    openUploadDialog(files);
  }, [suppress, openUploadDialog]);

  useEffect(() => {
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [onDragEnter, onDragLeave, onDragOver, onDrop]);

  if (!dragging) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-primary/20 backdrop-blur-sm border-4 border-dashed border-primary pointer-events-none">
      <div className="flex flex-col items-center gap-3 text-primary">
        <Upload className="h-16 w-16" />
        <p className="text-2xl font-semibold">Bilder hier ablegen</p>
      </div>
    </div>
  );
}
