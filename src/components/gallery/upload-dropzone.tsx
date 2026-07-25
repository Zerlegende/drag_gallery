"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import Image from "next/image";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils";
import { useUploadQueue } from "@/contexts/upload-queue-context";

export type UploadDropzoneProps = {
  onClose: () => void;
  initialFiles?: File[];
};

/**
 * Für so viele Dateien wird eine Vorschau erzeugt. Jede Vorschau zwingt den
 * Browser, das Bild in voller Auflösung zu dekodieren (ein 4000x3000-Foto
 * belegt dekodiert ~48 MB) – bei ein paar hundert Bildern stirbt sonst der Tab.
 */
const MAX_PREVIEWS = 24;

export function UploadDropzone({ onClose, initialFiles }: UploadDropzoneProps) {
  const { addFiles } = useUploadQueue();
  const [files, setFiles] = useState<File[]>(() => initialFiles ?? []);
  // Nach File-Objekt statt nach Index geschlüsselt: beim Entfernen eines Bildes
  // verschieben sich sonst die Indizes und die Vorschau zeigt kurz das falsche Bild.
  const [previews, setPreviews] = useState<Map<File, string>>(() => new Map());
  const urlCacheRef = useRef<Map<File, string>>(new Map());

  // Vorschau-URLs nur für die ersten MAX_PREVIEWS Dateien, und nur die
  // Differenz anlegen/freigeben, damit bestehende Vorschauen nicht flackern.
  useEffect(() => {
    const visible = files.slice(0, MAX_PREVIEWS);
    const cache = urlCacheRef.current;

    for (const file of visible) {
      if (!cache.has(file)) cache.set(file, URL.createObjectURL(file));
    }
    for (const [file, url] of cache) {
      if (!visible.includes(file)) {
        URL.revokeObjectURL(url);
        cache.delete(file);
      }
    }

    setPreviews(new Map(cache));
  }, [files]);

  useEffect(() => {
    const cache = urlCacheRef.current;
    return () => {
      cache.forEach(url => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(prev => [...prev, ...accepted]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/heic": [".heic"],
      "image/heif": [".heif"],
      "image/webp": [".webp"],
      "image/avif": [".avif"],
    },
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (files.length === 0) return;
    addFiles(files);
    onClose();
  };

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const hiddenCount = Math.max(0, files.length - MAX_PREVIEWS);

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-card/60 p-6">
      <div
        {...getRootProps({
          className: `cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/30 bg-background/80 p-6 transition hover:border-primary ${isDragActive ? "border-primary bg-primary/10" : ""}`,
        })}
      >
        <input {...getInputProps()} />

        {files.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-medium">
              {isDragActive ? "Loslassen zum Hinzufügen" : "Dateien hier ablegen oder klicken"}
            </p>
            <p className="text-sm text-muted-foreground">JPEG, PNG, HEIC, WebP, AVIF · max. 50 MB</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              {isDragActive ? "Weitere Bilder hinzufügen" : "Klicken oder ziehen für weitere Bilder"} · {files.length} {files.length === 1 ? "Bild" : "Bilder"} · {formatFileSize(totalSize)}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {files.slice(0, MAX_PREVIEWS).map((file, index) => {
                const preview = previews.get(file);
                return (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                    onClick={e => e.stopPropagation()}
                  >
                    {preview && (
                      <Image src={preview} alt={file.name} fill className="object-cover pointer-events-none" unoptimized />
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                      <p className="text-white text-xs font-medium text-center truncate w-full mb-1">{file.name}</p>
                      <p className="text-white/80 text-xs mb-2">{formatFileSize(file.size)}</p>
                      <Button variant="destructive" size="sm" onClick={() => removeFile(index)} className="h-8 w-8 p-0">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {hiddenCount > 0 && (
                <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-muted text-center">
                  <span className="text-sm font-medium text-muted-foreground">
                    +{hiddenCount} weitere
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="lg" disabled={files.length === 0} onClick={handleUpload}>
          {files.length === 0 ? "Hochladen" : `${files.length} Bild${files.length === 1 ? "" : "er"} hochladen`}
        </Button>
      </div>
    </div>
  );
}
