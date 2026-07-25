"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronDown, ChevronUp, Upload, CheckCircle2, AlertCircle, Loader2, ImageIcon, Maximize2, Minimize2, RotateCw, Copy } from "lucide-react";
import { useUploadQueue, type QueueItem, type ServerImage } from "@/contexts/upload-queue-context";
import { dragHasImageFiles, isAcceptedFile } from "@/lib/upload-files";
import { cn } from "@/lib/utils";

/** Endzustände – diese Items warten auf nichts mehr */
function isFinished(item: QueueItem) {
  return item.status === "done" || item.status === "error" || item.status === "duplicate";
}

const PHASE_LABELS: Record<NonNullable<QueueItem["phase"]>, string> = {
  downloading: "Wird geladen",
  converting: "Wird konvertiert",
  variants: "Größen werden erzeugt",
};

/**
 * Sagt, was gerade wirklich passiert. Solange das Bild nur in der
 * Server-Warteschlange steht, wird die Position genannt statt ein Prozentwert.
 */
function processingLabel(item: QueueItem): string {
  if (item.phase) return PHASE_LABELS[item.phase];
  if (item.queuePosition && item.queueLength) {
    return `Warteposition ${item.queuePosition} von ${item.queueLength}`;
  }
  return "Warte auf Verarbeitung";
}

/**
 * Maximale Anzahl gleichzeitig gerenderter Zeilen. Bei mehreren hundert Uploads
 * würde sonst jedes Progress-Update die komplette Liste neu rendern.
 */
const VISIBLE_ROWS = 40;
const VISIBLE_ROWS_EXPANDED = 80;

function itemProgress(item: QueueItem): number {
  if (isFinished(item)) return 100;
  if (item.status === "checking" || item.status === "pending") return 0;
  if (item.status === "uploading") return item.uploadProgress * 0.5;
  if (item.status === "processing") return 50 + item.processingProgress * 0.5;
  return 0;
}

