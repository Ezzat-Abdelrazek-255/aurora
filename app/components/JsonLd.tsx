// Inline structured data. Server-only, intentionally not a client component —
// search engines parse the raw HTML. Using <script type="application/ld+json">
// is the documented pattern for App Router metadata; Next.js does not strip it.

type Props = {
  id?: string;
  data: Record<string, unknown> | Record<string, unknown>[];
};

export function JsonLd({ id, data }: Props) {
  return (
    <script
      type="application/ld+json"
      id={id}
      // JSON.stringify with no replacer is safe for a static graph we control.
      // No user input flows in here.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
