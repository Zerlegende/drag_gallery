"use client";

import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useUploadQueue } from "@/contexts/upload-queue-context";

export function UploadButton() {
  const { openUploadDialog } = useUploadQueue();

  return (
    <Button size="lg" onClick={() => openUploadDialog()}>
      <Upload className="h-4 w-4 mr-2" />
      Bilder hochladen
    </Button>
  );
}
