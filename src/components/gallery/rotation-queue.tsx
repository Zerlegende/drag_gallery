"use client";

import { useEffect, useState } from "react";
import { X, RotateCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageWithTags } from "@/lib/db";

export type QueueItem = {
  id: string;
  image: ImageWithTags;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
};

type RotationQueueProps = {
  items: QueueItem[];
  onClose: () => void;
  onUpdateItem: (id: string, status: QueueItem["status"], error?: string) => void;
};

export function RotationQueue({ items, onClose, onUpdateItem }: RotationQueueProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  const pendingCount = items.filter(item => item.status === "pending").length;
  const processingCount = items.filter(item => item.status === "processing").length;
  const successCount = items.filter(item => item.status === "success").length;
  const errorCount = items.filter(item => item.status === "error").length;
  const totalCount = items.length;
  const isComplete = pendingCount === 0 && processingCount === 0;

  useEffect(() => {
    // Auto-close nach 5 Sekunden wenn alles fertig ist
    if (isComplete && totalCount > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, totalCount, onClose]);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <RotateCw className={`h-4 w-4 ${processingCount > 0 ? 'animate-spin' : ''}`} />
          <span className="font-semibold text-sm">
            Bilder drehen {!isComplete && `(${successCount + errorCount}/${totalCount})`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? "▲" : "▼"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      {!isMinimized && (
        <div className="px-3 py-2 bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Fortschritt</span>
            <span>{Math.round(((successCount + errorCount) / totalCount) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((successCount + errorCount) / totalCount) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className="text-green-600 dark:text-green-400">✓ {successCount}</span>
            {errorCount > 0 && (
              <span className="text-red-600 dark:text-red-400">✗ {errorCount}</span>
            )}
            {processingCount > 0 && (
              <span className="text-blue-600 dark:text-blue-400">⟳ {processingCount}</span>
            )}
          </div>
        </div>
      )}

      {/* Queue Items */}
      {!isMinimized && (
        <div className="h-64 overflow-y-auto">
          <div className="p-2 space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 p-2 rounded text-sm ${
                  item.status === "success"
                    ? "bg-green-50 dark:bg-green-950/20"
                    : item.status === "error"
                    ? "bg-red-50 dark:bg-red-950/20"
                    : item.status === "processing"
                    ? "bg-blue-50 dark:bg-blue-950/20"
                    : "bg-muted/30"
                }`}
              >
                <div className="flex-shrink-0">
                  {item.status === "pending" && (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                  )}
                  {item.status === "processing" && (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                  )}
                  {item.status === "success" && (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  )}
                  {item.status === "error" && (
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium">
                    {item.image.imagename || item.image.filename}
                  </p>
                  {item.status === "error" && item.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 truncate">
                      {item.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete Message */}
      {isComplete && !isMinimized && (
        <div className="p-3 bg-green-50 dark:bg-green-950/20 border-t border-border text-center">
          <p className="text-sm font-medium text-green-600 dark:text-green-400">
            {errorCount > 0
              ? `${successCount} von ${totalCount} Bildern gedreht`
              : `Alle ${totalCount} Bilder erfolgreich gedreht!`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Wird in 5 Sekunden geschlossen...
          </p>
        </div>
      )}
    </div>
  );
}
