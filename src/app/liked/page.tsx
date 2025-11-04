import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { query, getAllTags } from "@/lib/db";
import type { ImageRecord } from "@/lib/db";
import { LikedGalleryView } from "@/components/gallery/liked-gallery-view";
import { LoadingState } from "@/components/loading-state";
import { Heart } from "lucide-react";

// Funktion zum Laden der gelikten Bilder eines Users
async function getLikedImages(userId: string) {
  const sql = `
    SELECT i.*,
    COALESCE(
      json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name))
      FILTER (WHERE t.id IS NOT NULL), '[]'
    ) AS tags,
    COUNT(DISTINCT l2.id) AS liked_count,
    true AS is_liked,
    MAX(l.created_at) AS liked_at
    FROM images i
    INNER JOIN likes l ON l.image_id = i.id AND l.user_id = $1
    LEFT JOIN image_tags it ON it.image_id = i.id
    LEFT JOIN tags t ON t.id = it.tag_id
    LEFT JOIN likes l2 ON l2.image_id = i.id
    GROUP BY i.id
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

  return (
    <div className="w-full py-6 px-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Heart className="h-8 w-8 text-red-500 fill-red-500" />
          <h1 className="text-3xl font-semibold tracking-tight">Gelikte Bilder</h1>
        </div>
        <p className="text-muted-foreground">Deine mit Herz markierten Favoriten.</p>
      </div>
      <Suspense fallback={<LoadingState message="Lade gelikte Bilder..." slowLoadThreshold={2000} />}>
        <LikedGalleryLoader />
      </Suspense>
    </div>
  );
}
