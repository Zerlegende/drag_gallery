"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFileSize } from "@/lib/utils";

type UploadMetadata = {
  filename: string;
  size: number;
  mime: string;
};

export type UploadRequest = {
  file: File;
  tags: string[];
  metadata: UploadMetadata;
};

export type UploadDropzoneProps = {
  isUploading: boolean;
  onUpload: (payload: UploadRequest[]) => Promise<void>;
};

export function UploadDropzone({ isUploading, onUpload }: UploadDropzoneProps) {
  const [tagInput, setTagInput] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setQueuedFiles((prev) => [...prev, ...acceptedFiles]);
      setError(null);
    },
    [],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: {
      "image/*": [],
    },
  });

  const handleUpload = async () => {
    const tags = tagInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const payloads = queuedFiles.map((file) => ({
      file,
      tags,
      metadata: {
        filename: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
      },
    }));

    try {
      await onUpload(payloads);
      setQueuedFiles([]);
      setTagInput("");
      setError(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload fehlgeschlagen.");
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-card/60 p-6">
      <div
        {...getRootProps({
          className: `flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/80 p-6 text-center transition hover:border-primary ${isDragActive ? "border-primary bg-primary/10" : ""}`,
        })}
      >
        <input {...getInputProps()} />
        <p className="text-lg font-medium">
          {isDragActive ? "Loslassen zum Hochladen" : "Dateien hier ablegen oder klicken"}
        </p>
        <p className="text-sm text-muted-foreground">
          Unterstützt mehrere Bilder gleichzeitig. Maximalgröße wird durch Server-Konfiguration bestimmt.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="tag-input">
            Tags (mit Komma trennen)
          </label>
          <Input
            id="tag-input"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="z. B. event, portraits, favorites"
            disabled={isUploading}
          />
        </div>
        <Button size="lg" disabled={isUploading || queuedFiles.length === 0} onClick={handleUpload}>
          {isUploading ? "Lade hoch..." : `Jetzt hochladen (${queuedFiles.length})`}
        </Button>
      </div>
      {queuedFiles.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Warteschlange</p>
          <ul className="space-y-1">
            {queuedFiles.map((file) => (
              <li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3">
                <span className="truncate font-medium text-foreground">{file.name}</span>
                <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