export function UploadQueueWidget() {
  const { queue, serverStatus, rejectedFiles, dismissRejected, addFiles, removeItem, retryItem, uploadAnyway, clearDone, queueExpanded: expanded, setQueueExpanded: setExpanded } = useUploadQueue();
  const [minimized, setMinimized] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const dropCounter = useRef(0);

  // Drag & drop handlers — must be before any early return
  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!dragHasImageFiles(e.dataTransfer.items)) return;
    e.preventDefault();
    dropCounter.current++;
    setDropActive(true);
  }, []);
  const onDragLeave = useCallback(() => {
    dropCounter.current--;
    if (dropCounter.current === 0) setDropActive(false);
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dropCounter.current = 0;
    setDropActive(false);
    const files = Array.from(e.dataTransfer.files).filter(isAcceptedFile);
    if (files.length > 0) addFiles(files);
  }, [addFiles]);

  // Match server processing state to each queue item by imageId
  const serverById = useMemo(
    () => new Map(serverStatus?.images.map(img => [img.id, img]) ?? []),
    [serverStatus],
  );

  // Ein gemeinsamer Ticker für alle Retry-Countdowns statt einem pro Zeile
  const hasRetrying = queue.some(i => i.status === "retrying");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasRetrying) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [hasRetrying]);

  if (queue.length === 0 && rejectedFiles.length === 0) return null;

  const checking = queue.filter(i => i.status === "checking").length;
  const uploading = queue.filter(i => i.status === "uploading").length;
  const processing = queue.filter(i => i.status === "processing").length;
  const retrying = queue.filter(i => i.status === "retrying").length;
  const duplicates = queue.filter(i => i.status === "duplicate").length;
  const done = queue.filter(i => i.status === "done").length;
  const total = queue.length;
  const allDone = total > 0 && queue.every(isFinished);
  const overallProgress = total === 0
    ? 100
    : Math.round(queue.reduce((sum, i) => sum + itemProgress(i), 0) / total);

  const statusText = total === 0
    ? "Keine Bilder übernommen"
    : allDone
    ? `${done} von ${total} fertig${duplicates > 0 ? ` · ${duplicates} übersprungen` : ""}`
    : checking > 0
    ? `${checking} wird auf Duplikate geprüft…`
    : uploading > 0
    ? `${uploading} wird hochgeladen…`
    : processing > 0
    ? `${processing} wird verarbeitet…`
    : retrying > 0
    ? `${retrying} wird wiederholt…`
    : `${total} in der Warteschlange`;

  const header = (
    <div className="px-4 pt-3 pb-2 bg-muted/50 border-b border-border shrink-0 space-y-2">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium flex-1 truncate">{statusText}</span>
        <div className="flex items-center gap-1">
          {(allDone || total === 0) && (
            <button
              onClick={clearDone}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-accent transition-colors"
            >
              Leeren
            </button>
          )}
          <button
            onClick={() => { setExpanded(!expanded); setMinimized(false); }}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title={expanded ? "Verkleinern" : "Vergrößern"}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          {!expanded && (
            <button
              onClick={() => setMinimized(v => !v)}
              className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            >
              {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
      {rejectedFiles.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">
              {rejectedFiles.length} {rejectedFiles.length === 1 ? "Datei" : "Dateien"} übersprungen
            </p>
            <p className="truncate opacity-80">
              {rejectedFiles.slice(0, 3).map(f => f.name).join(", ")}
              {rejectedFiles.length > 3 && ` +${rejectedFiles.length - 3}`}
            </p>
          </div>
          <button onClick={dismissRejected} className="shrink-0 p-0.5 rounded hover:bg-amber-500/20">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {/* Overall progress bar — only in expanded or mini view (not minimized) */}
      {!minimized && total > 0 && (
        <div className="space-y-1 pb-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Gesamt</span>
            <span>{overallProgress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );

  // Nur einen Ausschnitt rendern: erst die noch laufenden Items, dann mit dem
  // Rest des Platzes die bereits erledigten.
  const limit = expanded ? VISIBLE_ROWS_EXPANDED : VISIBLE_ROWS;
  const active = queue.filter(i => !isFinished(i));
  const finished = queue.filter(isFinished);
  const visible = [
    ...active.slice(0, limit),
    ...finished.slice(0, Math.max(0, limit - active.length)),
  ];
  const hidden = queue.length - visible.length;

  const list = (
    <div className={cn("overflow-y-auto divide-y divide-border", expanded ? "flex-1" : "max-h-80")}>
      {visible.map(item => (
        <QueueItemRow
          key={item.id}
          item={item}
          serverImage={item.imageId ? serverById.get(item.imageId) : undefined}
          onRemove={removeItem}
          onRetry={retryItem}
          onUploadAnyway={uploadAnyway}
          expanded={expanded}
          now={item.status === "retrying" ? now : 0}
        />
      ))}
      {hidden > 0 && (
        <div className="px-4 py-3 text-xs text-center text-muted-foreground">
          … und {hidden} weitere
        </div>
      )}
    </div>
  );

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div
          data-upload-queue-modal
          className={cn(
            "w-full max-w-2xl max-h-[80vh] rounded-xl border bg-background shadow-2xl flex flex-col mx-4 transition-colors",
            dropActive ? "border-primary border-2 bg-primary/5" : "border-border"
          )}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {header}
          {list}
          <div className={cn(
            "px-4 py-2 text-xs text-center border-t border-border transition-colors shrink-0",
            dropActive ? "text-primary font-medium" : "text-muted-foreground"
          )}>
            {dropActive ? "Loslassen zum Hinzufügen" : "Bilder hier reinziehen um sie zur Queue hinzuzufügen"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden">
      {header}
      {!minimized && list}
    </div>
  );
}

const QueueItemRow = memo(function QueueItemRow({ item, serverImage, onRemove, onRetry, onUploadAnyway, expanded, now }: {
  item: QueueItem;
  serverImage?: ServerImage;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onUploadAnyway: (id: string) => void;
  expanded?: boolean;
  /** Zeitstempel des gemeinsamen Tickers; nur für Items im Retry-Countdown gesetzt */
  now: number;
}) {
  const serverActive = serverImage?.variant_status === "pending" || serverImage?.variant_status === "processing";
  const serverFailed = serverImage?.variant_status === "failed";

  // Effective status: if server still active, override "done"
  const isDone     = item.status === "done" && !serverActive && !serverFailed;
  const isFailed   = item.status === "error" || serverFailed;
  const isRetrying = item.status === "retrying";
  const showUpload   = item.status === "uploading";
  const showProcess  = item.status === "processing" || (item.status === "done" && serverActive);
  const isPending    = item.status === "pending";
  const isChecking   = item.status === "checking";
  const isDuplicate  = item.status === "duplicate";

  const secondsLeft = item.retryAt && now ? Math.max(0, Math.ceil((item.retryAt - now) / 1000)) : 0;
  const nextAttempt = (item.attempt ?? 0) + 1;

  return (
    <div className={cn("flex items-start gap-3 px-4 py-3", expanded && "py-4")}>
      <div className={cn("relative shrink-0 rounded-md overflow-hidden bg-muted", expanded ? "h-14 w-14" : "h-10 w-10")}>
        {item.preview
          ? <img src={item.preview} alt={item.file.name} className="h-full w-full object-cover" />
          : <div className="h-full w-full flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate text-foreground">{item.file.name}</p>

        {isPending && <p className="text-xs text-muted-foreground mt-0.5">Warteschlange…</p>}

        {isChecking && <p className="text-xs text-muted-foreground mt-0.5">Prüfe auf Duplikate…</p>}

        {isDuplicate && (
          <div className="mt-0.5 space-y-1.5">
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {item.duplicateOf?.scope === "selection"
                ? <>Doppelt in dieser Auswahl (wie <span className="font-medium">{item.duplicateOf.filename}</span>)</>
                : <>Bereits vorhanden als <span className="font-medium">{item.duplicateOf?.filename}</span></>}
            </p>
            <button
              onClick={() => onUploadAnyway(item.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Upload className="h-3.5 w-3.5" /> Trotzdem hochladen
            </button>
          </div>
        )}

        {showUpload && (
          <div className="mt-1.5 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Hochladen</span><span>{item.uploadProgress}%</span>
            </div>
            <ProgressBar value={item.uploadProgress} color="blue" />
          </div>
        )}

        {showProcess && (
          <div className="mt-1.5 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="truncate">{processingLabel(item)}</span>
              {/* Prozent nur zeigen, wenn wirklich gearbeitet wird – beim
                  Warten in der Schlange wäre jede Zahl gelogen. */}
              {item.phase && <span className="shrink-0 ml-2">{item.processingProgress}%</span>}
            </div>
            <ProgressBar value={item.processingProgress} color="violet" animated={!!item.phase} />
          </div>
        )}

        {isRetrying && (
          <p className="text-xs text-amber-600 mt-0.5">
            Fehlgeschlagen – neuer Versuch in {secondsLeft}s (Versuch {nextAttempt}/3)
          </p>
        )}

        {isDone && (
          <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Fertig
          </p>
        )}

        {isFailed && (
          <div className="mt-0.5 space-y-1.5">
            <p className="text-xs text-destructive">{item.error ?? "Fehler"}</p>
            <button
              onClick={() => onRetry(item.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center pt-0.5">
        {isPending   && <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
        {isChecking  && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
        {showUpload  && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
        {showProcess && <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />}
        {isRetrying  && <RotateCw className="h-4 w-4 text-amber-500 animate-spin" />}
        {isDone      && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {isFailed    && <AlertCircle className="h-4 w-4 text-destructive" />}
        {isDuplicate && <Copy className="h-4 w-4 text-amber-500" />}
        {(isDone || isFailed || isRetrying || isDuplicate) && (
          <button onClick={() => onRemove(item.id)} className="ml-1 p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
});

function ProgressBar({ value, color, animated }: { value: number; color: "blue" | "violet"; animated?: boolean }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300",
          color === "blue" && "bg-blue-500",
          color === "violet" && "bg-violet-500",
          animated && "bg-gradient-to-r from-violet-500 to-purple-400"
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
