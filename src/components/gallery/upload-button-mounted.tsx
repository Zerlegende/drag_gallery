"use client";

import { useState, useEffect } from "react";
import { UploadButton } from "./upload-button";

export function UploadButtonMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-10 w-[180px]" />; // Placeholder mit gleicher Größe
  }

  return <UploadButton />;
}
