export type Video = {
  id: string;
  hash: string;
  brand: string;
  title: string;
};

export const videos: Video[] = [
  { id: "1185495857", hash: "b229874bcf", brand: "Apple", title: "I'm Not Remarkable" },
  { id: "1185506426", hash: "51eee0e281", brand: "Libresse", title: "Viva La Vulva" },
  { id: "1185578722", hash: "b0cfdcb19a", brand: "Chaka Khan", title: "Like Sugar" },
  { id: "1185699012", hash: "05324b8bff", brand: "Apple", title: "iPhone 11" },
  { id: "1185671764", hash: "d9afa817da", brand: "Apple", title: "The Greatest" },
  { id: "1185677642", hash: "223271c8dd", brand: "Nike", title: "So Win" },
  { id: "1185679955", hash: "d9130ae9de", brand: "John Lewis", title: "Tableau" },
  { id: "1185677828", hash: "619ba28358", brand: "Nike", title: "Am I A Bad Person?" },
  { id: "1185677076", hash: "a03be8533b", brand: "Bodyform", title: "Womb Stories" },
  { id: "1185671998", hash: "0086da9e04", brand: "Cadbury", title: "Mum's Birthday" },
  { id: "1185678996", hash: "d4e32bed54", brand: "Nike", title: "Dream Crazier" },
  { id: "1185678936", hash: "54abb94ff0", brand: "Audi", title: "Daughter" },
  { id: "1185681938", hash: "24f5a03e14", brand: "BBC", title: "Tokyo Olympics" },
  { id: "1185680078", hash: "3b2ad7abff", brand: "Sport England", title: "This Girl Can" },
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
