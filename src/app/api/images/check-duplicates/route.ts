import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkImageExists } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { files } = await request.json();
    
    if (!Array.isArray(files)) {
      return new NextResponse("Invalid request", { status: 400 });
    }

    // Prüfe jede Datei
    const results = await Promise.all(
      files.map(async (file: { filename: string; size: number }) => {
        const exists = await checkImageExists(file.filename, file.size);
        return {
          filename: file.filename,
          exists,
        };
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Check duplicates error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
