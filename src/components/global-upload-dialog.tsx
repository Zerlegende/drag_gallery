"use client";

import { useUploadQueue } from "@/contexts/upload-queue-context";
import { UploadDropzone } from "@/components/gallery/upload-dropzone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function GlobalUploadDialog() {
  const { uploadDialogOpen, uploadDialogFiles, closeUploadDialog } = useUploadQueue();

  return (
    <Dialog open={uploadDialogOpen} onOpenChange={open => { if (!open) closeUploadDialog(); }}>
      <DialogContent
        className="max-w-[95vw] h-[95vh] overflow-y-auto"
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 h-10 w-10 rounded-full hover:bg-destructive/10 hover:text-destructive z-50"
          onClick={closeUploadDialog}
        >
          <X className="h-6 w-6" />
        </Button>
        <DialogHeader>
          <DialogTitle>Bilder hochladen</DialogTitle>
          <DialogDescription>Wähle Bilder aus oder ziehe sie in den Bereich.</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <UploadDropzone onClose={closeUploadDialog} initialFiles={uploadDialogFiles} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
