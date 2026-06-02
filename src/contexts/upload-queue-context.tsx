"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type QueueItemStatus = "pending" | "uploading" | "processing" | "done" | "error" | "retrying";

export type QueueItem = {
  id: string;
  file: File;
  preview: string;
  status: QueueItemStatus;
  uploadProgress: number;
  processingProgress: number;
  imageId?: string;
  error?: string;
  attempt?: number;
  retryAt?: number;
};

type UploadQueueContextType = {
  queue: QueueItem[];
  addFiles: (files: File[]) => void;
  removeItem: (id: string) => void;
  retryItem: (id: string) => void;
  clearDone: () => void;
  queueExpanded: boolean;
  setQueueExpanded: (v: boolean) => void;
  // Global upload dialog control (one single instance in layout)
  uploadDialogOpen: boolean;
  uploadDialogFiles: File[];
  openUploadDialog: (files?: File[]) => void;
  closeUploadDialog: () => void;
};

const UploadQueueContext = createContext<UploadQueueContextType | null>(null);

const MAX_CONCURRENT = 3;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "image/avif"];

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDialogFiles, setUploadDialogFiles] = useState<File[]>([]);
  const activeUploads = useRef(0);

  const openUploadDialog = useCallback((files?: File[]) => {
    setUploadDialogFiles(files ?? []);
    setUploadDialogOpen(true);
  }, []);

  const closeUploadDialog = useCallback(() => {
    setUploadDialogOpen(false);
    setUploadDialogFiles([]);
  }, []);
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const retryTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const processQueueRef = useRef<(q: QueueItem[]) => void>(() => {});

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const stopPolling = useCallback((id: string) => {
    const interval = intervalsRef.current.get(id);
    if (interval) {
      clearInterval(interval);
      intervalsRef.current.delete(id);
    }
  }, []);

  const trackProcessing = useCallback((itemId: string, imageId: string, fileSize: number) => {
    const estimatedMs = Math.min(60_000, 8_000 + (fileSize / (1024 * 1024)) * 4_000);
    const startTime = Date.now();
    // Require several consecutive "not found" responses before marking done,
    // to handle the delay between upload and the image appearing in the processing queue.
    let notFoundCount = 0;
    const NOT_FOUND_THRESHOLD = 4;

    const interval = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      const estimated = Math.min(93, Math.round((elapsed / estimatedMs) * 93));

      try {
        const res = await fetch("/api/images/processing-status");
        if (!res.ok) throw new Error();
        const data = await res.json();
        const img = data.images?.find((i: { id: string }) => i.id === imageId);

        if (!img) {
          notFoundCount++;
          // Only mark done after several consecutive misses (image may not appear immediately)
          if (notFoundCount >= NOT_FOUND_THRESHOLD) {
            stopPolling(itemId);
            updateItem(itemId, { status: "done", processingProgress: 100 });
            window.dispatchEvent(new CustomEvent("gallery-upload-complete"));
          } else {
            updateItem(itemId, { processingProgress: estimated });
          }
        } else if (img.variant_status === "failed") {
          stopPolling(itemId);
          updateItem(itemId, { status: "error", error: "Verarbeitung fehlgeschlagen" });
        } else {
          notFoundCount = 0;
          updateItem(itemId, { processingProgress: estimated });
        }
      } catch {
        updateItem(itemId, { processingProgress: estimated });
      }
    }, 2_000);

    intervalsRef.current.set(itemId, interval);
  }, [updateItem, stopPolling]);

  const uploadItem = useCallback(async (item: QueueItem) => {
    updateItem(item.id, { status: "uploading", uploadProgress: 0 });

    try {
      // Step 1: get presigned URL
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: item.file.name, mime: item.file.type, size: item.file.size }),
      });
      if (!uploadRes.ok) throw new Error("Presigned URL konnte nicht erstellt werden");
      const { url, fields, objectKey } = await uploadRes.json();

      // Step 2: XHR upload to MinIO with progress
      await new Promise<void>((resolve, reject) => {
        const formData = new FormData();
        Object.entries(fields as Record<string, string>).forEach(([k, v]) => formData.append(k, v));
        formData.append("file", item.file);

        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            updateItem(item.id, { uploadProgress: Math.round((e.loaded / e.total) * 100) });
          }
        });
        xhr.addEventListener("load", () => {
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`MinIO Upload fehlgeschlagen (${xhr.status})`));
        });
        xhr.addEventListener("error", () => reject(new Error("Netzwerkfehler beim Upload")));
        xhr.open("POST", url);
        xhr.send(formData);
      });

      updateItem(item.id, { uploadProgress: 100 });

      // Step 3: register in DB
      const metaRes = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: item.file.name, key: objectKey, mime: item.file.type, size: item.file.size, tags: [] }),
      });
      if (!metaRes.ok) throw new Error("Metadaten konnten nicht gespeichert werden");
      const { image } = await metaRes.json();
      const imageId: string = image.id;

      updateItem(item.id, { status: "processing", processingProgress: 0, imageId });
      trackProcessing(item.id, imageId, item.file.size);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      const attempt = (item.attempt ?? 0) + 1;
      if (attempt < MAX_ATTEMPTS) {
        // Auto-retry after a delay; item goes back to "pending" so processQueue picks it up.
        const retryAt = Date.now() + RETRY_DELAY_MS;
        updateItem(item.id, { status: "retrying", attempt, error: msg, retryAt, uploadProgress: 0 });
        const timeout = setTimeout(() => {
          retryTimeoutsRef.current.delete(item.id);
          updateItem(item.id, { status: "pending", error: undefined, retryAt: undefined });
          setQueue(q => { processQueueRef.current(q); return q; });
        }, RETRY_DELAY_MS);
        retryTimeoutsRef.current.set(item.id, timeout);
      } else {
        updateItem(item.id, { status: "error", attempt, error: msg });
      }
    }
  }, [updateItem, trackProcessing]);

  const processQueue = useCallback((currentQueue: QueueItem[]) => {
    const pending = currentQueue.filter(i => i.status === "pending");
    const slots = MAX_CONCURRENT - activeUploads.current;
    const toStart = pending.slice(0, slots);

    for (const item of toStart) {
      activeUploads.current++;
      uploadItem(item).finally(() => {
        activeUploads.current--;
        setQueue(q => {
          processQueue(q);
          return q;
        });
      });
    }
  }, [uploadItem]);

  processQueueRef.current = processQueue;

  const retryItem = useCallback((id: string) => {
    const timeout = retryTimeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      retryTimeoutsRef.current.delete(id);
    }
    updateItem(id, { status: "pending", attempt: 0, error: undefined, uploadProgress: 0, processingProgress: 0, retryAt: undefined });
    setQueue(q => { processQueueRef.current(q); return q; });
  }, [updateItem]);

  const addFiles = useCallback((files: File[]) => {
    const valid = files.filter(f => ACCEPTED_TYPES.includes(f.type));
    if (valid.length === 0) return;

    const newItems: QueueItem[] = valid.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
      status: "pending",
      uploadProgress: 0,
      processingProgress: 0,
    }));

    setQueue(prev => {
      const updated = [...prev, ...newItems];
      // Kick off processing after state update
      setTimeout(() => processQueue(updated), 0);
      return updated;
    });
  }, [processQueue]);

  const removeItem = useCallback((id: string) => {
    stopPolling(id);
    const retryTimeout = retryTimeoutsRef.current.get(id);
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeoutsRef.current.delete(id);
    }
    setQueue(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter(i => i.id !== id);
    });
  }, [stopPolling]);

  const clearDone = useCallback(() => {
    setQueue(prev => {
      prev.filter(i => i.status === "done" || i.status === "error").forEach(i => {
        URL.revokeObjectURL(i.preview);
        stopPolling(i.id);
      });
      return prev.filter(i => i.status !== "done" && i.status !== "error");
    });
  }, [stopPolling]);

  return (
    <UploadQueueContext.Provider value={{ queue, addFiles, removeItem, retryItem, clearDone, queueExpanded, setQueueExpanded, uploadDialogOpen, uploadDialogFiles, openUploadDialog, closeUploadDialog }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error("useUploadQueue must be used within UploadQueueProvider");
  return ctx;
}
