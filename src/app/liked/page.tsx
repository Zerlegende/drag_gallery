import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { isMaintenanceMode } from "@/lib/maintenance";
import { query, getAllTags } from "@/lib/db";
import type { ImageRecord } from "@/lib/db";
import { LikedGalleryView } from "@/components/gallery/liked-gallery-view";
import { LoadingState } from "@/components/loading-state";
import { Heart } from "lucide-react";

// Funktion zum Laden der gelikten Bilder eines Users
async function getLikedImages(userId: string) {
  // Tags und Like-Zähler als LATERAL-Subqueries: als Joins mit GROUP BY ergab
  // das pro Bild ein Kreuzprodukt aus Tags x Likes.
  const sql = `
    SELECT i.*,
    COALESCE(tag_agg.tags, '[]'::json) AS tags,
    COALESCE(like_agg.liked_count, 0) AS liked_count,
    true AS is_liked,
    l.created_at AS liked_at
    FROM images i
    INNER JOIN likes l ON l.image_id = i.id AND l.user_id = $1
    LEFT JOIN LATERAL (
      SELECT json_agg(jsonb_build_object('id', t.id, 'name', t.name) ORDER BY t.name) AS tags
      FROM image_tags it
      JOIN tags t ON t.id = it.tag_id
      WHERE it.image_id = i.id
    ) tag_agg ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS liked_count
      FROM likes l2
      WHERE l2.image_id = i.id
    ) like_agg ON TRUE
    ORDER BY liked_at DESC
  `;

  const rows = await query<{ tags: string; liked_count?: string; is_liked?: boolean; liked_at?: string } & ImageRecord>(sql, [userId]);

  return rows.map((row) => {
    const tags = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags;
    return {
      ...row,
      tags: Array.isArray(tags) ? tags : [],
    };
  });
}

async function LikedGalleryLoader() {
  const session = await auth();
  
  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const [images, tags] = await Promise.all([
    getLikedImages(session.user.id),
    getAllTags(),
  ]);

  return <LikedGalleryView images={images} availableTags={tags} />;
}

export default async function LikedPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  // Wartungsmodus Check - normale User zur Wartungsseite
  const maintenanceActive = await isMaintenanceMode();
  if (maintenanceActive && (session.user as any).role !== "admin") {
    redirect("/maintenance");
  }

  return (
    <div className="w-full py-6 px-6">
      <div className="mb-6">
        <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
          <Heart className="h-8 w-8 text-red-500 fill-red-500" />
          <h1 className="text-3xl font-semibold tracking-tight">Gelikte Bilder</h1>
        </div>
        <p className="text-muted-foreground text-center md:text-left">Deine mit Herz markierten Favoriten.</p>
      </div>
      <Suspense fallback={<LoadingState message="Lade gelikte Bilder..." slowLoadThreshold={2000} />}>
        <LikedGalleryLoader />
      </Suspense>
    </div>
  );
}
