"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, Loader2, X } from "lucide-react";
import { UploadDropzone } from "./upload-dropzone";
import { useRouter } from "next/navigation";

type UploadButtonProps = {
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  initialFiles?: File[];
};

export function UploadButton({ 
  externalOpen, 
  onExternalOpenChange,
  initialFiles 
}: UploadButtonProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  // Verwende external oder internal state
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onExternalOpenChange || setInternalOpen;

  const handleUpload = async (payload: any[]) => {
    // Dieser Callback wird von UploadDropzone NACH dem erfolgreichen Upload aufgerufen
    setIsUploading(false);
    setOpen(false);
    
    // Warte kurz damit das Modal sich schließt, dann refresh
    setTimeout(() => {
      // Verwende router.refresh() für Next.js App Router
      router.refresh();
      
      // Als Fallback: Hard reload nach kurzer Verzögerung falls router.refresh() nicht funktioniert
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }, 100);
  };

  const handleDialogChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state wenn Dialog geschlossen wird
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      {!externalOpen && (
        <DialogTrigger asChild>
          <Button size="lg">
            <Upload className="h-4 w-4 mr-2" />
            Bilder hochladen
          </Button>
        </DialogTrigger>
      )}
      <DialogContent 
        className="max-w-[95vw] h-[95vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 h-10 w-10 rounded-full hover:bg-destructive/10 hover:text-destructive z-50"
          onClick={() => setOpen(false)}
          disabled={isUploading}
        >
          <X className="h-6 w-6" />
        </Button>
        <DialogHeader>
          <DialogTitle>Bilder hochladen</DialogTitle>
          <DialogDescription>
            Wähle Bilder aus oder ziehe sie in den Bereich. Du kannst mehrere Bilder gleichzeitig hochladen und Tags hinzufügen.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <UploadDropzone
            isUploading={isUploading}
            onUpload={handleUpload}
            onUploadStart={() => setIsUploading(true)}
            initialFiles={initialFiles}
          />
        </div>
        {isUploading && (
          <div className="flex items-center justify-center gap-2 p-4 bg-primary/10 rounded-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Bilder werden hochgeladen...</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
