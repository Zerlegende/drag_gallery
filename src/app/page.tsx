import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth, isAdminOrModerator } from "@/lib/auth";
import { isMaintenanceMode } from "@/lib/maintenance";
import { getAllTags, getImagesWithTags, getArchives } from "@/lib/db";
import { GalleryShell } from "@/components/gallery/gallery-shell";
import { UploadButtonMounted } from "@/components/gallery/upload-button-mounted";
import { GalleryPageClient } from "@/components/gallery/gallery-page-client";
import { LoadingState } from "@/components/loading-state";
import { ArchiveFolderGrid } from "@/components/gallery/archive-folder-grid";

async function GalleryLoader({ searchParams, role, userId }: { searchParams: Promise<Record<string, string | string[] | undefined>>; role: string; userId?: string }) {
  const params = await searchParams;
  const tagFilter = params.tag;
  const filterTags = Array.isArray(tagFilter)
    ? tagFilter
    : tagFilter
      ? [tagFilter]
      : [];

  const canSeeArchives = isAdminOrModerator(role);

  const [images, tags, archives] = await Promise.all([
    getImagesWithTags(filterTags, userId, null),
    getAllTags(),
    canSeeArchives ? getArchives() : Promise.resolve([]),
  ]);

  return (
    <>
      {canSeeArchives && <ArchiveFolderGrid archives={archives} isAdmin={role === "admin"} />}
      <GalleryShell initialImages={images} allTags={tags} initialFilter={filterTags} />
    </>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const maintenanceActive = await isMaintenanceMode();
  if (maintenanceActive && (session.user as any).role !== "admin") {
    redirect("/maintenance");
  }

  const role = (session.user as any).role ?? "user";

  return (
    <GalleryPageClient>
      <div className="w-full py-6 px-6">
        <div className="mb-6 md:hidden">
          <h1 className="text-2xl font-semibold tracking-tight text-center mb-3">Galerie</h1>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Organisiere deine Bilder mit Tags und Filtern.
          </p>
          <div className="flex justify-center">
            <UploadButtonMounted />
          </div>
        </div>

        <div className="mb-6 hidden md:flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Galerie</h1>
            <p className="text-muted-foreground">
              Organisiere deine Bilder mit Tags, Filtern und Drag & Drop.
            </p>
          </div>
          <UploadButtonMounted />
        </div>

        <Suspense fallback={<LoadingState message="Lade Galerie..." slowLoadThreshold={2000} />}>
          <GalleryLoader searchParams={searchParams} role={role} userId={session.user?.id} />
        </Suspense>
      </div>
    </GalleryPageClient>
  );
}
