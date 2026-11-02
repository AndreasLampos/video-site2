# Video portfolio site with admin page

The public site keeps its original design. Its films and text now come from a database, and the professional manages them from an admin page at `/admin/`.

It runs on Cloudflare:

| Piece | Service | Holds |
|---|---|---|
| Website and backend | Workers | `src/` and `public/` |
| Film list and site text | D1 database | `migrations/` |
| Video and image files | R2 storage | starter clips are in `seed/media/` |
| Admin login | Zero Trust Access | an email code, no password |

## Try it on your computer
You need Node.js. Nothing here goes online.

```
npm install
npm run setup:local   (only the first time)
npm run dev
```

- Site: http://localhost:8787/
- Admin: http://localhost:8787/admin/ (no login is needed on your own computer)

To start again from the starter content, stop the server, delete the `.wrangler` folder and run `npm run setup:local` again.

Run the automated checks with `npm test`.

## Going live
1. Create a Cloudflare account, ideally in the professional's name, then log in: `npx wrangler login`
2. Create the storage: `npx wrangler r2 bucket create video-site-media`
3. Create the database: `npx wrangler d1 create video-site-db`, then paste the printed id into `database_id` in `wrangler.jsonc`
4. Load the starter content: `npm run setup:remote`
5. Publish: `npm run deploy`
6. Add the domain in the Cloudflare dashboard, under the Worker's **Settings > Domains & Routes**

**Then turn on the admin login.** The admin area stays locked for everyone until this is done:

7. In the dashboard, open **Zero Trust > Access > Applications** and add a **Self-hosted** application with two paths on your domain: `admin*` and `api/admin/*`
8. Add an **Allow** policy with the professional's email address. Use the **One-time PIN** login method.
9. Copy the application's **Audience (AUD) tag** into `ACCESS_AUD` in `wrangler.jsonc`, and your team domain (like `yourteam.cloudflareaccess.com`) into `ACCESS_TEAM_DOMAIN`
10. Publish again: `npm run deploy`

Cloudflare's dashboard menus change from time to time, so the names above may differ slightly.

## Before handing over
These are still placeholders. All can be changed in the admin **Text** tab:
- Studio name, "Hi, I'm Name", "X years"
- Email, phone, Instagram and Vimeo links
- Contact form address: the form won't send until this is a real [Formspree](https://formspree.io) address
- Client quotes: use real ones, with permission, or remove them to hide the section
- Services: check that the wording matches what he really offers

## How uploads work
- MP4, MOV, WebM and MKV files can be uploaded, as long as the browser can read the video inside. Everything is converted to MP4, the format every browser and phone plays.
- The admin page compresses each video on the professional's computer before uploading: H.264 MP4, 1080p at most, about 4.5 Mbit/s. Files already small enough aren't re-encoded, so they lose no quality.
- The still image and blurred background are created automatically from the frame chosen with the slider.
- Vertical films sit in the frame over a blurred background. Horizontal films fill the screen, and span two columns in the gallery. On phones, every film fills the screen, so horizontal ones are cropped at the sides.
- Each upload can run up to 20 minutes after trimming. For longer films, upload a short preview and add the Vimeo or YouTube link.

**Browser:** use a current version of Chrome or Edge. Some camera formats, such as ProRes and sometimes iPhone HEVC on Windows, can't be read by the browser and need exporting to H.264 MP4 first. The page says so when this happens.

## Video files in this project
- `seed/media/`: web versions of the starter films, with sound, uploaded to storage by the setup step
- `seed/originals/`: full-size camera originals. They're left out of git and the website, because they're too big for GitHub. Back them up separately.

## Project layout
- `src/index.js`: routes, media delivery and the admin API
- `src/render.js`: builds the homepage
- `src/validate.js`: checks everything sent from the admin page
- `src/auth.js`: verifies the admin login
- `public/`: `main.js`, `styles.css` and the admin page in `public/admin/`
- `public/admin/vendor/`: Mediabunny, the video compression library (MPL-2.0). After updating the npm package, copy `dist/bundles/mediabunny.min.mjs` here again.

## Look
- Colours are at the top of `public/styles.css`. Add `?accent=brass` to the address to preview the warm version.
- Remove the viewfinder frame, timecode and grain by deleting the `.hud` and `.grain` divs in `src/render.js`.
- Visitors with "reduce motion" on in their system see still frames and soft fades, with a message offering to turn animations on.
