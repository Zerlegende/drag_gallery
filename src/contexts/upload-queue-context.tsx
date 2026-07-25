"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { canHashFiles, hashFile, isAcceptedFile, resolveMimeType } from "@/lib/upload-files";

export type QueueItemStatus =
  | "checking"
  | "pending"
  | "uploading"
  | "processing"
  | "done"
  | "error"
  | "retrying"
  | "duplicate";

/** Wo das identische Bild schon existiert */
export type DuplicateInfo = {
  filename: string;
  imageId?: string;
  /** "gallery" = liegt schon in der Galerie, "selection" = doppelt in dieser Auswahl */
  scope: "gallery" | "selection";
};

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
  contentHash?: string;
  duplicateOf?: DuplicateInfo;
  /** Was der Server gerade mit dem Bild macht */
  phase?: ProcessingPhase;
  /** Warteposition und Länge der Server-Queue, solange noch nichts läuft */
  queuePosition?: number;
  queueLength?: number;
};

export type RejectedFile = { name: string; reason: string };

export type ProcessingPhase = "downloading" | "converting" | "variants";

export type ServerImage = {
  id: string;
  filename: string;
  variant_status: string;
  /** Was gerade passiert – nur während 'processing' gesetzt */
  phase: ProcessingPhase | null;
  completedSteps: number | null;
  totalSteps: number | null;
  /** Warteposition, nur während 'pending' gesetzt */
  queuePosition: number | null;
  queueLength: number;
};

export type ServerStatus = {
  images: ServerImage[];
  unknown?: string[];
  queue: { queueLength: number; processing: number; maxConcurrent: number };
};

