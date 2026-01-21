import { getImageById } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ImageVariantsPage from "./variants-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  
  // Nur Admins dürfen Varianten verwalten
  if (!session?.user || session.user.role !== 'admin') {
    redirect("/");
  }

  const { id } = await params;
  const image = await getImageById(id);

  if (!image) {
    notFound();
  }

  return (
    <ImageVariantsPage
      imageId={image.id}
      imageKey={image.key}
      imageName={image.imagename || image.filename}
      updatedAt={image.updated_at || image.created_at}
    />
  );
}
