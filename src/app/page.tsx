import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getAllTags, getImagesWithTags } from "@/lib/db";
import { GalleryShell } from "@/components/gallery/gallery-shell";
import { UploadButton } from "@/components/gallery/upload-button";
import { GalleryPageClient } from "@/components/gallery/gallery-page-client";

async function GalleryLoader({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const tagFilter = searchParams.tag;
  const filterTags = Array.isArray(tagFilter)
    ? tagFilter
    : tagFilter
      ? [tagFilter]
      : [];

  const [images, tags] = await Promise.all([
    getImagesWithTags(filterTags),
    getAllTags(),
  ]);

  return <GalleryShell initialImages={images} allTags={tags} initialFilter={filterTags} />;
}

export default async function Home({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // Auth Check - redirect zu Login wenn nicht eingeloggt
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  return (
    <GalleryPageClient>
      <div className="w-full py-6 px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Galerie</h1>
            <p className="text-muted-foreground">Organisiere deine Bilder mit Tags, Filtern und Drag & Drop.</p>
          </div>
          <UploadButton />
        </div>
        <Suspense fallback={<div className="text-muted-foreground">Lade Bilder...</div>}>
          <GalleryLoader searchParams={searchParams} />
        </Suspense>
      </div>
    </GalleryPageClient>
  );
}
