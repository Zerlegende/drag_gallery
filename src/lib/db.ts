import { Pool } from "pg";
import type { PoolClient, QueryResultRow } from "pg";

import { env } from "@/lib/env";
import { withDatabaseRetry } from "@/lib/retry";

const pool = new Pool({
  connectionString: env.server().DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export type ImageRecord = {
  id: string;
  filename: string;
  imagename: string | null;
  key: string;
  mime: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at?: string;
  position: number;
  liked_count?: number; // Count of likes (from JOIN)
  is_liked?: boolean;   // Whether current user liked it (from JOIN)
};

export type LikeRecord = {
  id: string;
  user_id: string;
  image_id: string;
  created_at: string;
};

export type TagRecord = {
  id: string;
  name: string;
};

export type ImageWithTags = ImageRecord & { tags: TagRecord[] };

export async function query<T extends QueryResultRow = any>(sql: string, params: unknown[] = []) {
  return withDatabaseRetry(async () => {
    const client = await pool.connect();
    try {
      const result = await client.query<T>(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  });
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  return withDatabaseRetry(async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

function mapImageRows(rows: ({ tags: string | TagRecord[] } & ImageRecord)[]) {
  return rows.map((row) => {
    let tags: TagRecord[] = [];
    
    if (typeof row.tags === 'string') {
      if (row.tags && row.tags.trim() !== '') {
        try {
          tags = JSON.parse(row.tags);
        } catch (e) {
          console.error('Failed to parse tags:', row.tags, e);
          tags = [];
        }
      }
    } else if (Array.isArray(row.tags)) {
      tags = row.tags;
    }
    
    return {
      ...row,
      tags,
    };
  });
}

export async function getImagesWithTags(filterTags: string[] = [], userId?: string) {
  const params: unknown[] = [];
  let sql = `
    SELECT i.*,
    COALESCE(
      json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name))
      FILTER (WHERE t.id IS NOT NULL), '[]'
    ) AS tags,
    COUNT(DISTINCT l.id) AS liked_count
  `;
  
  // Add is_liked column if userId is provided
  if (userId) {
    params.push(userId);
    sql += `,
    EXISTS(
      SELECT 1 FROM likes WHERE image_id = i.id AND user_id = $${params.length}
    ) AS is_liked
    `;
  }
  
  sql += `
    FROM images i
    LEFT JOIN image_tags it ON it.image_id = i.id
    LEFT JOIN tags t ON t.id = it.tag_id
    LEFT JOIN likes l ON l.image_id = i.id
  `;

  if (filterTags.length > 0) {
    params.push(filterTags);
    sql += `
      WHERE i.id IN (
        SELECT image_id
        FROM image_tags
        WHERE tag_id = ANY($${params.length}::uuid[])
        GROUP BY image_id
        HAVING COUNT(DISTINCT tag_id) >= array_length($${params.length}::uuid[], 1)
      )
    `;
  }

  sql += " GROUP BY i.id ORDER BY i.position ASC, i.created_at DESC";

  const rows = await query<{ tags: string; liked_count?: string; is_liked?: boolean } & ImageRecord>(sql, params);
  return mapImageRows(rows);
}

export async function getImageById(id: string) {
  const rows = await query<{ tags: string } & ImageRecord>(
    `
      SELECT i.*, COALESCE(
        json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name))
        FILTER (WHERE t.id IS NOT NULL), '[]'
      ) AS tags
      FROM images i
      LEFT JOIN image_tags it ON it.image_id = i.id
      LEFT JOIN tags t ON t.id = it.tag_id
      WHERE i.id = $1
      GROUP BY i.id
    `,
    [id],
  );

  const [image] = mapImageRows(rows);
  return image ?? null;
}

export async function updateImageName(imageId: string, imageName: string) {
  await query(
    "UPDATE images SET imagename = $1 WHERE id = $2",
    [imageName.trim() || null, imageId]
  );
}

export async function getAllTags() {
  return query<TagRecord>("SELECT * FROM tags ORDER BY name ASC");
}

export async function checkImageExists(filename: string, size: number): Promise<boolean> {
  const result = await query<{ count: string }>(
    "SELECT COUNT(*) as count FROM images WHERE filename = $1 AND size = $2",
    [filename, size]
  );
  return parseInt(result[0]?.count || "0", 10) > 0;
}

export async function upsertTags(client: PoolClient, tagNames: string[]) {
  if (tagNames.length === 0) return [] as TagRecord[];

  const normalized = Array.from(new Set(tagNames.map((name) => name.trim().toLowerCase()).filter(Boolean)));
  if (normalized.length === 0) return [] as TagRecord[];

  const placeholders = normalized.map((_, index) => `($${index + 1})`).join(",");
  const insertSql = `
    INSERT INTO tags (name)
    VALUES ${placeholders}
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING *;
  `;

  const inserted = await client.query<TagRecord>(insertSql, normalized);
  return inserted.rows;
}

export async function updateImageSize(imageId: string, size: number) {
  return withDatabaseRetry(async () => {
    const sql = `UPDATE images SET size = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`;
    await query(sql, [size, imageId]);
  });
}
