-- Migration 0009: Add clickmasks column to epaper_pages table for storing interactive hotspots / article clips
ALTER TABLE epaper_pages ADD COLUMN clickmasks TEXT DEFAULT '[]';
