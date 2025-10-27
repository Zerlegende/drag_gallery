"use client";

import { useEffect, useState } from "react";
import { Search, Grid2x2, Grid3x3, LayoutGrid } from "lucide-react";

import type { TagRecord } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ImageSize = "small" | "medium" | "large";

export type TagFilterProps = {
  tags: TagRecord[];
  activeTagIds: string[];
  onToggle: (tagId: string) => void;
  onSearchChange: (term: string) => void;
  imageSize?: ImageSize;
  onImageSizeChange?: (size: ImageSize) => void;
  imagesPerPage?: number;
  onImagesPerPageChange?: (count: number) => void;
};

export function TagFilter({ 
  tags, 
  activeTagIds, 
  onToggle, 
  onSearchChange,
  imageSize = "medium",
  onImageSizeChange,
  imagesPerPage = 50,
  onImagesPerPageChange,
}: TagFilterProps) {
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    onSearchChange(searchTerm);
  }, [onSearchChange, searchTerm]);

  const filteredTags = tags.filter((tag) => tag.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            placeholder="Nach Titeln, Namen oder Tags suchen..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="pl-9"
          />
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {onImageSizeChange && (
          <TooltipProvider delayDuration={0}>
            <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-background">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={imageSize === "small" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => onImageSizeChange("small")}
                    className="h-8 px-2"
                  >
                    <Grid3x3 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Kleine Bilder (mehr anzeigen)</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={imageSize === "medium" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => onImageSizeChange("medium")}
                    className="h-8 px-2"
                  >
                    <Grid2x2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Mittelgroße Bilder (Standard)</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={imageSize === "large" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => onImageSizeChange("large")}
                    className="h-8 px-2"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Große Bilder (weniger anzeigen)</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )}
        {onImagesPerPageChange && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <select
                  value={imagesPerPage}
                  onChange={(e) => onImagesPerPageChange(Number(e.target.value))}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={10}>10 Bilder</option>
                  <option value={25}>25 Bilder</option>
                  <option value={50}>50 Bilder</option>
                  <option value={100}>100 Bilder</option>
                </select>
              </TooltipTrigger>
              <TooltipContent>
                <p>Anzahl Bilder pro Seite</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Special "Ohne Tag" button */}
        <Button
          variant={activeTagIds.includes("__NO_TAG__") ? "default" : "outline"}
          size="sm"
          onClick={() => onToggle("__NO_TAG__")}
          className={activeTagIds.includes("__NO_TAG__") ? "" : "text-muted-foreground"}
        >
          Ohne Tag
        </Button>
        
        {filteredTags.length === 0 ? (
          <span className="text-xs text-muted-foreground">Keine Tags vorhanden.</span>
        ) : (
          filteredTags.map((tag) => {
            const isActive = activeTagIds.includes(tag.id);
            return (
              <Button
                key={tag.id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onToggle(tag.id)}
              >
                #{tag.name}
              </Button>
            );
          })
        )}
      </div>
    </div>
  );
}
