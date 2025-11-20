import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// In-memory queue (you could use Redis or a database instead)
type QueueItem = {
  id: string;
  imageId: string;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  createdAt: number;
};

const queue = new Map<string, QueueItem>();
const processingLock = new Set<string>(); // Track which images are being processed

// Cleanup old completed items after 1 hour
function cleanupQueue() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, item] of queue.entries()) {
    if (
      (item.status === "success" || item.status === "error") &&
      item.createdAt < oneHourAgo
    ) {
      queue.delete(id);
    }
  }
}

// GET: Fetch queue for current user
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  cleanupQueue();

  const userQueue = Array.from(queue.values()).filter(
    (item) => item.id.startsWith(session.user.id!)
  );

  return NextResponse.json({ queue: userQueue });
}

// POST: Add items to queue or update status
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { action, imageIds, imageId, status, error } = body;

  if (action === "add" && imageIds) {
    // Add new items to queue
    const newItems: QueueItem[] = [];
    for (const imgId of imageIds) {
      const queueItemId = `${session.user.id}-${imgId}`;
      
      // Skip if already in queue
      if (queue.has(queueItemId)) {
        continue;
      }

      const item: QueueItem = {
        id: queueItemId,
        imageId: imgId,
        status: "pending",
        createdAt: Date.now(),
      };
      queue.set(queueItemId, item);
      newItems.push(item);
    }
    return NextResponse.json({ added: newItems });
  }

  if (action === "update" && imageId) {
    // Update status of an item
    const queueItemId = `${session.user.id}-${imageId}`;
    const item = queue.get(queueItemId);
    
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Check for concurrent processing
    if (status === "processing") {
      if (processingLock.has(imageId)) {
        return NextResponse.json(
          { error: "Already processing" },
          { status: 409 }
        );
      }
      processingLock.add(imageId);
    } else if (item.status === "processing") {
      processingLock.delete(imageId);
    }

    item.status = status;
    if (error) item.error = error;
    
    queue.set(queueItemId, item);
    return NextResponse.json({ item });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// DELETE: Clear queue for current user
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const itemsToDelete = Array.from(queue.keys()).filter((key) =>
    key.startsWith(session.user.id!)
  );
  
  for (const key of itemsToDelete) {
    const item = queue.get(key);
    if (item) {
      processingLock.delete(item.imageId);
    }
    queue.delete(key);
  }

  return NextResponse.json({ deleted: itemsToDelete.length });
}
