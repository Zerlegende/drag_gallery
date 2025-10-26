"use client";

import { useState, useEffect } from "react";
import { UploadButton } from "./upload-button";

interface GalleryPageClientProps {
  children: React.ReactNode;
}

export function GalleryPageClient({ children }: GalleryPageClientProps) {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

  const handleUploadModalChange = (open: boolean) => {
    setUploadModalOpen(open);
    // Dateien zurücksetzen wenn Modal geschlossen wird
    if (!open) {
      setDroppedFiles([]);
    }
  };

  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      // Ignoriere Drag-Events wenn Modal bereits offen ist
      if (uploadModalOpen) return;
      
      // Ignoriere Events die aus einem Dialog kommen
      const target = e.target as HTMLElement;
      if (target.closest('[role="dialog"]')) return;
      
      e.preventDefault();
      dragCounter++;
      
      // Prüfe ob Dateien gezogen werden
      if (e.dataTransfer?.types.includes("Files")) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      // Ignoriere Drag-Events wenn Modal bereits offen ist
      if (uploadModalOpen) return;
      
      // Ignoriere Events die aus einem Dialog kommen
      const target = e.target as HTMLElement;
      if (target.closest('[role="dialog"]')) return;
      
      e.preventDefault();
      dragCounter--;
      
      if (dragCounter === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      // Ignoriere Drag-Events wenn Modal bereits offen ist
      if (uploadModalOpen) return;
      
      // Ignoriere Events die aus einem Dialog kommen
      const target = e.target as HTMLElement;
      if (target.closest('[role="dialog"]')) return;
      
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      // Ignoriere Drag-Events wenn Modal bereits offen ist
      if (uploadModalOpen) return;
      
      // Ignoriere Events die aus einem Dialog kommen
      const target = e.target as HTMLElement;
      if (target.closest('[role="dialog"]')) return;
      
      e.preventDefault();
      dragCounter = 0;
      setIsDragging(false);

      // Prüfe ob Dateien gedroppt wurden
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        // Konvertiere FileList zu Array
        const filesArray = Array.from(e.dataTransfer.files);
        // Speichere die Dateien
        setDroppedFiles(filesArray);
        // Öffne das Upload-Modal
        setUploadModalOpen(true);
      }
    };

    // Event Listener hinzufügen
    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);

    // Cleanup
    return () => {
      document.removeEventListener("dragenter", handleDragEnter);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, [uploadModalOpen]); // Füge uploadModalOpen als dependency hinzu

  return (
    <>
      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="rounded-lg border-2 border-dashed border-primary bg-card p-8 text-center">
            <div className="text-2xl font-semibold mb-2">Dateien hier ablegen</div>
            <div className="text-muted-foreground">
              Lasse die Dateien los, um das Upload-Modal zu öffnen
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal - wird sowohl für Button als auch Drag & Drop verwendet */}
      <div style={{ display: 'none' }}>
        <UploadButton 
          externalOpen={uploadModalOpen}
          onExternalOpenChange={handleUploadModalChange}
          initialFiles={droppedFiles}
        />
      </div>

      {/* Content */}
      {children}
    </>
  );
}
