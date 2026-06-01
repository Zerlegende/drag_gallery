"use client";

import { useCallback, useState, useEffect } from "react";
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

type FileWithPreview = {
  file: File;
  preview: string;
  id: string;
};

export function UploadDropzone({ onClose, initialFiles }: UploadDropzoneProps) {
  const { addFiles } = useUploadQueue();
  const [queued, setQueued] = useState<FileWithPreview[]>([]);

  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      setQueued(initialFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        id: `${file.name}-${file.size}-${Math.random()}`,
      })));
    }
  }, []);

  useEffect(() => {
    return () => queued.forEach(i => URL.revokeObjectURL(i.preview));
  }, [queued]);

  const onDrop = useCallback((accepted: File[]) => {
    const newItems = accepted.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      id: `${file.name}-${file.size}-${Math.random()}`,
    }));
    setQueued(prev => [...prev, ...newItems]);
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

  const removeFile = (id: string) => {
    setQueued(prev => {
      const item = prev.find(i => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter(i => i.id !== id);
    });
  };

  const handleUpload = () => {
    if (queued.length === 0) return;
    addFiles(queued.map(i => i.file));
    onClose();
  };

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-card/60 p-6">
      <div
        {...getRootProps({
          className: `cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/30 bg-background/80 p-6 transition hover:border-primary ${isDragActive ? "border-primary bg-primary/10" : ""}`,
        })}
      >
        <input {...getInputProps()} />

        {queued.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-medium">
              {isDragActive ? "Loslassen zum Hinzufügen" : "Dateien hier ablegen oder klicken"}
            </p>
            <p className="text-sm text-muted-foreground">JPEG, PNG, HEIC, WebP, AVIF · max. 50 MB</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              {isDragActive ? "Weitere Bilder hinzufügen" : "Klicken oder ziehen für weitere Bilder"} · {queued.length} {queued.length === 1 ? "Bild" : "Bilder"}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {queued.map((item) => (
                <div
                  key={item.id}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                  onClick={e => e.stopPropagation()}
                >
                  <Image src={item.preview} alt={item.file.name} fill className="object-cover pointer-events-none" unoptimized />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                    <p className="text-white text-xs font-medium text-center truncate w-full mb-1">{item.file.name}</p>
                    <p className="text-white/80 text-xs mb-2">{formatFileSize(item.file.size)}</p>
                    <Button variant="destructive" size="sm" onClick={() => removeFile(item.id)} className="h-8 w-8 p-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="lg" disabled={queued.length === 0} onClick={handleUpload}>
          {queued.length === 0 ? "Hochladen" : `${queued.length} Bild${queued.length === 1 ? "" : "er"} hochladen`}
        </Button>
      </div>
    </div>
  );
}
