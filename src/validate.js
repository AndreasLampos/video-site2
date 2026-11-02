// Cleans and checks everything the admin page sends before it is saved.

export class ValidationError extends Error {}

const str = (v, max, label) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw new ValidationError(`${label} is too long (${max} characters at most).`);
  return s;
};
const required = (v, max, label) => {
  const s = str(v, max, label);
  if (!s) throw new ValidationError(`${label} can't be empty.`);
  return s;
};
const list = (v, max, label) => {
  if (!Array.isArray(v)) return [];
  if (v.length > max) throw new ValidationError(`${label}: ${max} items at most.`);
  return v;
};

export function httpsUrl(v, label) {
  const s = str(v, 500, label);
  if (!s) return "";
  let u;
  try { u = new URL(s); } catch { throw new ValidationError(`${label} isn't a valid link.`); }
  if (u.protocol !== "https:") throw new ValidationError(`${label} must start with https://`);
  return u.href;
}

/** Turns a normal Vimeo or YouTube page link into the embed address the player needs. */
export function toEmbedUrl(v) {
  const s = str(v, 500, "Full film link");
  if (!s) return "";
  let u;
  try { u = new URL(s); } catch { throw new ValidationError("Full film link isn't a valid link."); }
  const host = u.hostname.replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (u.protocol === "https:" || u.protocol === "http:") {
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const i = parts.findIndex((p) => /^\d+$/.test(p));
      if (i >= 0) {
        const hash = /^[0-9a-f]+$/i.test(parts[i + 1] || "") ? parts[i + 1] : u.searchParams.get("h");
        return `https://player.vimeo.com/video/${parts[i]}?autoplay=1${hash && /^[0-9a-f]+$/i.test(hash) ? `&h=${hash}` : ""}`;
      }
    }
    let yt = "";
    if (host === "youtu.be") yt = parts[0];
    else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      yt = u.searchParams.get("v") || (["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : "");
    }
    if (yt && /^[\w-]{6,20}$/.test(yt)) return `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1`;
  }
  throw new ValidationError("Full film link must be a Vimeo or YouTube video link.");
}

export const MEDIA_KEY = /^[a-z0-9][a-z0-9-]*(-bg)?\.(mp4|jpg)$/;

/** Text fields of a film. Video files and sizes are handled separately. */
export function cleanFilmFields(input, categories) {
  const category = required(input.category, 40, "Category");
  if (!categories.some((c) => c.id === category)) throw new ValidationError("Choose one of the categories.");
  return {
    title: required(input.title, 120, "Title"),
    short_name: str(input.short_name, 40, "Short name"),
    meta: str(input.meta, 120, "Tagline"),
    description: str(input.description, 600, "Description"),
    category,
    embed_url: toEmbedUrl(input.embed_url),
  };
}

export const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");

export function cleanContent(input, filmIds) {
  const known = new Set(filmIds);
  const film = (id, label) => {
    if (!known.has(id)) throw new ValidationError(`Choose a film for ${label}.`);
    return id;
  };
  const films = (ids, label) => {
    const out = [...new Set(list(ids, 200, label))].filter((id) => known.has(id));
    if (!out.length) throw new ValidationError(`${label} needs at least one film.`);
    return out;
  };

  const seen = new Set();
  const categories = list(input.categories, 12, "Categories").map((c) => {
    const label = required(c?.label, 40, "Category name");
    const id = str(c?.id, 60, "Category") || slug(label) || `category-${seen.size + 1}`;
    if (seen.has(id)) throw new ValidationError(`The category "${label}" is listed twice.`);
    seen.add(id);
    return { id, label };
  });
  if (!categories.length) throw new ValidationError("Keep at least one category.");

  const email = str(input.contact?.email, 200, "Email");
  if (email && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)) throw new ValidationError("Email doesn't look right.");
  const phone = str(input.contact?.phone, 40, "Phone");
  if (phone && !/^[+\d][\d\s().-]*$/.test(phone)) throw new ValidationError("Phone can only contain numbers, spaces and + ( ) -");

  return {
    brand: required(input.brand, 60, "Studio name"),
    metaTitle: required(input.metaTitle, 120, "Browser tab title"),
    metaDescription: str(input.metaDescription, 300, "Search description"),
    categories,
    hero: {
      line1: required(input.hero?.line1, 40, "Headline, line 1"),
      line2: str(input.hero?.line2, 40, "Headline, line 2"),
      sub: str(input.hero?.sub, 200, "Intro sentence"),
      film: film(input.hero?.film, "the opening clip"),
    },
    story: { films: films(input.story?.films, "Selected work") },
    gallery: { title: required(input.gallery?.title, 60, "Gallery title"), films: films(input.gallery?.films, "More films") },
    services: {
      title: required(input.services?.title, 60, "Services title"),
      items: list(input.services?.items, 12, "Services").map((i) => ({
        title: required(i?.title, 100, "Service name"),
        text: str(i?.text, 600, "Service description"),
      })),
      note: str(input.services?.note, 300, "Note under services"),
      noteLink: str(input.services?.noteLink, 80, "Link text"),
    },
    about: {
      heading: required(input.about?.heading, 80, "About heading"),
      paragraphs: list(input.about?.paragraphs, 6, "About").map((p) => str(p, 1200, "About text")).filter(Boolean),
      film: film(input.about?.film, "the About section"),
    },
    clients: {
      title: required(input.clients?.title, 60, "Clients title"),
      quotes: list(input.clients?.quotes, 12, "Client quotes").map((q) => ({
        quote: required(q?.quote, 500, "Client quote"),
        name: str(q?.name, 120, "Client name"),
      })),
    },
    contact: {
      heading: required(input.contact?.heading, 80, "Contact heading"),
      lead: str(input.contact?.lead, 300, "Contact sentence"),
      email,
      phone,
      instagram: httpsUrl(input.contact?.instagram, "Instagram link"),
      vimeo: httpsUrl(input.contact?.vimeo, "Vimeo link"),
      formAction: httpsUrl(input.contact?.formAction, "Contact form address"),
    },
  };
}
