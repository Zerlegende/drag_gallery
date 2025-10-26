"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type AvatarUploadProps = {
  userId: string;
  currentAvatar?: string | null;
  userName?: string;
};

export function AvatarUpload({ userId, currentAvatar, userName }: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentAvatar || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const router = useRouter();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      showToast("error", "Bitte wähle ein Bild aus");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast("error", "Bild ist zu groß (max 5MB)");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to server
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", userId);

      const response = await fetch("/api/users/avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload fehlgeschlagen");
      }

      const data = await response.json();
      setPreview(data.avatarUrl);
      showToast("success", "Avatar erfolgreich aktualisiert");
      
      // Refresh the page to update the sidebar
      router.refresh();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Upload fehlgeschlagen");
      setPreview(currentAvatar || null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveAvatar = async () => {
    if (!currentAvatar) return;

    setIsUploading(true);
    try {
      const response = await fetch("/api/users/avatar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error("Löschen fehlgeschlagen");
      }

      setPreview(null);
      showToast("success", "Avatar erfolgreich entfernt");
      router.refresh();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Löschen fehlgeschlagen");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 border-2 border-border">
        {preview ? (
          <img 
            src={preview} 
            alt="Avatar" 
            className="h-full w-full object-cover"
          />
        ) : (
          <User className="h-12 w-12 text-muted-foreground" />
        )}
        {isUploading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3">
        <div>
          <p className="text-sm font-medium">Profilbild</p>
          <p className="text-xs text-muted-foreground">
            JPG, PNG oder GIF. Max 5MB.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <Button
            size="sm"
            onClick={handleButtonClick}
            disabled={isUploading}
          >
            <Upload className="h-4 w-4 mr-2" />
            {preview ? "Ändern" : "Hochladen"}
          </Button>

          {preview && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRemoveAvatar}
              disabled={isUploading}
            >
              Entfernen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
