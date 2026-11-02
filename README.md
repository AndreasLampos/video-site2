# Video portfolio site, demo with real clips

Plain HTML, CSS and JavaScript. No build step.
Extract the zip first, then open `index.html` in Chrome. It needs an internet connection (fonts and animation libraries load from a CDN).

## The clips (folder `media/`)
All six are vertical (9:16). On a phone they fill the screen. On a computer they sit in a frame over a blurred copy of themselves.

| Clip | Used in |
|---|---|
| `troufa-walking` | Hero, gallery |
| `troufa-coffee-day` | Chapter 1, showreel button, gallery |
| `amabile-cubes` | Chapter 2, gallery |
| `amabile-lights` | Chapter 3, gallery |
| `amabile-candles` | Chapter 4, gallery |
| `amabile-boat` | Gallery, About section |

Each clip has three files: `name.mp4` (the video), `name.jpg` (a still shown while it loads, and on phones or with animations off) and `name-bg.jpg` (a tiny image used for the blurred background).
The end cards with the Amabile logo were trimmed off, so loops don't flash the logo.

## Adding or replacing a clip
1. Make an mp4: 1080 x 1920, no sound, under about 8 MB:
   `ffmpeg -i input.mov -t 14 -vf scale=1080:1920 -c:v libx264 -crf 27 -preset slow -an -movflags +faststart name.mp4`
2. Make the stills: `ffmpeg -ss 2 -i name.mp4 -frames:v 1 -q:v 4 name.jpg` and `ffmpeg -i name.jpg -vf scale=270:480 -q:v 6 name-bg.jpg`
3. Put the three files in `media/` and point to them in `index.html`.

For horizontal (16:9) clips the frame in `styles.css` (`--frame-h`, `.hero__mediawrap`, `.story__media`) needs a wider aspect ratio. Ask and it can be switched per clip.

## Full films and the showreel
Keep long films on Vimeo or YouTube and use the embed link:
- Showreel button (`#playReel`): replace `data-src="..."` with `data-embed="https://player.vimeo.com/video/YOUR_ID?autoplay=1"`.
- Any gallery tile: same change on that `<button class="tile">`.

## Text
The project names and one-line descriptions were written from what the clips show. Correct them in `index.html` (search for `panel__meta`) and change `Studio Name`, the email, phone and social links in the Contact section.

## Services and client quotes
- "What I make" (`#services` in `index.html`) is a first draft. Check that every sentence matches what your friend really offers, including "Every project starts with a short call and a written quote".
- "What clients say" (`#clients`) only has fill-in blocks. Replace each one with a real quote and the client's name and role, after asking their permission. Delete a block you don't need, or the whole section until you have quotes.

## Look
- Colours are at the top of `styles.css`. Add `?accent=brass` to the address to preview the warm version.
- Remove the viewfinder frame, timecode and grain by deleting the `.hud` and `.grain` divs in `index.html`.
- Visitors with "reduce motion" on in their system see still frames and soft fades, with a message offering to turn animations on.

## Publish
Drag the whole folder into Netlify, Cloudflare Pages or Vercel, then add the existing domain in the site's domain settings.