type UploadQueueContextType = {
  queue: QueueItem[];
  serverStatus: ServerStatus | null;
  rejectedFiles: RejectedFile[];
  dismissRejected: () => void;
  addFiles: (files: File[]) => void;
  removeItem: (id: string) => void;
  retryItem: (id: string) => void;
  /** Ein als Duplikat erkanntes Bild trotzdem hochladen */
  uploadAnyway: (id: string) => void;
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

const MAX_CONCURRENT = 4;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;

/** Poll-Intervall des einen globalen Status-Pollers */
const POLL_INTERVAL_MS = 2_000;
/**
 * So oft hintereinander muss ein Bild noch offen sein, während die Server-Queue
 * komplett leer ist, bevor es als verwaist gilt. Das passiert, wenn der Server
 * neu gestartet wurde und das Recovery nicht griff – ohne diese Erkennung
 * würde der Client für immer weiterpollen.
 */
const ORPHAN_THRESHOLD = 5;
/** Upload-Fortschritt wird gesammelt und nur so oft in den State geschrieben */
const PROGRESS_FLUSH_MS = 250;
/** Die Galerie wird höchstens so oft neu geladen, egal wie viele Bilder fertig werden */
const GALLERY_REFRESH_MS = 5_000;
/**
 * Nur für so viele Items werden Vorschaubilder erzeugt. Verhindert, dass bei
 * hunderten Bildern hunderte Blob-URLs im Speicher gehalten werden.
 */
const MAX_PREVIEWS = 30;
/** Kantenlänge der erzeugten Thumbnails */
const THUMBNAIL_SIZE = 96;
/**
 * So viele Dateien werden gehasht und dann in einem Request geprüft. Blockweise,
 * damit die ersten Uploads schon laufen, während der Rest noch geprüft wird.
 */
const DUPLICATE_BATCH_SIZE = 25;

type ProcessingMeta = {
  imageId: string;
  startedAt: number;
  orphaned: number;
};

/**
 * Erzeugt ein kleines Thumbnail statt einer Blob-URL auf die Originaldatei.
 * Ein 4000x3000-Foto belegt dekodiert ~48 MB RAM – das Thumbnail ein paar KB.
 * Gibt null zurück, wenn der Browser das Format nicht dekodieren kann (z.B. HEIC).
 */
async function createThumbnail(file: File): Promise<string | null> {
  try {
    if (typeof createImageBitmap !== "function") return null;

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(THUMBNAIL_SIZE / bitmap.width, THUMBNAIL_SIZE / bitmap.height, 1);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    // Bitmap sofort freigeben – sonst bleibt das volle Bild im Speicher
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.7),
    );
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [rejectedFiles, setRejectedFiles] = useState<RejectedFile[]>([]);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDialogFiles, setUploadDialogFiles] = useState<File[]>([]);

  const openUploadDialog = useCallback((files?: File[]) => {
    setUploadDialogFiles(files ?? []);
    setUploadDialogOpen(true);
  }, []);

  const closeUploadDialog = useCallback(() => {
    setUploadDialogOpen(false);
    setUploadDialogFiles([]);
  }, []);

  const dismissRejected = useCallback(() => setRejectedFiles([]), []);

  const retryTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** Metadaten der Items, die gerade serverseitig verarbeitet werden */
  const processingMetaRef = useRef<Map<string, ProcessingMeta>>(new Map());
  /** Gesammelter Upload-Fortschritt, wird gedrosselt in den State geschrieben */
  const progressRef = useRef<Map<string, number>>(new Map());
  /** Spiegel des aktuellen Queue-States für Nutzung außerhalb des Renderings */
  const queueRef = useRef<QueueItem[]>([]);
  /** Bereits in dieser Session gesehene Content-Hashes → erkennt Doppelte in der Auswahl */
  const knownHashesRef = useRef<Map<string, { itemId: string; filename: string }>>(new Map());
  /** Items, für die bereits ein Upload gestartet wurde (verhindert Doppelstarts) */
  const startedRef = useRef<Set<string>>(new Set());
  const activeCountRef = useRef(0);

  useEffect(() => {
    queueRef.current = queue;
  });

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const patchItems = useCallback((patches: Map<string, Partial<QueueItem>>) => {
    if (patches.size === 0) return;
    setQueue(prev => prev.map(item => {
      const patch = patches.get(item.id);
      return patch ? { ...item, ...patch } : item;
    }));
  }, []);

  // --- Galerie-Refresh bündeln ------------------------------------------
  // Früher feuerte jedes fertige Bild ein eigenes router.refresh() – bei 300
  // Uploads also 300 komplette Server-Roundtrips.
  const galleryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGalleryRefreshRef = useRef(0);

  const notifyGallery = useCallback(() => {
    if (galleryTimeoutRef.current) return; // schon eingeplant
    const elapsed = Date.now() - lastGalleryRefreshRef.current;
    const delay = Math.max(0, GALLERY_REFRESH_MS - elapsed);
    galleryTimeoutRef.current = setTimeout(() => {
      galleryTimeoutRef.current = null;
      lastGalleryRefreshRef.current = Date.now();
      window.dispatchEvent(new CustomEvent("gallery-upload-complete"));
    }, delay);
  }, []);

  // --- Upload-Fortschritt gedrosselt in den State schreiben ---------------
  const hasUploading = queue.some(i => i.status === "uploading");

  useEffect(() => {
    if (!hasUploading) return;
    const timer = setInterval(() => {
      if (progressRef.current.size === 0) return;
      const patch = new Map(progressRef.current);
      progressRef.current.clear();
      setQueue(prev => prev.map(item => {
        const value = patch.get(item.id);
        return value !== undefined && value !== item.uploadProgress
          ? { ...item, uploadProgress: value }
          : item;
      }));
    }, PROGRESS_FLUSH_MS);
    return () => clearInterval(timer);
  }, [hasUploading]);

  // --- Ein globaler Poller für alle Items in Verarbeitung -----------------
  // Vorher: ein setInterval pro Bild, also bei 300 Bildern ~150 Requests/s.
  const hasProcessing = queue.some(i => i.status === "processing");

  useEffect(() => {
    if (!hasProcessing) return;
    let cancelled = false;

    const tick = async () => {
      // Gezielt nach den eigenen Bildern fragen – die Antwort ist dadurch
      // eindeutig ('completed' inklusive) statt aus Abwesenheit erschlossen.
      const waiting = queueRef.current.filter(i => i.status === "processing" && i.imageId);
      if (waiting.length === 0) return;

      let data: ServerStatus | null = null;
      try {
        const res = await fetch("/api/images/processing-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: waiting.map(i => i.imageId) }),
        });
        if (res.ok) data = await res.json();
      } catch {
        // Netzwerkfehler: alten Stand behalten, nichts als fertig melden
      }
      if (cancelled || !data) return;

      setServerStatus(data);
      const serverById = new Map(data.images.map(img => [img.id, img]));
      const unknown = new Set(data.unknown ?? []);
      // Server-Queue komplett leer, obwohl noch Bilder offen sind → verwaist
      const serverIdle = data.queue.queueLength === 0 && data.queue.processing === 0;

      // Entscheidungen außerhalb des State-Updaters treffen, damit der rein bleibt
      const patches = new Map<string, Partial<QueueItem>>();
      let anyCompleted = false;

      for (const item of waiting) {
        const meta = processingMetaRef.current.get(item.id);
        if (!meta) continue;

        const serverImage = serverById.get(meta.imageId);

        // Bild existiert nicht mehr (gelöscht) – nicht weiter darauf warten
        if (!serverImage) {
          if (unknown.has(meta.imageId)) {
            processingMetaRef.current.delete(item.id);
            patches.set(item.id, { status: "done", processingProgress: 100 });
            anyCompleted = true;
          }
          continue;
        }

        if (serverImage.variant_status === "failed") {
          processingMetaRef.current.delete(item.id);
          patches.set(item.id, { status: "error", error: "Verarbeitung fehlgeschlagen" });
          continue;
        }

        if (serverImage.variant_status === "completed") {
          processingMetaRef.current.delete(item.id);
          patches.set(item.id, { status: "done", processingProgress: 100 });
          anyCompleted = true;
          continue;
        }

        if (serverImage.variant_status === "processing") {
          meta.orphaned = 0;
          // Echter Fortschritt: abgeschlossene Teilschritte dieses Bildes
          const { completedSteps, totalSteps, phase } = serverImage;
          const percent = completedSteps !== null && totalSteps
            ? Math.round((completedSteps / totalSteps) * 100)
            : 0;
          patches.set(item.id, {
            processingProgress: percent,
            phase: phase ?? undefined,
            queuePosition: undefined,
            queueLength: undefined,
          });
          continue;
        }

        // 'pending' – wartet noch auf einen freien Slot
        meta.orphaned = serverIdle ? meta.orphaned + 1 : 0;
        if (meta.orphaned >= ORPHAN_THRESHOLD) {
          processingMetaRef.current.delete(item.id);
          patches.set(item.id, {
            status: "error",
            error: "Verarbeitung wurde unterbrochen – bitte erneut versuchen",
          });
        } else {
          patches.set(item.id, {
            processingProgress: 0,
            phase: undefined,
            queuePosition: serverImage.queuePosition ?? undefined,
            queueLength: serverImage.queueLength,
          });
        }
      }

      patchItems(patches);
      if (anyCompleted) notifyGallery();
    };

    void tick();
    const timer = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hasProcessing, notifyGallery, patchItems]);

  const uploadItem = useCallback(async (item: QueueItem) => {
    updateItem(item.id, { status: "uploading", uploadProgress: 0 });

    try {
      // Aus der Dateiendung abgeleitet, falls der Browser keinen Typ liefert
      const mime = resolveMimeType(item.file);
      if (!mime) throw new Error("Nicht unterstütztes Dateiformat");

      // Step 1: get presigned URL
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: item.file.name, mime, size: item.file.size }),
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
            // Nur in den Ref schreiben – der Flush-Timer übernimmt den State
            progressRef.current.set(item.id, Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.addEventListener("load", () => {
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`MinIO Upload fehlgeschlagen (${xhr.status})`));
        });
        xhr.addEventListener("error", () => reject(new Error("Netzwerkfehler beim Upload")));
        xhr.open("POST", url);
        xhr.send(formData);
      });

      progressRef.current.delete(item.id);
      updateItem(item.id, { uploadProgress: 100 });

      // Step 3: register in DB
      const metaRes = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: item.file.name,
          key: objectKey,
          mime,
          size: item.file.size,
          tags: [],
          contentHash: item.contentHash,
        }),
      });
      if (!metaRes.ok) throw new Error("Metadaten konnten nicht gespeichert werden");
      const { image } = await metaRes.json();
      const imageId: string = image.id;

      processingMetaRef.current.set(item.id, {
        imageId,
        startedAt: Date.now(),
        orphaned: 0,
      });
      updateItem(item.id, { status: "processing", processingProgress: 0, imageId });
    } catch (err) {
      progressRef.current.delete(item.id);
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      const attempt = (item.attempt ?? 0) + 1;
      if (attempt < MAX_ATTEMPTS) {
        // Auto-retry: Item geht zurück auf "pending", der Scheduler holt es wieder
        const retryAt = Date.now() + RETRY_DELAY_MS;
        updateItem(item.id, { status: "retrying", attempt, error: msg, retryAt, uploadProgress: 0 });
        const timeout = setTimeout(() => {
          retryTimeoutsRef.current.delete(item.id);
          updateItem(item.id, { status: "pending", error: undefined, retryAt: undefined });
        }, RETRY_DELAY_MS);
        retryTimeoutsRef.current.set(item.id, timeout);
      } else {
        updateItem(item.id, { status: "error", attempt, error: msg });
      }
    }
  }, [updateItem]);

  // --- Scheduler ---------------------------------------------------------
  // Effekt-getrieben statt als Seiteneffekt in einem State-Updater: startedRef
  // verhindert Doppelstarts, dadurch ist auch StrictMode-Doppelaufruf harmlos.
  const [schedulerTick, setSchedulerTick] = useState(0);

  useEffect(() => {
    if (activeCountRef.current >= MAX_CONCURRENT) return;

    for (const item of queue) {
      if (activeCountRef.current >= MAX_CONCURRENT) break;
      if (item.status !== "pending" || startedRef.current.has(item.id)) continue;

      startedRef.current.add(item.id);
      activeCountRef.current++;
      void uploadItem(item).finally(() => {
        activeCountRef.current--;
        startedRef.current.delete(item.id);
        // Freien Slot melden, ohne auf ein zufälliges Re-Render zu hoffen
        setSchedulerTick(tick => tick + 1);
      });
    }
  }, [queue, schedulerTick, uploadItem]);

  // --- Duplikatprüfung ---------------------------------------------------
  /**
   * Hasht die Dateien blockweise und fragt pro Block einmal den Server.
   * Items bleiben so lange auf "checking" und werden dann entweder
   * freigegeben ("pending") oder als Duplikat markiert.
   */
  const checkDuplicates = useCallback(async (items: QueueItem[]) => {
    for (let offset = 0; offset < items.length; offset += DUPLICATE_BATCH_SIZE) {
      const batch = items.slice(offset, offset + DUPLICATE_BATCH_SIZE);

      // Nacheinander hashen, damit nicht mehrere große Dateien gleichzeitig
      // komplett im Speicher liegen
      const hashed: { item: QueueItem; hash: string | null }[] = [];
      for (const item of batch) {
        hashed.push({ item, hash: await hashFile(item.file) });
      }

      const hashes = Array.from(
        new Set(hashed.map(entry => entry.hash).filter((h): h is string => h !== null)),
      );

      const galleryHits = new Map<string, { filename: string; imageId: string }>();
      if (hashes.length > 0) {
        try {
          const res = await fetch("/api/images/check-duplicates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashes }),
          });
          if (res.ok) {
            const data = await res.json();
            for (const dup of data.duplicates ?? []) {
              galleryHits.set(dup.hash, { filename: dup.filename, imageId: dup.imageId });
            }
          }
        } catch {
          // Prüfung ist optional – im Zweifel lieber hochladen als blockieren
        }
      }

      const patches = new Map<string, Partial<QueueItem>>();
      for (const { item, hash } of hashed) {
        if (!hash) {
          patches.set(item.id, { status: "pending" });
          continue;
        }

        const galleryHit = galleryHits.get(hash);
        const seen = knownHashesRef.current.get(hash);

        if (galleryHit) {
          patches.set(item.id, {
            status: "duplicate",
            contentHash: hash,
            duplicateOf: { filename: galleryHit.filename, imageId: galleryHit.imageId, scope: "gallery" },
          });
        } else if (seen && seen.itemId !== item.id) {
          patches.set(item.id, {
            status: "duplicate",
            contentHash: hash,
            duplicateOf: { filename: seen.filename, scope: "selection" },
          });
        } else {
          knownHashesRef.current.set(hash, { itemId: item.id, filename: item.file.name });
          patches.set(item.id, { status: "pending", contentHash: hash });
        }
      }

      patchItems(patches);
    }
  }, [patchItems]);

  const retryItem = useCallback((id: string) => {
    const timeout = retryTimeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      retryTimeoutsRef.current.delete(id);
    }
    updateItem(id, { status: "pending", attempt: 0, error: undefined, uploadProgress: 0, processingProgress: 0, retryAt: undefined });
  }, [updateItem]);

  const uploadAnyway = useCallback((id: string) => {
    updateItem(id, { status: "pending", duplicateOf: undefined });
  }, [updateItem]);

  const addFiles = useCallback((files: File[]) => {
    const accepted: File[] = [];
    const rejected: RejectedFile[] = [];

    for (const file of files) {
      if (isAcceptedFile(file)) {
        accepted.push(file);
      } else {
        rejected.push({ name: file.name, reason: "Format wird nicht unterstützt" });
      }
    }

    if (rejected.length > 0) setRejectedFiles(prev => [...prev, ...rejected]);
    if (accepted.length === 0) return;

    // Ohne crypto.subtle (unsicherer Kontext) ist keine Duplikatprüfung möglich
    const withDuplicateCheck = canHashFiles();

    const newItems: QueueItem[] = accepted.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: "",
      status: withDuplicateCheck ? "checking" : "pending",
      uploadProgress: 0,
      processingProgress: 0,
    }));

    setQueue(prev => [...prev, ...newItems]);

    if (withDuplicateCheck) void checkDuplicates(newItems);

    // Thumbnails nur für die ersten Items und nacheinander erzeugen, damit
    // das Dekodieren nicht den Main Thread blockiert.
    const freeSlots = MAX_PREVIEWS - queueRef.current.length;
    const withPreview = newItems.slice(0, Math.max(0, freeSlots));
    if (withPreview.length === 0) return;

    void (async () => {
      for (const item of withPreview) {
        const preview = await createThumbnail(item.file);
        if (!preview) continue;
        // Item könnte inzwischen entfernt worden sein
        if (!queueRef.current.some(i => i.id === item.id)) {
          URL.revokeObjectURL(preview);
          continue;
        }
        setQueue(prev => prev.map(i => i.id === item.id ? { ...i, preview } : i));
      }
    })();
  }, [checkDuplicates]);

  const forgetItem = useCallback((item: QueueItem) => {
    processingMetaRef.current.delete(item.id);
    progressRef.current.delete(item.id);
    if (item.contentHash) {
      const seen = knownHashesRef.current.get(item.contentHash);
      if (seen?.itemId === item.id) knownHashesRef.current.delete(item.contentHash);
    }
    if (item.preview) URL.revokeObjectURL(item.preview);
  }, []);

  const removeItem = useCallback((id: string) => {
    const timeout = retryTimeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      retryTimeoutsRef.current.delete(id);
    }
    const item = queueRef.current.find(i => i.id === id);
    if (item) forgetItem(item);
    setQueue(prev => prev.filter(i => i.id !== id));
  }, [forgetItem]);

  const clearDone = useCallback(() => {
    const isFinished = (item: QueueItem) =>
      item.status === "done" || item.status === "error" || item.status === "duplicate";
    queueRef.current.filter(isFinished).forEach(forgetItem);
    setQueue(prev => prev.filter(item => !isFinished(item)));
    setRejectedFiles([]);
  }, [forgetItem]);

  // Aufräumen beim Unmount
  useEffect(() => {
    const retryTimeouts = retryTimeoutsRef.current;
    return () => {
      retryTimeouts.forEach(clearTimeout);
      retryTimeouts.clear();
      if (galleryTimeoutRef.current) clearTimeout(galleryTimeoutRef.current);
      queueRef.current.forEach(item => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
    };
  }, []);

  return (
    <UploadQueueContext.Provider value={{ queue, serverStatus, rejectedFiles, dismissRejected, addFiles, removeItem, retryItem, uploadAnyway, clearDone, queueExpanded, setQueueExpanded, uploadDialogOpen, uploadDialogFiles, openUploadDialog, closeUploadDialog }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error("useUploadQueue must be used within UploadQueueProvider");
  return ctx;
}
