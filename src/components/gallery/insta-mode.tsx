"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { X, Heart } from "lucide-react";
import type { ImageWithTags } from "@/lib/db";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

function buildImageUrl(key: string, fallback: string) {
  if (!BASE_URL) return fallback;
  return `${BASE_URL.replace(/\/$/, "")}/${key}`;
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
  const getRandomImage = () => {
    console.log('🎲 Getting random image, total images:', images.length);
    
    // Filter out already viewed images
    const unviewedImages = images.filter(img => !viewedImageIds.has(img.id));
    console.log('👁️ Unviewed images:', unviewedImages.length, '/ Total:', images.length);
    
    if (unviewedImages.length === 0) {
      console.log('⚠️ All images viewed, resetting...');
      // All images have been viewed, reset the viewed list
      setViewedImageIds(new Set());
      return images.length > 0 ? images[Math.floor(Math.random() * images.length)] : null;
    }
    
    const randomIndex = Math.floor(Math.random() * unviewedImages.length);
    console.log('🎯 Selected random index:', randomIndex, 'Image:', unviewedImages[randomIndex]?.filename);
    return unviewedImages[randomIndex];
  };

  // Preload next images for smooth UX
  const preloadNextImages = () => {
    const imagesToPreload: ImageWithTags[] = [];
    
    // If we're at the end of history, preload 3 new random images
    if (historyIndex === imageHistory.length - 1) {
      for (let i = 0; i < 3; i++) {
        const nextImg = getRandomImage();
        if (nextImg && !imagesToPreload.find(img => img.id === nextImg.id)) {
          imagesToPreload.push(nextImg);
        }
      }
      
      if (imagesToPreload.length > 0) {
        setImageHistory(prev => [...prev, ...imagesToPreload]);
      }
    }
  };

  // Navigate to next image (swipe up)
  const goToNextImage = () => {
    // Check if we can go forward in history
    if (historyIndex < imageHistory.length - 1) {
      // Go forward in history
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setCurrentImage(imageHistory[nextIndex]);
    } else {
      // Get a new random image
      const nextImage = getRandomImage();
      if (nextImage) {
        setImageHistory(prev => [...prev, nextImage]);
        setHistoryIndex(prev => prev + 1);
        setCurrentImage(nextImage);
      }
    }
  };

  // Navigate to previous image (swipe down)
  const goToPreviousImage = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setCurrentImage(imageHistory[prevIndex]);
    }
  };

  // Initialize with random image and preload next 3
  useEffect(() => {
    console.log('🚀 InstaMode mounted, images count:', images.length);
    const initialImages: ImageWithTags[] = [];
    
    // Get initial image
    const img = getRandomImage();
    if (img) {
      initialImages.push(img);
      
      // Preload next 3 images
      for (let i = 0; i < 3; i++) {
        const nextImg = getRandomImage();
        if (nextImg && !initialImages.find(existing => existing.id === nextImg.id)) {
          initialImages.push(nextImg);
        }
      }
      
      console.log('📸 Loaded initial + 3 preloaded images, total:', initialImages.length);
      setCurrentImage(initialImages[0]);
      setImageHistory(initialImages);
      setHistoryIndex(0);
    }
  }, []);

  // Preload next images when user gets close to the end
  useEffect(() => {
    // When user is 2 images away from the end, preload more
    if (historyIndex >= imageHistory.length - 2) {
      preloadNextImages();
    }
  }, [historyIndex, imageHistory.length]);

  // Update like status when image changes
  useEffect(() => {
    if (currentImage) {
      // Mark this image as viewed
      setViewedImageIds(prev => new Set(prev).add(currentImage.id));
      
      setIsLiked(currentImage.is_liked || false);
      
      // Fetch like count and likers from API
      fetch(`/api/images/${currentImage.id}/like`)
        .then(res => res.json())
        .then(data => {
          setLikeCount(data.likeCount || 0);
          setLikers(data.likers || []);
        })
        .catch(error => {
          console.error('Error fetching like info:', error);
          setLikeCount(0);
          setLikers([]);
        });
    }
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
    touchEndRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current || !touchEndRef.current) return;

    const deltaY = touchStartRef.current.y - touchEndRef.current.y;
    const deltaX = Math.abs(touchEndRef.current.x - touchStartRef.current.x);
    
    // Swipe up detection (minimum 80px vertical, must be more vertical than horizontal)
    if (deltaY > 80 && deltaY > deltaX) {
      // Swipe UP - Next image
      goToNextImage();
    } 
    // Swipe down detection (minimum 80px vertical, must be more vertical than horizontal)
    else if (deltaY < -80 && Math.abs(deltaY) > deltaX) {
      // Swipe DOWN - Previous image
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
  const imageUrl = buildImageUrl(currentImage.key, fallback);
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
        <div className="relative w-full h-full">
          <Image
            src={imageUrl}
            alt={displayName}
            fill
            className="object-contain"
            sizes="100vw"
            quality={90}
            priority
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

      {/* Preload next 3 images (hidden) */}
      <div className="hidden">
        {imageHistory.slice(historyIndex + 1, historyIndex + 4).map((img) => {
          const preloadUrl = buildImageUrl(img.key, '');
          return (
            <Image
              key={img.id}
              src={preloadUrl}
              alt="preload"
              width={1}
              height={1}
              priority
            />
          );
        })}
      </div>
    </div>
  );
}
