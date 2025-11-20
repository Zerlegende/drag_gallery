"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { X, Heart } from "lucide-react";
import type { ImageWithTags } from "@/lib/db";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

function buildImageUrl(key: string, fallback: string, timestamp?: string) {
  if (!BASE_URL) return fallback;
  const baseUrl = `${BASE_URL.replace(/\/$/, "")}/${key}`;
  return timestamp ? `${baseUrl}?t=${timestamp}` : baseUrl;
}

type LikeInfo = {
  userId: string;
  userName: string;
  userImage?: string;
};

export type InstaModeProps = {
  images: ImageWithTags[];
  onClose: () => void;
};

export function InstaMode({ images, onClose }: InstaModeProps) {
  const [currentImage, setCurrentImage] = useState<ImageWithTags | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isLiking, setIsLiking] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likers, setLikers] = useState<LikeInfo[]>([]);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [viewedImageIds, setViewedImageIds] = useState<Set<string>>(new Set());
  const [imageHistory, setImageHistory] = useState<ImageWithTags[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  // Get random image that hasn't been viewed yet
  const getRandomImage = (currentViewedIds: Set<string>) => {
    // Filter out already viewed images
    const unviewedImages = images.filter(img => !currentViewedIds.has(img.id));
    
    if (unviewedImages.length === 0) {
      // All images have been viewed, reset the viewed list
      return images.length > 0 ? images[Math.floor(Math.random() * images.length)] : null;
    }
    
    const randomIndex = Math.floor(Math.random() * unviewedImages.length);
    return unviewedImages[randomIndex];
  };

  // Preload next images for smooth UX
  const preloadNextImages = () => {
    const imagesToPreload: ImageWithTags[] = [];
    const currentViewed = new Set(viewedImageIds);
    
    // If we're at the end of history, preload 10 new random images
    if (historyIndex === imageHistory.length - 1) {
      for (let i = 0; i < 10; i++) {
        const nextImg = getRandomImage(currentViewed);
        if (nextImg && !imagesToPreload.find(img => img.id === nextImg.id)) {
          imagesToPreload.push(nextImg);
          currentViewed.add(nextImg.id); // Mark as viewed in local copy
        }
      }
      
      if (imagesToPreload.length > 0) {
        setImageHistory(prev => [...prev, ...imagesToPreload]);
      }
    }
  };

  // Navigate to next image (swipe up)
  const goToNextImage = () => {
    setIsImageLoading(true);
    
    // Check if we can go forward in history
    if (historyIndex < imageHistory.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextImg = imageHistory[nextIndex];
      setHistoryIndex(nextIndex);
      setCurrentImage(nextImg);
      setIsLiked(nextImg.is_liked || false);
    } else {
      // Get a new random image
      const nextImage = getRandomImage(viewedImageIds);
      if (nextImage) {
        setImageHistory(prev => [...prev, nextImage]);
        setHistoryIndex(prev => prev + 1);
        setCurrentImage(nextImage);
        setIsLiked(nextImage.is_liked || false);
      }
    }
  };

  // Navigate to previous image (swipe down)
  const goToPreviousImage = () => {
    if (historyIndex > 0) {
      setIsImageLoading(true);
      const prevIndex = historyIndex - 1;
      const prevImg = imageHistory[prevIndex];
      setHistoryIndex(prevIndex);
      setCurrentImage(prevImg);
      setIsLiked(prevImg.is_liked || false);
    }
  };

  // Initialize with random image and preload next 10
  useEffect(() => {
    const initialImages: ImageWithTags[] = [];
    const currentViewed = new Set<string>();
    
    // Get initial image
    const img = getRandomImage(currentViewed);
    if (img) {
      initialImages.push(img);
      currentViewed.add(img.id);
      
      // Preload next 10 images
      for (let i = 0; i < 10; i++) {
        const nextImg = getRandomImage(currentViewed);
        if (nextImg && !initialImages.find(existing => existing.id === nextImg.id)) {
          initialImages.push(nextImg);
          currentViewed.add(nextImg.id);
        }
      }
      
      setCurrentImage(initialImages[0]);
      setImageHistory(initialImages);
      setHistoryIndex(0);
    }
  }, []);

  // Preload next images when user gets close to the end
  useEffect(() => {
    // When user is 5 images away from the end, preload more
    if (historyIndex >= imageHistory.length - 5) {
      preloadNextImages();
    }
  }, [historyIndex, imageHistory.length]);

  // AGGRESSIVE PRELOADING: Force browser to cache next 10 images
  useEffect(() => {
    const imagesToPreload = imageHistory.slice(historyIndex + 1, historyIndex + 11);
    
    imagesToPreload.forEach((img) => {
      const url = buildImageUrl(img.key, '');
      
      // Create native Image object to force browser caching
      const image = new window.Image();
      image.src = url;
      
      // Also add preload link to DOM
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      link.fetchPriority = 'high';
      document.head.appendChild(link);
    });
    
    // Cleanup preload links when component unmounts
    return () => {
      const preloadLinks = document.querySelectorAll('link[rel="preload"][as="image"]');
      preloadLinks.forEach(link => link.remove());
    };
  }, [historyIndex, imageHistory]);

  // Update like status when image changes - debounced
  useEffect(() => {
    if (!currentImage) return;
    
    // Mark this image as viewed
    setViewedImageIds(prev => new Set(prev).add(currentImage.id));
    
    // Debounce API call - only fetch after user stops swiping
    const timer = setTimeout(() => {
      fetch(`/api/images/${currentImage.id}/like`)
        .then(res => res.json())
        .then(data => {
          setLikeCount(data.likeCount || 0);
          setLikers(data.likers || []);
        })
        .catch(() => {
          setLikeCount(0);
          setLikers([]);
        });
    }, 300);
    
    return () => clearTimeout(timer);
  }, [currentImage]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleLike = async () => {
    if (!currentImage || isLiking) return;
    
    setIsLiking(true);
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikeCount(prev => newLikedState ? prev + 1 : Math.max(0, prev - 1));
    
    try {
      const response = await fetch(`/api/images/${currentImage.id}/like`, {
        method: "POST",
      });
      
      if (!response.ok) {
        // Revert on error
        setIsLiked(!newLikedState);
        setLikeCount(prev => newLikedState ? Math.max(0, prev - 1) : prev + 1);
      } else {
        // Refresh like info to get updated likers list
        const likeInfoResponse = await fetch(`/api/images/${currentImage.id}/like`);
        const likeInfo = await likeInfoResponse.json();
        setLikeCount(likeInfo.likeCount || 0);
        setLikers(likeInfo.likers || []);
      }
    } catch (error) {
      // Revert on error
      setIsLiked(!newLikedState);
      setLikeCount(prev => newLikedState ? Math.max(0, prev - 1) : prev + 1);
    } finally {
      setIsLiking(false);
    }
  };

  const handleDoubleTap = () => {
    if (!isLiked) {
      handleLike();
      setShowHeartAnimation(true);
      setTimeout(() => setShowHeartAnimation(false), 1000);
    }
  };

  const handleTap = () => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    
    if (timeSinceLastTap < 300) {
      // Double tap detected
      handleDoubleTap();
    }
    
    lastTapRef.current = now;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    touchEndRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    touchEndRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current || !touchEndRef.current) return;

    const deltaY = touchStartRef.current.y - touchEndRef.current.y;
    const deltaX = Math.abs(touchEndRef.current.x - touchStartRef.current.x);
    
    // Must be more vertical than horizontal
    if (Math.abs(deltaY) <= deltaX) {
      touchStartRef.current = null;
      touchEndRef.current = null;
      return;
    }
    
    // Swipe up (minimum 80px) - Next image
    if (deltaY > 80) {
      goToNextImage();
    } 
    // Swipe down (minimum 80px) - Previous image
    else if (deltaY < -80) {
      goToPreviousImage();
    }

    touchStartRef.current = null;
    touchEndRef.current = null;
  };

  if (!currentImage) {
    console.log('❌ InstaMode: No current image, rendering nothing');
    return null;
  }

  const fallback = `https://dummyimage.com/1024x768/1e293b/ffffff&text=${encodeURIComponent(currentImage.filename)}`;
  const timestamp = currentImage.updated_at || currentImage.created_at;
  const imageUrl = buildImageUrl(currentImage.key, fallback, timestamp);
  const displayName = currentImage.imagename || currentImage.filename;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black",
        "flex flex-col",
        "animate-in fade-in duration-200"
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleTap}
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

      {/* Image Container */}
      <div className="flex-1 flex items-center justify-center relative">
        {/* Loading Spinner */}
        {isImageLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        
        <div className="relative w-full h-full">
          <Image
            src={imageUrl}
            alt={displayName}
            fill
            className="object-contain"
            sizes="100vw"
            quality={90}
            priority
            onLoadingComplete={() => setIsImageLoading(false)}
          />
        </div>

        {/* Double Tap Heart Animation */}
        {showHeartAnimation && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Heart
              className={cn(
                "w-32 h-32 text-white fill-white",
                "animate-in zoom-in-50 fade-in duration-300",
                "animate-out zoom-out-50 fade-out duration-500"
              )}
            />
          </div>
        )}
      </div>

      {/* Bottom Info Section */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent p-6 pt-20">
        {/* Image Name */}
        <h2 className="text-xl font-semibold text-white mb-4">
          {displayName}
        </h2>

        {/* Like Section */}
        <div className="flex items-center gap-4 mb-4">
          {/* Heart Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleLike();
            }}
            disabled={isLiking}
            className={cn(
              "transition-transform duration-200 active:scale-90",
              "disabled:opacity-50"
            )}
          >
            <Heart
              className={cn(
                "h-8 w-8 transition-colors",
                isLiked ? "fill-red-500 text-red-500" : "text-white"
              )}
            />
          </button>

          {/* Like Count */}
          <span className="text-white font-semibold">
            {likeCount} {likeCount === 1 ? "Like" : "Likes"}
          </span>

          {/* Likers Profile Pictures - Right next to likes */}
          {likers.length > 0 && (
            <>
              <div className="flex -space-x-2">
                {likers.slice(0, 5).map((liker, index) => {
                  const avatarUrl = liker.userImage 
                    ? buildImageUrl(liker.userImage, liker.userImage)
                    : null;
                  
                  return (
                    <div
                      key={liker.userId}
                      className="relative w-8 h-8 rounded-full border-2 border-black bg-muted overflow-hidden"
                      style={{ zIndex: likers.length - index }}
                    >
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt={liker.userName}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-semibold">
                          {liker.userName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {likers.length > 5 && (
                <span className="text-white/70 text-sm">
                  +{likers.length - 5}
                </span>
              )}
            </>
          )}
        </div>

        {/* Swipe Hints */}
        <div className="text-center text-white/50 text-sm mt-4 space-y-1">
          <div>↑ Nach oben wischen für nächstes Bild</div>
          {historyIndex > 0 && (
            <div>↓ Nach unten wischen für vorheriges Bild</div>
          )}
        </div>
      </div>
    </div>
  );
}
