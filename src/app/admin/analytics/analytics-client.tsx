"use client";

import { useState } from "react";
import Image from "next/image";
import { Heart, Upload, ImageIcon, Users, HardDrive, TrendingUp, Clock, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { buildImageUrl, getImageVariantKey } from "@/lib/image-variants-utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type {
  UserUploadStats,
  UserLikeStats,
  RecentLike,
  TopLikedImage,
} from "./page";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

type Tab = "overview" | "likes" | "uploads";

type AnalyticsData = {
  uploadStats: UserUploadStats[];
  likeStats: UserLikeStats[];
  recentLikes: RecentLike[];
  topLikedImages: TopLikedImage[];
  totalImages: number;
  totalLikes: number;
  totalUsers: number;
  totalSize: number;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Gerade eben";
  if (diffMin < 60) return `vor ${diffMin}m`;
  if (diffHrs < 24) return `vor ${diffHrs}h`;
  if (diffDays < 7) return `vor ${diffDays}d`;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function UserAvatar({
  avatar,
  username,
  size = 40,
}: {
  avatar: string | null;
  username: string;
  size?: number;
}) {
  if (avatar) {
    const avatarUrl = buildImageUrl(BASE_URL, avatar, avatar);
    return (
      <div
        className="relative rounded-full overflow-hidden bg-muted flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src={avatarUrl}
          alt={username}
          fill
          className="object-cover"
          sizes={`${size}px`}
        />
      </div>
    );
  }
  return (
    <div
      className="rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {username.charAt(0).toUpperCase()}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-4">
      <div className="rounded-lg bg-primary/10 p-2.5">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export function AnalyticsClient({ data }: { data: AnalyticsData }) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedImage, setSelectedImage] = useState<TopLikedImage | null>(null);
  const [previewLiked, setPreviewLiked] = useState(false);
  const [previewLikeCount, setPreviewLikeCount] = useState(0);
  const [isLiking, setIsLiking] = useState(false);

  const openImagePreview = async (img: TopLikedImage) => {
    setSelectedImage(img);
    setPreviewLikeCount(img.likeCount);
    setPreviewLiked(false);
    // Fetch current user's like status
    try {
      const res = await fetch(`/api/images/${img.id}/like`);
      if (res.ok) {
        const info = await res.json();
        setPreviewLikeCount(info.likeCount || img.likeCount);
        // Check if current user liked it (via session)
        setPreviewLiked(info.isLiked ?? false);
      }
    } catch {}
  };

  const handlePreviewLike = async () => {
    if (!selectedImage || isLiking) return;
    setIsLiking(true);
    const newLiked = !previewLiked;
    setPreviewLiked(newLiked);
    setPreviewLikeCount(prev => newLiked ? prev + 1 : Math.max(0, prev - 1));
    try {
      const res = await fetch(`/api/images/${selectedImage.id}/like`, { method: "POST" });
      if (!res.ok) {
        setPreviewLiked(!newLiked);
        setPreviewLikeCount(prev => newLiked ? Math.max(0, prev - 1) : prev + 1);
      }
    } catch {
      setPreviewLiked(!newLiked);
      setPreviewLikeCount(prev => newLiked ? Math.max(0, prev - 1) : prev + 1);
    } finally {
      setIsLiking(false);
    }
  };

  const handlePreviewDownload = async () => {
    if (!selectedImage) return;
    try {
      const imageUrl = `${BASE_URL}/${selectedImage.imageKey}`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = selectedImage.imageName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Übersicht", icon: TrendingUp },
    { id: "likes", label: "Likes", icon: Heart },
    { id: "uploads", label: "Uploads", icon: Upload },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={ImageIcon}
              label="Bilder"
              value={data.totalImages}
            />
            <StatCard
              icon={Heart}
              label="Likes"
              value={data.totalLikes}
            />
            <StatCard
              icon={Users}
              label="Nutzer"
              value={data.totalUsers}
            />
            <StatCard
              icon={HardDrive}
              label="Speicher"
              value={formatBytes(data.totalSize)}
            />
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Liked Images */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Heart className="h-4 w-4 text-red-500" />
                Beliebteste Bilder
              </h3>
              <div className="space-y-3">
                {data.topLikedImages.slice(0, 10).map((img, idx) => {
                  const gridKey = getImageVariantKey(img.imageKey, "grid");
                  const imageUrl = buildImageUrl(
                    BASE_URL,
                    gridKey,
                    `https://dummyimage.com/80x80/1e293b/ffffff&text=${idx + 1}`
                  );
                  return (
                    <button
                      key={img.id}
                      onClick={() => openImagePreview(img)}
                      className="flex items-center gap-3 group w-full text-left hover:bg-muted/50 rounded-lg p-1.5 -mx-1.5 transition-colors"
                    >
                      <span className="text-sm text-muted-foreground w-5 text-right font-mono">
                        {idx + 1}
                      </span>
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        <Image
                          src={imageUrl}
                          alt={img.imageName}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {img.imageName}
                        </p>
                        {img.uploaderName && (
                          <p className="text-xs text-muted-foreground">
                            von {img.uploaderName}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <Heart className="h-3.5 w-3.5 text-red-500 fill-red-500" />
                        <span className="font-medium">{img.likeCount}</span>
                      </div>
                    </button>
                  );
                })}
                {data.topLikedImages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Noch keine Likes vorhanden
                  </p>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Letzte Likes
              </h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {data.recentLikes.slice(0, 20).map((like) => {
                  const gridKey = getImageVariantKey(like.imageKey, "grid");
                  const imageUrl = buildImageUrl(BASE_URL, gridKey, "");
                  return (
                    <div
                      key={like.id}
                      className="flex items-center gap-3"
                    >
                      <UserAvatar
                        avatar={like.userAvatar}
                        username={like.username}
                        size={32}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{like.username}</span>
                          {" "}hat{" "}
                          <span className="font-medium truncate">
                            {like.imageName}
                          </span>
                          {" "}geliked
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimeAgo(like.likedAt)}
                        </p>
                      </div>
                      <div className="relative w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0">
                        <Image
                          src={imageUrl}
                          alt={like.imageName}
                          fill
                          className="object-cover"
                          sizes="32px"
                        />
                      </div>
                    </div>
                  );
                })}
                {data.recentLikes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Noch keine Likes vorhanden
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Likes Tab */}
      {activeTab === "likes" && (
        <div className="space-y-6">
          {/* User Like Rankings */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold">Like-Statistiken pro Nutzer</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Wer hat wie viele Likes vergeben und erhalten
              </p>
            </div>
            <div className="divide-y divide-border">
              {data.likeStats.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                >
                  <UserAvatar
                    avatar={user.avatar}
                    username={user.username}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{user.username}</p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="font-bold text-lg">{user.likesGiven}</p>
                      <p className="text-xs text-muted-foreground">Vergeben</p>
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-lg text-red-500">
                        {user.likesReceived}
                      </p>
                      <p className="text-xs text-muted-foreground">Erhalten</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* All Recent Likes */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold">Alle letzten Likes</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Die letzten 50 Like-Aktionen
              </p>
            </div>
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
              {data.recentLikes.map((like) => {
                const gridKey = getImageVariantKey(like.imageKey, "grid");
                const imageUrl = buildImageUrl(BASE_URL, gridKey, "");
                return (
                  <div
                    key={like.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <UserAvatar
                      avatar={like.userAvatar}
                      username={like.username}
                      size={36}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{like.username}</span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="font-medium">{like.imageName}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeAgo(like.likedAt)}
                      </p>
                    </div>
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      <Image
                        src={imageUrl}
                        alt={like.imageName}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Uploads Tab */}
      {activeTab === "uploads" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold">Upload-Statistiken pro Nutzer</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Wer hat wie viele Bilder hochgeladen
              </p>
            </div>
            <div className="divide-y divide-border">
              {data.uploadStats.map((user) => {
                const maxUploads = Math.max(
                  ...data.uploadStats.map((u) => u.uploadCount),
                  1
                );
                const percentage = (user.uploadCount / maxUploads) * 100;
                return (
                  <div
                    key={user.id}
                    className="px-5 py-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-4 mb-2">
                      <UserAvatar
                        avatar={user.avatar}
                        username={user.username}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{user.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.lastUpload
                            ? `Letzter Upload: ${formatTimeAgo(user.lastUpload)}`
                            : "Noch keine Uploads"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">
                          {user.uploadCount}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(user.totalSize)}
                        </p>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden ml-14">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-background border-border">
          {selectedImage && (() => {
            const previewKey = getImageVariantKey(selectedImage.imageKey, "preview");
            const previewUrl = buildImageUrl(BASE_URL, previewKey, "");
            return (
              <>
                {/* Image */}
                <div className="relative w-full aspect-[4/3] bg-black">
                  <Image
                    src={previewUrl}
                    alt={selectedImage.imageName}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 768px"
                    quality={90}
                    priority
                  />
                </div>

                {/* Info + Actions */}
                <div className="p-4 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{selectedImage.imageName}</h3>
                    {selectedImage.uploaderName && (
                      <p className="text-sm text-muted-foreground">
                        von {selectedImage.uploaderName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    {/* Like Button */}
                    <button
                      onClick={handlePreviewLike}
                      disabled={isLiking}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all active:scale-95",
                        previewLiked
                          ? "bg-red-500/10 text-red-500"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-red-500"
                      )}
                    >
                      <Heart className={cn("h-5 w-5", previewLiked && "fill-red-500")} />
                      <span className="text-sm font-medium">{previewLikeCount}</span>
                    </button>

                    {/* Download Button */}
                    <button
                      onClick={handlePreviewDownload}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-primary transition-all active:scale-95"
                    >
                      <Download className="h-5 w-5" />
                      <span className="text-sm font-medium">Download</span>
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
