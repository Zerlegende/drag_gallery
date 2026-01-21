"use client";

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFileSize } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/components/ui/toast";

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
  onUploadStart?: () => void;
  initialFiles?: File[];
};

type FileWithPreview = {
  file: File;
  preview: string;
  id: string;
};

export function UploadDropzone({ isUploading, onUpload, onUploadStart, initialFiles }: UploadDropzoneProps) {
  const [queuedFiles, setQueuedFiles] = useState<FileWithPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initialFilesProcessed, setInitialFilesProcessed] = useState(false);
  const { showToast } = useToast();

  // Initial files hinzufügen wenn vorhanden
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0 && !initialFilesProcessed) {
      const filesWithPreviews = initialFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      }));
      setQueuedFiles(filesWithPreviews);
      setInitialFilesProcessed(true);
    }
    
    // Reset wenn keine initialFiles mehr da sind
    if (!initialFiles || initialFiles.length === 0) {
      if (initialFilesProcessed) {
        setQueuedFiles([]);
        setInitialFilesProcessed(false);
      }
    }
  }, [initialFiles, initialFilesProcessed]);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      // Check for file limit violations
      if (rejectedFiles.length > 0) {
        const tooManyFiles = rejectedFiles.some(rejection => 
          rejection.errors.some((e: any) => e.code === 'too-many-files')
        );
        if (tooManyFiles) {
          setError('Maximal 50 Bilder auf einmal hochladen');
          showToast('Maximal 50 Bilder auf einmal hochladen', 'error');
          return;
        }
      }

      const totalFiles = queuedFiles.length + acceptedFiles.length;
      if (totalFiles > 50) {
        setError('Maximal 50 Bilder auf einmal hochladen');
        showToast('Maximal 50 Bilder auf einmal hochladen', 'error');
        return;
      }

      const filesWithPreviews = acceptedFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      }));
      setQueuedFiles((prev) => [...prev, ...filesWithPreviews]);
      setError(null);
    },
    [queuedFiles.length, showToast],
  );

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      queuedFiles.forEach((item) => URL.revokeObjectURL(item.preview));
    };
  }, [queuedFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxFiles: 50,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/heic": [".heic"],
      "image/heif": [".heif"],
      "image/webp": [".webp"],
      "image/avif": [".avif"],
    },
  });

  const handleUpload = async () => {
    setError(null);
    onUploadStart?.(); // Signalisiere Start des Uploads
    
    try {
      // 1. Prüfe auf Duplikate
      const duplicateCheck = await fetch("/api/images/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: queuedFiles.map((item) => ({
            filename: item.file.name,
            size: item.file.size,
          })),
        }),
      });

      if (!duplicateCheck.ok) {
        throw new Error("Duplikat-Prüfung fehlgeschlagen");
      }

      const { results } = await duplicateCheck.json();
      
      // Filtere Duplikate heraus
      const duplicates = results.filter((r: { exists: boolean }) => r.exists);
      const filesToUpload = queuedFiles.filter((item) => {
        const isDuplicate = results.find(
          (r: { filename: string; exists: boolean }) => 
            r.filename === item.file.name && r.exists
        );
        return !isDuplicate;
      });

      // Zeige Info über Duplikate
      if (duplicates.length > 0) {
        showToast(
          "warning",
          `${duplicates.length} Bild(er) bereits vorhanden und wurden übersprungen.`,
          5000
        );
      }

      // Wenn alle Duplikate sind
      if (filesToUpload.length === 0) {
        queuedFiles.forEach((item) => URL.revokeObjectURL(item.preview));
        setQueuedFiles([]);
        await onUpload([]);
        return;
      }

      // 2. Upload der neuen Bilder
      let successCount = 0;
      let failedCount = 0;
      const failedFiles: string[] = [];
      
      for (const item of filesToUpload) {
        try {
          console.log('Processing:', item.file.name);
          
          // 1. Convert to AVIF (if not already AVIF)
          let fileToUpload = item.file;
          let finalFilename = item.file.name;
          let finalMime = item.file.type;
          let finalSize = item.file.size;
          
          if (item.file.type !== 'image/avif') {
            console.log(`Converting ${item.file.name} to AVIF...`);
            const convertFormData = new FormData();
            convertFormData.append('file', item.file);
            
            const convertResponse = await fetch('/api/convert-to-avif', {
              method: 'POST',
              body: convertFormData,
            });
            
            if (!convertResponse.ok) {
              throw new Error('Konvertierung zu AVIF fehlgeschlagen');
            }
            
            // Get metadata from headers
            const originalFormat = convertResponse.headers.get('X-Original-Format');
            const avifSize = convertResponse.headers.get('X-AVIF-Size');
            console.log(`Converted from ${originalFormat}, size: ${avifSize} bytes`);
            
            // Get the AVIF blob
            const avifBlob = await convertResponse.blob();
            finalFilename = item.file.name.replace(/\.[^/.]+$/, '') + '.avif';
            finalMime = 'image/avif';
            finalSize = avifBlob.size;
            fileToUpload = new File([avifBlob], finalFilename, { type: 'image/avif' });
          }
          
          console.log('Uploading:', finalFilename);
          
          // 2. Hole presigned URL
          const uploadResponse = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: finalFilename,
              mime: finalMime,
              size: finalSize,
            }),
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.text();
            console.error('Presigned URL Error:', errorData);
            throw new Error(`Presigned URL konnte nicht erstellt werden`);
          }

          const { url, fields, objectKey } = await uploadResponse.json();
          console.log('Got presigned URL:', url);
          console.log('Fields:', fields);
          console.log('ObjectKey:', objectKey);

          // 3. Upload zu MinIO
          const formData = new FormData();
          Object.entries(fields).forEach(([key, value]) => {
            formData.append(key, value as string);
          });
          formData.append("file", fileToUpload);

          console.log('Uploading to MinIO...');
          const minioResponse = await fetch(url, {
            method: "POST",
            body: formData,
          });

          console.log('MinIO Response Status:', minioResponse.status);
          if (!minioResponse.ok) {
            const errorText = await minioResponse.text();
            console.error('MinIO Error:', errorText);
            throw new Error(`Upload zu MinIO fehlgeschlagen (${minioResponse.status})`);
          }

          console.log('MinIO upload successful!');

          // 3. Speichere Metadaten in DB
          const metadataResponse = await fetch("/api/images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: finalFilename,
              key: objectKey,
              mime: finalMime,
              size: finalSize,
              tags: [],
            }),
          });

          if (!metadataResponse.ok) {
            const errorData = await metadataResponse.text();
            console.error('Metadata Error:', errorData);
            throw new Error(`Metadaten konnten nicht gespeichert werden`);
          }
          
          console.log('Metadata saved successfully!');
          successCount++;
        } catch (fileError) {
          // Fehler für dieses Bild loggen, aber weitermachen
          console.error(`Fehler beim Upload von ${item.file.name}:`, fileError);
          failedCount++;
          failedFiles.push(item.file.name);
        }
      }

      // Cleanup und Success
      queuedFiles.forEach((item) => URL.revokeObjectURL(item.preview));
      setQueuedFiles([]);
      
      // Zeige Ergebnis-Nachricht
      if (successCount > 0 && failedCount === 0) {
        showToast("success", `${successCount} Bild(er) erfolgreich hochgeladen.`, 3000);
      } else if (successCount > 0 && failedCount > 0) {
        showToast(
          "warning", 
          `${successCount} Bild(er) hochgeladen, ${failedCount} übersprungen (${failedFiles.join(', ')}).`, 
          7000
        );
      } else if (failedCount > 0) {
        showToast(
          "error", 
          `Alle ${failedCount} Bilder konnten nicht hochgeladen werden.`, 
          7000
        );
      }
      
      // Rufe die Success-Callback auf (auch wenn nicht alle erfolgreich waren)
      await onUpload([]);
    } catch (uploadError) {
      // Nur kritische Fehler die den ganzen Prozess stoppen
      console.error('Critical Upload Error:', uploadError);
      const errorMessage = uploadError instanceof Error ? uploadError.message : "Upload fehlgeschlagen.";
      setError(errorMessage);
      showToast("error", errorMessage, 7000);
      throw uploadError;
    }
  };

  const removeFile = (index: number) => {
    setQueuedFiles((prev) => {
      const item = prev[index];
      URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-card/60 p-6">
      <div
        {...getRootProps({
          className: `cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/30 bg-background/80 p-6 transition hover:border-primary ${isDragActive ? "border-primary bg-primary/10" : ""}`,
        })}
      >
        <input {...getInputProps()} />
        
        {queuedFiles.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-medium">
              {isDragActive ? "Loslassen zum Hochladen" : "Dateien hier ablegen oder klicken"}
            </p>
            <p className="text-sm text-muted-foreground">
              Unterstützt: JPEG, PNG, HEIC, WebP, GIF, AVIF
            </p>
            <p className="text-xs text-muted-foreground">
              Max. 50MB pro Datei
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center py-4">
              <p className="text-lg font-medium">
                {isDragActive ? "Weitere Bilder hinzufügen" : "Klicken oder ziehen für weitere Bilder"}
              </p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mt-2">
                {queuedFiles.length} {queuedFiles.length === 1 ? 'Bild' : 'Bilder'} in Warteschlange
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {queuedFiles.map((item, index) => (
                <div 
                  key={item.id} 
                  className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Image
                    src={item.preview}
                    alt={item.file.name}
                    fill
                    className="object-cover pointer-events-none"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                    <p className="text-white text-xs font-medium text-center truncate w-full mb-1">
                      {item.file.name}
                    </p>
                    <p className="text-white/80 text-xs mb-2">
                      {formatFileSize(item.file.size)}
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      disabled={isUploading}
                      className="h-8 w-8 p-0"
                    >
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
        <Button size="lg" disabled={isUploading || queuedFiles.length === 0} onClick={handleUpload}>
          {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isUploading ? "Lade hoch..." : `Jetzt hochladen (${queuedFiles.length})`}
        </Button>
      </div>
      
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
