-- The new originals with sound, new file names so browsers don't keep showing cached copies, and Stelios's details.
UPDATE films SET video_key='troufa-walking-v2.mp4', poster_key='troufa-walking-v2.jpg', bg_key='troufa-walking-v2-bg.jpg', width=1080, height=1920, duration=14.23, size_bytes=12409381 WHERE id='troufa-walking';
UPDATE films SET video_key='troufa-coffee-day-v2.mp4', poster_key='troufa-coffee-day-v2.jpg', bg_key='troufa-coffee-day-v2-bg.jpg', width=1080, height=1920, duration=31.47, size_bytes=16487270 WHERE id='troufa-coffee-day';
UPDATE films SET video_key='amabile-cubes-v2.mp4', poster_key='amabile-cubes-v2.jpg', bg_key='amabile-cubes-v2-bg.jpg', width=1080, height=1920, duration=8.47, size_bytes=2607270 WHERE id='amabile-cubes';
UPDATE films SET video_key='amabile-lights-v2.mp4', poster_key='amabile-lights-v2.jpg', bg_key='amabile-lights-v2-bg.jpg', width=1080, height=1920, duration=16.85, size_bytes=14883591 WHERE id='amabile-lights';
UPDATE films SET video_key='amabile-candles-v2.mp4', poster_key='amabile-candles-v2.jpg', bg_key='amabile-candles-v2-bg.jpg', width=1080, height=1920, duration=14.34, size_bytes=7656358 WHERE id='amabile-candles';
UPDATE films SET video_key='amabile-boat-v2.mp4', poster_key='amabile-boat-v2.jpg', bg_key='amabile-boat-v2-bg.jpg', width=1080, height=1920, duration=10.52, size_bytes=4805286 WHERE id='amabile-boat';
UPDATE site SET content = json_remove(json_set(content,
  '$.about.heading', 'Hi, I''m Stelios Sagmatopoulos.',
  '$.about.paragraphs', json('["I''m a videographer and photographer based in Athens, dedicated to capturing visual stories that connect and inspire. With a keen eye for detail and a passion for dynamic storytelling, I bring creative concepts to life through clean aesthetics and cinematic visuals.","I''ve worked with clothing brands and restaurants that want their videos to look like them, not like everyone else.","I work on my own or with a small crew, depending on the job. You get a clear quote, a shot list agreed in advance and finished files on time."]'),
  '$.contact.instagram', 'https://www.instagram.com/sagma_renders?rpxt=c3k0amwycHc0a2t1'
), '$.hero.reel'), updated_at = datetime('now') WHERE id = 1;
