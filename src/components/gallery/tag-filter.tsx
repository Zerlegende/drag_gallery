"use client";

import { useEffect, useState } from "react";
import { Search, Grid2x2, Grid3x3, LayoutGrid, ArrowUpDown } from "lucide-react";

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
export type SortOption = "none" | "date-desc" | "date-asc" | "name-asc" | "name-desc";

export type TagFilterProps = {
  tags: TagRecord[];
  activeTagIds: string[];
  onToggle: (tagId: string) => void;
  onSearchChange: (term: string) => void;
  imageSize?: ImageSize;
  onImageSizeChange?: (size: ImageSize) => void;
  imagesPerPage?: number;
  onImagesPerPageChange?: (count: number) => void;
  sortOption?: SortOption;
  onSortChange?: (sort: SortOption) => void;
  onSelectAll?: () => void;
  hasSelection?: boolean;
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
  sortOption = "date-desc",
  onSortChange,
  onSelectAll,
  hasSelection = false,
}: TagFilterProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    onSearchChange(searchTerm);
  }, [onSearchChange, searchTerm]);

  const filteredTags = tags.filter((tag) => tag.name.toLowerCase().includes(searchTerm.toLowerCase()));
  
  // Bestimme wie viele Tags initial angezeigt werden
  const initialTagCount = isMobile ? 5 : 10;
  const displayedTags = showAllTags || searchTerm.length > 0 
    ? filteredTags 
    : filteredTags.slice(0, initialTagCount);
  const hasHiddenTags = filteredTags.length > initialTagCount && searchTerm.length === 0;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Input
            placeholder="Nach Titeln, Namen oder Tags suchen..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="pl-9"
          />
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {onSelectAll && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={hasSelection ? "default" : "outline"}
                  size="sm"
                  onClick={onSelectAll}
                  className="h-9 whitespace-nowrap"
                >
                  Alles auswählen
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Alle sichtbaren Bilder auswählen</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {onImageSizeChange && (
          <TooltipProvider delayDuration={0}>
            <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-background">
              {/* Mobile: Nur 2 Optionen (small & large) */}
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
                  <p className="md:hidden">Klein</p>
                  <p className="hidden md:block">Kleine Kacheln (6 pro Reihe)</p>
                </TooltipContent>
              </Tooltip>
              
              {/* Medium: Nur auf Desktop sichtbar */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={imageSize === "medium" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => onImageSizeChange("medium")}
                    className="h-8 px-2 hidden md:inline-flex"
                  >
                    <Grid2x2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Mittlere Kacheln (4 pro Reihe)</p>
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
                  <p className="md:hidden">Groß</p>
                  <p className="hidden md:block">Große Ansicht (1 pro Reihe)</p>
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
        {onSortChange && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <select
                  value={sortOption}
                  onChange={(e) => onSortChange(e.target.value as SortOption)}
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="none">Keine Sortierung</option>
                  <option value="date-desc">📅 Neueste zuerst</option>
                  <option value="date-asc">📅 Älteste zuerst</option>
                  <option value="name-asc">🔤 A → Z</option>
                  <option value="name-desc">🔤 Z → A</option>
                </select>
              </TooltipTrigger>
              <TooltipContent>
                <p>Sortierung</p>
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
          <>
            {displayedTags.map((tag) => {
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
            })}
            
            {/* Mehr/Weniger anzeigen Button */}
            {hasHiddenTags && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllTags(!showAllTags)}
                className="text-muted-foreground hover:text-foreground"
              >
                {showAllTags ? (
                  <>
                    Weniger anzeigen ({filteredTags.length - initialTagCount} ausgeblendet)
                  </>
                ) : (
                  <>
                    + {filteredTags.length - initialTagCount} weitere Tags
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
