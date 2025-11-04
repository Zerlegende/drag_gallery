"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  slowLoadThreshold?: number; // Zeit in ms nach der die "slow load" Nachricht erscheint
}

/**
 * Loading-Komponente die nach einer gewissen Zeit einen Hinweis zeigt,
 * dass Services gerade hochfahren (Railway Serverless Cold Start)
 */
export function LoadingState({ 
  message = "Lade Daten...", 
  slowLoadThreshold = 3000 
}: LoadingStateProps) {
  const [showSlowLoadMessage, setShowSlowLoadMessage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSlowLoadMessage(true);
    }, slowLoadThreshold);

    return () => clearTimeout(timer);
  }, [slowLoadThreshold]);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
      <p className="text-muted-foreground text-center">{message}</p>
      
      {showSlowLoadMessage && (
        <div className="mt-4 max-w-md">
          <p className="text-sm text-muted-foreground text-center animate-in fade-in duration-500">
            Die Services fahren gerade hoch... Das kann beim ersten Aufruf bis zu 10 Sekunden dauern.
          </p>
        </div>
      )}
    </div>
  );
}
