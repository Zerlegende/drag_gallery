import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { AnalyticsClient } from "./analytics-client";

// Types for analytics data
export type UserUploadStats = {
  id: string;
  username: string;
  avatar: string | null;
  uploadCount: number;
  totalSize: number;
  lastUpload: string | null;
};

export type UserLikeStats = {
  id: string;
  username: string;
  avatar: string | null;
  likesGiven: number;
  likesReceived: number;
};

export type RecentLike = {
  id: string;
  userId: string;
  username: string;
  userAvatar: string | null;
  imageId: string;
  imageName: string;
  imageKey: string;
  likedAt: string;
};

export type TopLikedImage = {
  id: string;
  imageName: string;
  imageKey: string;
  likeCount: number;
  uploadedBy: string | null;
  uploaderName: string | null;
};

export default async function AnalyticsPage() {
  const session = await auth();

  if (!session?.user || (session.user as any).role !== "admin") {
    redirect("/");
  }

  // All queries in parallel
  const [uploadStats, likeStats, recentLikes, topLikedImages, totalStats] =
    await Promise.all([
      // Upload stats per user
      query<{
        id: string;
        username: string;
        avatar: string | null;
        upload_count: string;
        total_size: string;
        last_upload: string | null;
      }>(
        `SELECT 
          u.id, u.username, u.avatar,
          COUNT(i.id)::text AS upload_count,
          COALESCE(SUM(i.size), 0)::text AS total_size,
          MAX(i.created_at)::text AS last_upload
        FROM users u
        LEFT JOIN images i ON i.uploaded_by = u.id
        GROUP BY u.id, u.username, u.avatar
        ORDER BY COUNT(i.id) DESC`
      ),

      // Like stats per user
      query<{
        id: string;
        username: string;
        avatar: string | null;
        likes_given: string;
        likes_received: string;
      }>(
        `SELECT 
          u.id, u.username, u.avatar,
          COALESCE(given.cnt, 0)::text AS likes_given,
          COALESCE(received.cnt, 0)::text AS likes_received
        FROM users u
        LEFT JOIN (
          SELECT user_id, COUNT(*)::int AS cnt FROM likes GROUP BY user_id
        ) given ON given.user_id::uuid = u.id
        LEFT JOIN (
          SELECT i.uploaded_by, COUNT(*)::int AS cnt 
          FROM likes l JOIN images i ON l.image_id = i.id 
          WHERE i.uploaded_by IS NOT NULL
          GROUP BY i.uploaded_by
        ) received ON received.uploaded_by = u.id
        ORDER BY COALESCE(given.cnt, 0) DESC`
      ),

      // Recent likes (last 50)
      query<{
        id: string;
        user_id: string;
        username: string;
        user_avatar: string | null;
        image_id: string;
        image_name: string;
        image_key: string;
        liked_at: string;
      }>(
        `SELECT 
          l.id, l.user_id, u.username, u.avatar AS user_avatar,
          l.image_id, COALESCE(i.imagename, i.filename) AS image_name, i.key AS image_key,
          l.created_at::text AS liked_at
        FROM likes l
        JOIN users u ON l.user_id::uuid = u.id
        JOIN images i ON l.image_id = i.id
        ORDER BY l.created_at DESC
        LIMIT 50`
      ),

      // Top liked images
      query<{
        id: string;
        image_name: string;
        image_key: string;
        like_count: string;
        uploaded_by: string | null;
        uploader_name: string | null;
      }>(
        `SELECT 
          i.id, COALESCE(i.imagename, i.filename) AS image_name, i.key AS image_key,
          COUNT(l.id)::text AS like_count,
          i.uploaded_by, u.username AS uploader_name
        FROM images i
        JOIN likes l ON l.image_id = i.id
        LEFT JOIN users u ON i.uploaded_by = u.id
        GROUP BY i.id, i.imagename, i.filename, i.key, i.uploaded_by, u.username
        ORDER BY COUNT(l.id) DESC
        LIMIT 20`
      ),

      // Total stats
      query<{
        total_images: string;
        total_likes: string;
        total_users: string;
        total_size: string;
      }>(
        `SELECT 
          (SELECT COUNT(*)::text FROM images) AS total_images,
          (SELECT COUNT(*)::text FROM likes) AS total_likes,
          (SELECT COUNT(*)::text FROM users) AS total_users,
          (SELECT COALESCE(SUM(size), 0)::text FROM images) AS total_size`
      ),
    ]);

  const data = {
    uploadStats: uploadStats.map((u) => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      uploadCount: parseInt(u.upload_count),
      totalSize: parseInt(u.total_size),
      lastUpload: u.last_upload,
    })),
    likeStats: likeStats.map((u) => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      likesGiven: parseInt(u.likes_given),
      likesReceived: parseInt(u.likes_received),
    })),
    recentLikes: recentLikes.map((l) => ({
      id: l.id,
      userId: l.user_id,
      username: l.username,
      userAvatar: l.user_avatar,
      imageId: l.image_id,
      imageName: l.image_name,
      imageKey: l.image_key,
      likedAt: l.liked_at,
    })),
    topLikedImages: topLikedImages.map((i) => ({
      id: i.id,
      imageName: i.image_name,
      imageKey: i.image_key,
      likeCount: parseInt(i.like_count),
      uploadedBy: i.uploaded_by,
      uploaderName: i.uploader_name,
    })),
    totalImages: parseInt(totalStats[0]?.total_images || "0"),
    totalLikes: parseInt(totalStats[0]?.total_likes || "0"),
    totalUsers: parseInt(totalStats[0]?.total_users || "0"),
    totalSize: parseInt(totalStats[0]?.total_size || "0"),
  };

  return (
    <div className="w-full py-6 px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-center md:text-left">
          Analytics
        </h1>
        <p className="text-muted-foreground mt-2 text-center md:text-left">
          Übersicht über Uploads, Likes und Nutzeraktivität
        </p>
      </div>
      <AnalyticsClient data={data} />
    </div>
  );
}
