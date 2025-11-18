#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testQuery() {
  try {
    const imageId = '251993bd-0dfe-4844-98d4-8d9d5f33d5e3';
    
    console.log('Testing like count query...');
    const countResult = await pool.query(
      "SELECT COUNT(*)::int as count FROM likes WHERE image_id = $1",
      [imageId]
    );
    console.log('Count result:', countResult.rows);
    
    console.log('\nTesting likers query...');
    const likersResult = await pool.query(
      `SELECT u.id, u.username as name, u.avatar as image 
       FROM likes l 
       JOIN users u ON l.user_id::uuid = u.id 
       WHERE l.image_id = $1 
       ORDER BY l.created_at DESC`,
      [imageId]
    );
    console.log('Likers result:', likersResult.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testQuery();
