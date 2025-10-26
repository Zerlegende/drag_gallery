import { Suspense } from "react";

import { getAllTags, getImagesWithTags } from "@/lib/db";
import { GalleryShell } from "@/components/gallery/gallery-shell";

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

export default function Home({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return (
    <div className="container py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Galerie</h1>
          <p className="text-muted-foreground">Organisiere deine Bilder mit Tags, Filtern und Drag & Drop.</p>
        </div>
      </div>
      <Suspense fallback={<div className="text-muted-foreground">Lade Bilder...</div>}>
        {/* @ts-expect-error Async Server Component */}
        <GalleryLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
