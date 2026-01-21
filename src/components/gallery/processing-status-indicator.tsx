"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react";

type ProcessingImage = {
  id: string;
  filename: string;
  key: string;
  variant_status: string;
  created_at: string;
};

type ProcessingStatus = {
  images: ProcessingImage[];
  queue: {
    queueLength: number;
    processing: number;
    maxConcurrent: number;
  };
  total: number;
  pending: number;
  processing: number;
};

export function ProcessingStatusIndicator() {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/images/processing-status');
        if (response.ok) {
          const data: ProcessingStatus = await response.json();
          setStatus(data);
          
          // Show indicator if there are images being processed
          setIsVisible(data.total > 0);

          // Stop polling if no more images to process
          if (data.total === 0 && interval) {
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error('Failed to fetch processing status:', error);
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 2 seconds when visible
    interval = setInterval(fetchStatus, 2000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  if (!isVisible || !status || status.total === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-card border border-border rounded-lg shadow-lg p-4 max-w-sm z-50">
      <div className="flex items-center gap-3 mb-3">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Bilder werden verarbeitet</h3>
          <p className="text-xs text-muted-foreground">
            {status.processing} aktiv · {status.pending} in Warteschlange
          </p>
        </div>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {status.images.slice(0, 10).map((image) => (
          <div
            key={image.id}
            className="flex items-center gap-2 text-xs p-2 bg-secondary/20 rounded"
          >
            {image.variant_status === 'processing' ? (
              <Loader2 className="h-3 w-3 animate-spin text-blue-500 flex-shrink-0" />
            ) : image.variant_status === 'pending' ? (
              <Clock className="h-3 w-3 text-gray-400 flex-shrink-0" />
            ) : image.variant_status === 'failed' ? (
              <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
            ) : (
              <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
            )}
            <span className="truncate flex-1">{image.filename}</span>
          </div>
        ))}
        {status.images.length > 10 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{status.images.length - 10} weitere
          </p>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {status.queue.processing}/{status.queue.maxConcurrent} Slots aktiv
          </span>
          <span>{status.total} gesamt</span>
        </div>
      </div>
    </div>
  );
}
