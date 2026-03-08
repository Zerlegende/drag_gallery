"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FORMATS = [
  { value: "original", label: "Original", description: "Originalformat beibehalten" },
  { value: "jpg", label: "JPG", description: "Komprimiert, klein" },
  { value: "png", label: "PNG", description: "Verlustfrei, transparent" },
  { value: "webp", label: "WebP", description: "Modern, sehr klein" },
  { value: "avif", label: "AVIF", description: "Neuestes Format, kleinste Größe" },
] as const;

type DownloadFormat = (typeof FORMATS)[number]["value"];

type DownloadFormatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Single or multiple image IDs */
  imageIds: string[];
  /** Display names matching imageIds (used for fallback filename) */
  imageNames: string[];
};

async function downloadSingleImage(imageId: string, imageName: string, format: DownloadFormat) {
  const response = await fetch(`/api/images/${imageId}/download?format=${format}`);
  if (!response.ok) throw new Error("Download fehlgeschlagen");

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;

  const disposition = response.headers.get("Content-Disposition");
  let filename = imageName;
  if (disposition) {
    const match = disposition.match(/filename="?(.+?)"?$/);
    if (match) filename = decodeURIComponent(match[1]);
  }

  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function DownloadFormatDialog({
  open,
  onOpenChange,
  imageIds,
  imageNames,
}: DownloadFormatDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<DownloadFormat>("original");
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const isBatch = imageIds.length > 1;

  const handleDownload = async () => {
    setIsDownloading(true);
    setProgress(0);
    try {
      for (let i = 0; i < imageIds.length; i++) {
        await downloadSingleImage(imageIds[i], imageNames[i], selectedFormat);
        setProgress(i + 1);
        // Small delay between files to avoid overwhelming the browser
        if (i < imageIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error downloading image:", error);
    } finally {
      setIsDownloading(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Herunterladen
          </DialogTitle>
          <DialogDescription>
            {isBatch
              ? `${imageIds.length} Bilder herunterladen — wähle das gewünschte Format`
              : "Wähle das gewünschte Bildformat"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {FORMATS.map((format) => (
            <button
              key={format.value}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setSelectedFormat(format.value);
              }}
              className={cn(
                "flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all",
                "hover:bg-accent hover:border-primary/50",
                selectedFormat === format.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border"
              )}
            >
              <div>
                <div className="font-medium text-sm">{format.label}</div>
                <div className="text-xs text-muted-foreground">{format.description}</div>
              </div>
              <div
                className={cn(
                  "h-4 w-4 rounded-full border-2 transition-all",
                  selectedFormat === format.value
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/30"
                )}
              >
                {selectedFormat === format.value && (
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {isBatch && isDownloading && (
          <div className="text-xs text-muted-foreground text-center">
            {progress} / {imageIds.length} heruntergeladen
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:gap-0">
          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(false);
            }}
            disabled={isDownloading}
            className="w-full sm:w-auto"
          >
            Abbrechen
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            disabled={isDownloading}
            className="w-full sm:w-auto"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isBatch ? `${progress}/${imageIds.length} ...` : "Wird konvertiert..."}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                {isBatch ? `${imageIds.length} Bilder herunterladen` : "Herunterladen"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
