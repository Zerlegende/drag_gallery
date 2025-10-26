"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import type { TagRecord } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type TagFilterProps = {
  tags: TagRecord[];
  activeTagIds: string[];
  onToggle: (tagId: string) => void;
  onSearchChange: (term: string) => void;
};

export function TagFilter({ tags, activeTagIds, onToggle, onSearchChange }: TagFilterProps) {
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    onSearchChange(searchTerm);
  }, [onSearchChange, searchTerm]);

  const filteredTags = tags.filter((tag) => tag.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <div className="relative">
        <Input
          placeholder="In Titeln suchen..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="pl-9"
        />
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      <div className="flex flex-wrap gap-2">
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
      {activeTagIds.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Aktiv</span>
          {activeTagIds.map((tagId) => {
            const tag = tags.find((item) => item.id === tagId);
            if (!tag) return null;
            return (
              <Badge key={tag.id} onClick={() => onToggle(tag.id)} className="cursor-pointer">
                {tag.name}
              </Badge>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
