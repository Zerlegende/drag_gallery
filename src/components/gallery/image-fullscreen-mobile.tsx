"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { X, MoreVertical, Heart, Download, Tag, ChevronLeft, ChevronRight } from "lucide-react";
import type { ImageWithTags, TagRecord } from "@/lib/db";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { getImageVariantKey } from "@/lib/image-variants-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

function buildImageUrl(key: string, fallback: string, timestamp?: string) {
  if (!BASE_URL) return fallback;
  const baseUrl = `${BASE_URL.replace(/\/$/, "")}/${key}`;
  return timestamp ? `${baseUrl}?t=${timestamp}` : baseUrl;
}

export type ImageFullscreenMobileProps = {
  image: ImageWithTags | null;
  onClose: () => void;
  availableTags?: TagRecord[];
  onSave?: (id: string, data: { tags?: string[] }) => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
};

export function ImageFullscreenMobile({ 
  image, 
  onClose, 
  availableTags = [], 
  onSave,
  onNavigate,
  hasPrev = false,
  hasNext = false,
}: ImageFullscreenMobileProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearchInput, setTagSearchInput] = useState("");
  const [isLiked, setIsLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [showArrows, setShowArrows] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);
  const isSwipingRef = useRef(false);

  // Initialize tags and like status when image changes
  useEffect(() => {
    if (image) {
      setSelectedTags(image.tags.map(tag => tag.name));
      setIsLiked(image.is_liked || false);
      setShowMenu(false);
      setShowTagEditor(false);
      setTagSearchInput("");
    }
  }, [image]);

  // Handle browser back button / gesture navigation - only on mount/unmount
  useEffect(() => {
    if (!image) return;

    // Add hash to URL when opening (only once)
    window.history.pushState(null, "", "#image");

    // Listen for back button
    const handlePopState = () => {
      onClose();
    };

    window.addEventListener("popstate", handlePopState);

    // Cleanup: remove listener and reset URL (only on unmount)
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Only remove hash if we're still on the image view
      if (window.location.hash === "#image") {
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount!

  // Handle click outside menu to close it
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Close menu if clicking outside both the menu and the menu button
      if (
        menuRef.current && 
        menuButtonRef.current &&
        !menuRef.current.contains(target) && 
        !menuButtonRef.current.contains(target)
      ) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  // Handle Escape key
  useEffect(() => {
    if (!image) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [image, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (image) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [image]);

  // Show arrows whenever navigation is available
  useEffect(() => {
    if (!image || !onNavigate) return;
    setShowArrows(hasPrev || hasNext);
  }, [image, onNavigate, hasPrev, hasNext]);

  // Handle swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!onNavigate) return;
    isSwipingRef.current = false;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    touchEndRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!onNavigate) return;
    touchEndRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!onNavigate || !touchStartRef.current || !touchEndRef.current) {
      touchStartRef.current = null;
      touchEndRef.current = null;
      return;
    }

    const deltaX = touchEndRef.current.x - touchStartRef.current.x;
    const deltaY = Math.abs(touchEndRef.current.y - touchStartRef.current.y);
    
    console.log('📊 Swipe delta:', { deltaX, deltaY, absDeltaX: Math.abs(deltaX) });
    
    // Only trigger if horizontal swipe is dominant (not vertical scroll) and minimum distance
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > deltaY) {
      console.log('✅ Valid swipe detected! Direction:', deltaX > 0 ? 'RIGHT (prev)' : 'LEFT (next)');
      console.log('🛡️ Setting isSwipingRef to true');
      
      e.preventDefault(); // Prevent the synthetic click event
      e.stopPropagation(); // Stop event bubbling
      isSwipingRef.current = true; // Mark as swiping to prevent onClick
      
      if (deltaX > 0 && hasPrev) {
        onNavigate('prev');
      } else if (deltaX < 0 && hasNext) {
        onNavigate('next');
      }
      
      // Reset swiping flag after a delay to prevent click events
      setTimeout(() => {
        isSwipingRef.current = false;
      }, 500);
    } else {
    }

    touchStartRef.current = null;
    touchEndRef.current = null;
  };

  const handleArrowClick = (direction: 'prev' | 'next') => {
    if (!onNavigate) return;
    onNavigate(direction);
  };

  // Handle Like
  const handleLike = async () => {
    if (!image || isLiking || image.is_liked === undefined) return;
    
    setIsLiking(true);
    setIsLiked(!isLiked);
    
    try {
      const response = await fetch(`/api/images/${image.id}/like`, {
        method: "POST",
      });
      
      if (!response.ok) {
        setIsLiked(isLiked);
      }
    } catch (error) {
      setIsLiked(isLiked);
    } finally {
      setIsLiking(false);
    }
    setShowMenu(false);
  };

  // Handle Download
  const handleDownload = async () => {
    if (!image) return;
    
    try {
      // Always download original, not variant
      const imageUrl = `${process.env.NEXT_PUBLIC_MINIO_BASE_URL}/${image.key}`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = image.imagename || image.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading image:", error);
    }
    setShowMenu(false);
  };

  // Handle Tag Editor
  const handleAddTag = (tagName: string) => {
    if (!selectedTags.includes(tagName)) {
      setSelectedTags([...selectedTags, tagName]);
    }
    setTagSearchInput("");
  };

  const handleRemoveTag = (tagName: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tagName));
  };

  const handleSaveTags = () => {
    if (image && onSave) {
      onSave(image.id, { tags: selectedTags });
    }
    setShowTagEditor(false);
    setShowMenu(false);
  };

  if (!image) {
    console.log('❌ Image is null - component will unmount');
    return null;
  }

  const fallback = `https://dummyimage.com/1024x768/1e293b/ffffff&text=${encodeURIComponent(image.filename)}`;
  const timestamp = image.updated_at || image.created_at;
  const previewKey = getImageVariantKey(image.key, 'preview');
  const imageUrl = buildImageUrl(previewKey, fallback, timestamp);
  
  // Bildname: entweder imagename oder filename
  const displayName = image.imagename || image.filename;

  // Filter tag suggestions
  const suggestions = availableTags
    .filter(tag => 
      !selectedTags.includes(tag.name) && 
      tag.name.toLowerCase().includes(tagSearchInput.toLowerCase())
    )
    .slice(0, 10);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black",
        "flex flex-col",
        "animate-in fade-in duration-200"
      )}
      onClick={(e) => {
        console.log('🖱️ Background onClick fired! isSwipingRef:', isSwipingRef.current, 'showTagEditor:', showTagEditor);
        // Don't close if we just finished swiping or if tag editor is open
        if (!showTagEditor && !isSwipingRef.current) {
          console.log('🚪 Closing view from background click');
          onClose();
        } else {
          console.log('🚫 Close prevented - swipe or tag editor active');
        }
      }}
    >
      {/* Close Button - Top Right */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={cn(
          "absolute top-4 right-4 z-10",
          "h-12 w-12 rounded-full",
          "bg-black/50 backdrop-blur-sm",
          "flex items-center justify-center",
          "text-white hover:bg-black/70",
          "transition-all duration-200",
          "active:scale-90"
        )}
        aria-label="Schließen"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Menu Button (3 Dots) - Below Close Button */}
      <button
        ref={menuButtonRef}
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className={cn(
          "absolute top-20 right-4 z-10",
          "h-12 w-12 rounded-full",
          "bg-black/50 backdrop-blur-sm",
          "flex items-center justify-center",
          "text-white hover:bg-black/70",
          "transition-all duration-200",
          "active:scale-90"
        )}
        aria-label="Menü"
      >
        <MoreVertical className="h-6 w-6" />
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className={cn(
            "absolute top-32 right-4 z-20",
            "min-w-[200px] rounded-lg",
            "bg-black/90 backdrop-blur-md",
            "border border-white/20",
            "overflow-hidden",
            "animate-in fade-in slide-in-from-top-2 duration-200"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setShowTagEditor(true);
              setShowMenu(false);
            }}
            className={cn(
              "w-full px-4 py-3 flex items-center gap-3",
              "text-white hover:bg-white/10",
              "transition-colors duration-150",
              "active:bg-white/20"
            )}
          >
            <Tag className="h-5 w-5" />
            <span>Tags hinzufügen</span>
          </button>
          
          {image.is_liked !== undefined && (
            <button
              onClick={handleLike}
              disabled={isLiking}
              className={cn(
                "w-full px-4 py-3 flex items-center gap-3",
                "text-white hover:bg-white/10",
                "transition-colors duration-150",
                "active:bg-white/20",
                "disabled:opacity-50"
              )}
            >
              <Heart className={cn("h-5 w-5", isLiked && "fill-red-500 text-red-500")} />
              <span>{isLiked ? "Unlike" : "Liken"}</span>
            </button>
          )}
          
          <button
            onClick={handleDownload}
            className={cn(
              "w-full px-4 py-3 flex items-center gap-3",
              "text-white hover:bg-white/10",
              "transition-colors duration-150",
              "active:bg-white/20"
            )}
          >
            <Download className="h-5 w-5" />
            <span>Herunterladen</span>
          </button>
        </div>
      )}

      {/* Tag Editor Overlay */}
      {showTagEditor && (
        <div
          className="absolute inset-0 z-30 bg-black/95 flex items-end"
          onClick={(e) => {
            e.stopPropagation();
            setShowTagEditor(false);
          }}
        >
          <div
            className={cn(
              "w-full bg-background rounded-t-2xl",
              "max-h-[80vh] overflow-y-auto",
              "p-6 pb-8",
              "animate-in slide-in-from-bottom duration-300"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Tags bearbeiten</h3>
              <button
                onClick={() => setShowTagEditor(false)}
                className="p-2 hover:bg-muted rounded-full"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Selected Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedTags.map((tagName) => (
                <Badge
                  key={tagName}
                  variant="secondary"
                  className="pl-3 pr-1 py-1 flex items-center gap-1"
                >
                  {tagName}
                  <button
                    onClick={() => handleRemoveTag(tagName)}
                    className="ml-1 hover:bg-background rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            {/* Tag Search */}
            <Input
              placeholder="Tag suchen oder erstellen..."
              value={tagSearchInput}
              onChange={(e) => setTagSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tagSearchInput.trim()) {
                  handleAddTag(tagSearchInput.trim());
                }
              }}
              className="mb-2"
            />

            {/* Tag Suggestions */}
            {tagSearchInput && suggestions.length > 0 && (
              <div className="space-y-1 mb-4 max-h-40 overflow-y-auto">
                {suggestions.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => handleAddTag(tag.name)}
                    className="w-full text-left px-3 py-2 hover:bg-muted rounded-md transition-colors"
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 mt-6">
              <Button
                onClick={() => setShowTagEditor(false)}
                variant="outline"
                className="flex-1"
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleSaveTags}
                className="flex-1"
              >
                Speichern
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Image Container - Center */}
      <div 
        className="flex-1 flex items-center justify-center p-4 pt-20 pb-24 relative"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative w-full h-full max-w-screen-xl">
          <Image
            src={imageUrl}
            alt={displayName}
            fill
            unoptimized // Disable Next.js optimization for better error handling
            className="object-contain"
            sizes="100vw"
            quality={90}
            priority
          />
        </div>

        {/* Navigation Arrows - Only shown on first view */}
        {showArrows && hasPrev && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleArrowClick('prev');
            }}
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 z-10",
              "h-12 w-12 rounded-full",
              "bg-black/30 backdrop-blur-sm",
              "flex items-center justify-center",
              "text-white/80 hover:bg-black/50 hover:text-white",
              "transition-all duration-200",
              "active:scale-90",
              "animate-in fade-in slide-in-from-left-4 duration-500"
            )}
            aria-label="Vorheriges Bild"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
        )}

        {showArrows && hasNext && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleArrowClick('next');
            }}
            className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 z-10",
              "h-12 w-12 rounded-full",
              "bg-black/30 backdrop-blur-sm",
              "flex items-center justify-center",
              "text-white/80 hover:bg-black/50 hover:text-white",
              "transition-all duration-200",
              "active:scale-90",
              "animate-in fade-in slide-in-from-right-4 duration-500"
            )}
            aria-label="Nächstes Bild"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        )}
      </div>

      {/* Image Name - Bottom */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0",
          "bg-gradient-to-t from-black via-black/80 to-transparent",
          "p-6 pt-12",
          "text-white"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-medium text-center line-clamp-2">
          {displayName}
        </p>
      </div>
    </div>
  );
}
