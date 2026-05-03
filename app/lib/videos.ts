export type Category = "film-tv" | "commercial" | "music";
export type Role = "Producer" | "Talent";

export type Video = {
  id: string;
  hash: string;
  /** Production company / show name / commercial brand. Always shown. */
  company: string;
  /** Network or show title. Omitted on commercials (2-line layout). */
  title?: string;
  category: Category;
  role: Role;
};

export const videos: Video[] = [
  { id: "1185495857", hash: "b229874bcf", company: "Apple", category: "commercial", role: "Talent" },
  { id: "1185506426", hash: "51eee0e281", company: "Libresse", category: "commercial", role: "Talent" },
  { id: "1185578722", hash: "b0cfdcb19a", company: "Chaka Khan", title: "Like Sugar", category: "music", role: "Talent" },
  { id: "1185699012", hash: "05324b8bff", company: "Apple", category: "commercial", role: "Talent" },
  { id: "1185671764", hash: "d9afa817da", company: "Apple", category: "commercial", role: "Talent" },
  { id: "1185677642", hash: "223271c8dd", company: "Nike", category: "commercial", role: "Talent" },
  { id: "1185679955", hash: "d9130ae9de", company: "John Lewis", category: "commercial", role: "Talent" },
  { id: "1185677828", hash: "619ba28358", company: "Nike", category: "commercial", role: "Talent" },
  { id: "1185677076", hash: "a03be8533b", company: "Bodyform", category: "commercial", role: "Talent" },
  { id: "1185671998", hash: "0086da9e04", company: "Cadbury", category: "commercial", role: "Talent" },
  { id: "1185678996", hash: "d4e32bed54", company: "Nike", category: "commercial", role: "Talent" },
  { id: "1185678936", hash: "54abb94ff0", company: "Audi", category: "commercial", role: "Talent" },
  { id: "1185681938", hash: "24f5a03e14", company: "BBC", title: "Tokyo Olympics", category: "film-tv", role: "Talent" },
  { id: "1185680078", hash: "3b2ad7abff", company: "Sport England", category: "commercial", role: "Talent" },
];

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "film-tv", label: "Film/TV" },
  { value: "commercial", label: "Commercials" },
  { value: "music", label: "Music" },
];

export type VimeoOEmbed = {
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  width?: number;
  height?: number;
};

export async function getVimeoMeta(id: string, hash: string): Promise<VimeoOEmbed | null> {
  const target = `https://vimeo.com/${id}/${hash}`;
  const url = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(target)}&width=1280`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return (await res.json()) as VimeoOEmbed;
  } catch {
    return null;
  }
}
