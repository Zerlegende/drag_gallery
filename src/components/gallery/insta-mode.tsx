"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { X, Heart } from "lucide-react";
import { useSession } from "next-auth/react";
import type { ImageWithTags } from "@/lib/db";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { getImageVariantKey, buildImageUrl } from "@/lib/image-variants-utils";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

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
  const { data: session } = useSession();
  const [currentImage, setCurrentImage] = useState<ImageWithTags | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isLiking, setIsLiking] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likers, setLikers] = useState<LikeInfo[]>([]);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [showLikersModal, setShowLikersModal] = useState(false);
  const [viewedImageIds, setViewedImageIds] = useState<Set<string>>(new Set());
  const [imageHistory, setImageHistory] = useState<ImageWithTags[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [slideOffset, setSlideOffset] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [preloadedImages, setPreloadedImages] = useState<ImageWithTags[]>([]);
  // Local map to track like status across navigation (survives back/forth swiping)
  const likedMapRef = useRef<Map<string, boolean>>(new Map());
  // Cache for like data (count + likers) - avoids delay on navigation
  const likeDataCacheRef = useRef<Map<string, { likeCount: number; likers: LikeInfo[] }>>(new Map());
  const prefetchingRef = useRef<Set<string>>(new Set());
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const currentUserId = (session?.user as any)?.id;

  // Get next 10 images from history or new randoms
  const getPreloadImages = (): ImageWithTags[] => {
    const preloads: ImageWithTags[] = [];
    const currentViewed = new Set(viewedImageIds);
    
    // Start from next index in history
    let startIndex = historyIndex + 1;
    
    // First, add from existing history
    for (let i = startIndex; i < imageHistory.length && preloads.length < 10; i++) {
      preloads.push(imageHistory[i]);
    }
    
    // Fill remaining with random images
    while (preloads.length < 10) {
      const randomImg = getRandomImage(currentViewed);
      if (randomImg && !preloads.find(img => img.id === randomImg.id)) {
        preloads.push(randomImg);
        currentViewed.add(randomImg.id);
      } else {
        break; // No more unique images available
      }
    }
    
    return preloads;
  };

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

  // Apply cached like data for an image instantly
  const applyCachedLikeData = (imageId: string, fallbackLiked: boolean) => {
    const cached = likeDataCacheRef.current.get(imageId);
    if (cached) {
      setLikeCount(cached.likeCount);
      setLikers(cached.likers);
      const userLiked = currentUserId 
        ? cached.likers.some(l => l.userId === currentUserId)
        : false;
      setIsLiked(likedMapRef.current.get(imageId) ?? userLiked);
    } else {
      setIsLiked(likedMapRef.current.get(imageId) ?? fallbackLiked);
      setLikeCount(0);
      setLikers([]);
    }
  };

  // Prefetch like data for a list of image IDs
  const prefetchLikeData = (imageIds: string[]) => {
    for (const id of imageIds) {
      if (likeDataCacheRef.current.has(id) || prefetchingRef.current.has(id)) continue;
      prefetchingRef.current.add(id);
      fetch(`/api/images/${id}/like`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          likeDataCacheRef.current.set(id, {
            likeCount: data.likeCount || 0,
            likers: data.likers || [],
          });
          if (currentUserId && data.likers) {
            const userLiked = data.likers.some((l: LikeInfo) => l.userId === currentUserId);
            likedMapRef.current.set(id, userLiked);
          }
        })
        .catch(() => {})
        .finally(() => prefetchingRef.current.delete(id));
    }
  };

  // Navigate to next image (swipe up)
  const goToNextImage = () => {
    // Check if we can go forward in history
    if (historyIndex < imageHistory.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextImg = imageHistory[nextIndex];
      setHistoryIndex(nextIndex);
      setCurrentImage(nextImg);
      applyCachedLikeData(nextImg.id, nextImg.is_liked ?? false);
      setIsImageLoading(true);
    } else {
      // Get a new random image
      const newImage = getRandomImage(viewedImageIds);
      if (newImage) {
        setImageHistory(prev => [...prev, newImage]);
        setHistoryIndex(prev => prev + 1);
        setCurrentImage(newImage);
        applyCachedLikeData(newImage.id, newImage.is_liked ?? false);
        setIsImageLoading(true);
      }
    }
  };

  // Preload next images and add to history
  useEffect(() => {
    if (!currentImage) return;
    
    // Ensure we always have at least 10 images ahead in history
    const imagesAhead = imageHistory.length - (historyIndex + 1);
    
    if (imagesAhead < 10) {
      const currentViewed = new Set(viewedImageIds);
      const newImages: ImageWithTags[] = [];
      const neededImages = 10 - imagesAhead;
      
      // Add existing images to viewed set
      imageHistory.forEach(img => currentViewed.add(img.id));
      
      // Generate new random images
      for (let i = 0; i < neededImages; i++) {
        const randomImg = getRandomImage(currentViewed);
        if (randomImg && !newImages.find(img => img.id === randomImg.id)) {
          newImages.push(randomImg);
          currentViewed.add(randomImg.id);
        } else {
          break;
        }
      }
      
      // Add new images to history
      if (newImages.length > 0) {
        setImageHistory(prev => [...prev, ...newImages]);
      }
    }
    
    // Update preloaded images for rendering
    const preloads = getPreloadImages();
    setPreloadedImages(preloads);
  }, [currentImage, historyIndex, imageHistory]);

  // Navigate to previous image (swipe down)
  const goToPreviousImage = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevImg = imageHistory[prevIndex];
      setHistoryIndex(prevIndex);
      setCurrentImage(prevImg);
      applyCachedLikeData(prevImg.id, prevImg.is_liked ?? false);
      setIsImageLoading(true);
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



  // Update like status when image changes - debounced
  useEffect(() => {
    if (!currentImage) return;
    
    // Mark this image as viewed
    setViewedImageIds(prev => new Set(prev).add(currentImage.id));
    
    const imageId = currentImage.id;
    
    // Show cached data immediately if available
    const cached = likeDataCacheRef.current.get(imageId);
    if (cached) {
      setLikeCount(cached.likeCount);
      setLikers(cached.likers);
      if (currentUserId) {
        const userLiked = cached.likers.some(l => l.userId === currentUserId);
        if (!likedMapRef.current.has(imageId)) {
          setIsLiked(userLiked);
          likedMapRef.current.set(imageId, userLiked);
        }
      }
    }
    
    // Always fetch fresh data (no debounce - cache handles instant display)
    const abortController = new AbortController();
    fetch(`/api/images/${imageId}/like`, { signal: abortController.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const likeData = {
          likeCount: data.likeCount || 0,
          likers: data.likers || [],
        };
        // Update cache
        likeDataCacheRef.current.set(imageId, likeData);
        setLikeCount(likeData.likeCount);
        setLikers(likeData.likers);
        if (currentUserId && data.likers) {
          const userLiked = data.likers.some((l: LikeInfo) => l.userId === currentUserId);
          setIsLiked(userLiked);
          likedMapRef.current.set(imageId, userLiked);
        }
      })
      .catch(() => {});
    
    // Prefetch like data for upcoming images
    const upcoming = imageHistory.slice(historyIndex + 1, historyIndex + 6).map(img => img.id);
    if (upcoming.length > 0) {
      prefetchLikeData(upcoming);
    }
    
    return () => abortController.abort();
  }, [currentImage, currentUserId]);

  // Handle browser back button / gesture navigation
  useEffect(() => {
    // Add hash to URL when opening (only once)
    window.history.pushState(null, "", "#insta");

    // Listen for back button
    const handlePopState = () => {
      onClose();
    };

    window.addEventListener("popstate", handlePopState);

    // Cleanup: remove listener and reset URL (only on unmount)
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Remove hash from URL without navigating back
      if (window.location.hash === "#insta") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
  }, [onClose]);

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
    
    // Save to local map immediately (optimistic)
    likedMapRef.current.set(currentImage.id, newLikedState);
    
    try {
      const response = await fetch(`/api/images/${currentImage.id}/like`, {
        method: "POST",
      });
      
      if (!response.ok) {
        // Revert on error
        setIsLiked(!newLikedState);
        setLikeCount(prev => newLikedState ? Math.max(0, prev - 1) : prev + 1);
        likedMapRef.current.set(currentImage.id, !newLikedState);
      } else {
        // Refresh like info to get updated likers list
        try {
          const likeInfoResponse = await fetch(`/api/images/${currentImage.id}/like`);
          if (likeInfoResponse.ok) {
            const likeInfo = await likeInfoResponse.json();
            setLikeCount(likeInfo.likeCount || 0);
            setLikers(likeInfo.likers || []);
          }
        } catch {
          // Ignore - optimistic state is fine
        }
      }
    } catch (error) {
      // Revert on error
      setIsLiked(!newLikedState);
      setLikeCount(prev => newLikedState ? Math.max(0, prev - 1) : prev + 1);
      likedMapRef.current.set(currentImage.id, !newLikedState);
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
    
    const currentY = e.touches[0].clientY;
    const deltaY = touchStartRef.current.y - currentY;
    
    // Allow both upward (next) and downward (previous) swipes
    setSlideOffset(-deltaY);
    
    touchEndRef.current = {
      x: e.touches[0].clientX,
      y: currentY,
    };
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current || !touchEndRef.current) {
      setSlideOffset(0);
      return;
    }

    const deltaY = touchStartRef.current.y - touchEndRef.current.y;
    const deltaX = Math.abs(touchEndRef.current.x - touchStartRef.current.x);
    
    // Must be more vertical than horizontal
    if (Math.abs(deltaY) <= deltaX) {
      setSlideOffset(0);
      touchStartRef.current = null;
      touchEndRef.current = null;
      return;
    }
    
    // Swipe up (minimum 80px) - Next image with transition
    if (deltaY > 80) {
      setIsTransitioning(true);
      setSlideOffset(-window.innerHeight);
      setTimeout(() => {
        goToNextImage();
        setSlideOffset(0);
        setIsTransitioning(false);
      }, 200);
    } 
    // Swipe down (minimum 80px) - Previous image with transition
    else if (deltaY < -80 && historyIndex > 0) {
      setIsTransitioning(true);
      setSlideOffset(window.innerHeight);
      setTimeout(() => {
        goToPreviousImage();
        setSlideOffset(0);
        setIsTransitioning(false);
      }, 200);
    }
    // Snap back if swipe was too short
    else {
      setSlideOffset(0);
    }

    touchStartRef.current = null;
    touchEndRef.current = null;
  };

  if (!currentImage) {
    return null;
  }

  const fallback = `https://dummyimage.com/1024x768/1e293b/ffffff&text=${encodeURIComponent(currentImage.filename)}`;
  const timestamp = currentImage.updated_at || currentImage.created_at;
  const previewKey = getImageVariantKey(currentImage.key, 'preview');
  const imageUrl = buildImageUrl(BASE_URL, previewKey, fallback, timestamp);
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
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {/* Loading Spinner */}
        {isImageLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        
        {/* Current Image */}
        <div 
          className="absolute inset-0 w-full h-full"
          style={{
            transform: `translateY(${slideOffset}px)`,
            transition: isTransitioning ? 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          }}
        >
          <Image
            src={imageUrl}
            alt={displayName}
            fill
            className="object-contain"
            sizes="100vw"
            quality={90}
            priority
            onLoad={() => setIsImageLoading(false)}
          />
        </div>

        {/* Preloaded Next 10 Images (stacked below) */}
        {preloadedImages.map((img, index) => {
          const previewKey = getImageVariantKey(img.key, 'preview');
          const timestamp = img.updated_at || img.created_at;
          const url = buildImageUrl(BASE_URL, previewKey, '', timestamp);
          
          return (
            <div 
              key={img.id}
              className="absolute inset-0 w-full h-full"
              style={{
                transform: `translateY(${slideOffset + window.innerHeight * (index + 1)}px)`,
                transition: isTransitioning ? 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
              }}
            >
              <Image
                src={url}
                alt={img.imagename || img.filename}
                fill
                className="object-contain"
                sizes="100vw"
                quality={90}
              />
            </div>
          );
        })}

        {/* Previous Image (preloaded above) */}
        {historyIndex > 0 && imageHistory[historyIndex - 1] && (
          <div 
            className="absolute inset-0 w-full h-full"
            style={{
              transform: `translateY(${slideOffset - window.innerHeight}px)`,
              transition: isTransitioning ? 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
            }}
          >
            <Image
              src={buildImageUrl(
                BASE_URL,
                getImageVariantKey(imageHistory[historyIndex - 1].key, 'preview'),
                '',
                imageHistory[historyIndex - 1].updated_at || imageHistory[historyIndex - 1].created_at
              )}
              alt={imageHistory[historyIndex - 1].imagename || imageHistory[historyIndex - 1].filename}
              fill
              className="object-contain"
              sizes="100vw"
              quality={90}
            />
          </div>
        )}

        {/* Double Tap Heart Animation */}
        {showHeartAnimation && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
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

          {/* Like Count - Clickable */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (likers.length > 0) {
                setShowLikersModal(true);
              }
            }}
            className={cn(
              "text-white font-semibold",
              likers.length > 0 && "hover:text-white/80 transition-colors cursor-pointer"
            )}
          >
            {likeCount} {likeCount === 1 ? "Like" : "Likes"}
          </button>

          {/* Likers Profile Pictures - Right next to likes - Clickable */}
          {likers.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowLikersModal(true);
              }}
              className="flex -space-x-2 hover:scale-105 transition-transform"
            >
              {likers.slice(0, 5).map((liker, index) => {
                const avatarUrl = liker.userImage 
                  ? buildImageUrl(BASE_URL, liker.userImage, liker.userImage)
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
                        sizes="32px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-semibold">
                        {liker.userName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                );
              })}
              {likers.length > 5 && (
                <span className="text-white/70 text-sm ml-2">
                  +{likers.length - 5}
                </span>
              )}
            </button>
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

      {/* Likers Modal */}
      {showLikersModal && likers.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            setShowLikersModal(false);
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />
          
          {/* Modal Content */}
          <div
            className={cn(
              "relative bg-background rounded-t-3xl md:rounded-2xl shadow-xl",
              "w-full md:w-96 max-h-[70vh] md:max-h-[80vh]",
              "animate-in slide-in-from-bottom md:zoom-in-95 duration-300"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-background border-b px-6 py-4 rounded-t-3xl md:rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Likes</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLikersModal(false);
                  }}
                  className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Likers List */}
            <div className="overflow-y-auto max-h-[calc(70vh-4rem)] md:max-h-[calc(80vh-4rem)] p-4">
              <div className="space-y-2">
                {likers.map((liker, index) => {
                  const avatarUrl = liker.userImage 
                    ? buildImageUrl(BASE_URL, liker.userImage, liker.userImage)
                    : null;
                  
                  return (
                    <div
                      key={liker.userId}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors",
                        "animate-in slide-in-from-left duration-300"
                      )}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* Avatar */}
                      <div className="relative w-12 h-12 rounded-full bg-primary/10 overflow-hidden flex-shrink-0">
                        {avatarUrl ? (
                          <Image
                            src={avatarUrl}
                            alt={liker.userName}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-lg font-semibold">
                            {liker.userName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Username */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{liker.userName}</p>
                      </div>

                      {/* Heart Icon */}
                      <Heart className="h-5 w-5 text-red-500 fill-red-500 flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
