-- The studio's name, and a clean Instagram link.
UPDATE site SET content = json_set(content,
  '$.brand', 'Sagma Videos',
  '$.metaTitle', 'Sagma Videos | Video for Brands',
  '$.contact.instagram', 'https://www.instagram.com/sagma_renders'
), updated_at = datetime('now') WHERE id = 1;
