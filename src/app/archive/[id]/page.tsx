import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth, isAdminOrModerator } from "@/lib/auth";
import { isMaintenanceMode } from "@/lib/maintenance";
import { getAllTags, getImagesWithTags, getArchiveById } from "@/lib/db";
import { GalleryShell } from "@/components/gallery/gallery-shell";
import { UploadButtonMounted } from "@/components/gallery/upload-button-mounted";
import { GalleryPageClient } from "@/components/gallery/gallery-page-client";
import { LoadingState } from "@/components/loading-state";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function ArchiveGalleryLoader({ archiveId, searchParams, userId }: { archiveId: string; searchParams: Record<string, string | string[] | undefined>; userId?: string }) {
  const tagFilter = searchParams.tag;
  const filterTags = Array.isArray(tagFilter)
    ? tagFilter
    : tagFilter
      ? [tagFilter]
      : [];

  const [images, tags] = await Promise.all([
    getImagesWithTags(filterTags, userId, archiveId),
    getAllTags(),
  ]);

  return <GalleryShell initialImages={images} allTags={tags} initialFilter={filterTags} archiveId={archiveId} />;
}

export default async function ArchivePage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/auth/sign-in");

  const maintenanceActive = await isMaintenanceMode();
  if (maintenanceActive && (session.user as any).role !== "admin") {
    redirect("/maintenance");
  }

  const { id } = await params;
  const archive = await getArchiveById(id);
  if (!archive) notFound();

  const resolvedSearchParams = await searchParams;

  return (
    <GalleryPageClient>
      <div className="w-full py-6 px-6">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Galerie
          </Link>

          {/* Mobile */}
          <div className="md:hidden">
            <h1 className="text-2xl font-semibold tracking-tight text-center mb-1">{archive.name}</h1>
            <p className="text-sm text-muted-foreground text-center mb-4">
              {archive.image_count ?? 0} Bild{(archive.image_count ?? 0) !== 1 ? "er" : ""} in diesem Archiv
            </p>
            <div className="flex justify-center">
              <UploadButtonMounted />
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden md:flex items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{archive.name}</h1>
              <p className="text-muted-foreground">
                {archive.image_count ?? 0} Bild{(archive.image_count ?? 0) !== 1 ? "er" : ""} in diesem Archiv
              </p>
            </div>
            <UploadButtonMounted />
          </div>
        </div>

        <Suspense fallback={<LoadingState message="Lade Archiv..." slowLoadThreshold={2000} />}>
          <ArchiveGalleryLoader
            archiveId={id}
            searchParams={resolvedSearchParams}
            userId={session.user?.id}
          />
        </Suspense>
      </div>
    </GalleryPageClient>
  );
}
