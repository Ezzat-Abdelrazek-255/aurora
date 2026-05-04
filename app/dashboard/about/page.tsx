import type { Metadata } from "next";
import { getAboutContent } from "../../lib/about";
import { AboutEditor } from "./AboutEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About — Dashboard",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DashboardAboutPage() {
  const content = await getAboutContent();
  return (
    <section>
      <h2
        className="font-serif text-[20px] tracking-tight"
        style={{ fontFamily: "var(--font-roslindale-display)" }}
      >
        About page content
      </h2>
      <p className="mt-2 text-[12.5px] text-neutral-600">
        Edits go live immediately on the public /about page.
      </p>
      <AboutEditor initial={content} />
    </section>
  );
}
