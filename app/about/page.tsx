import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../components/JsonLd";
import { SmoothScroll } from "../components/SmoothScroll";
import { getAboutContent } from "../lib/about";
import { SITE } from "../lib/site";

export const dynamic = "force-dynamic";

const aboutDescription =
  "About Aurora Leonard — filmmaker and producer behind Reforest Films. Award-nominated work spanning film, television, theater, and commercials, with a focus on purpose-led storytelling.";

export const metadata: Metadata = {
  title: "About",
  description: aboutDescription,
  alternates: { canonical: "/about" },
  openGraph: {
    title: `About — ${SITE.name}`,
    description: aboutDescription,
    url: "/about",
    type: "profile",
  },
  twitter: {
    title: `About — ${SITE.name}`,
    description: aboutDescription,
  },
};

export default async function AboutPage() {
  const about = await getAboutContent();

  const aboutJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${SITE.url}/about`,
    name: `About ${SITE.name}`,
    description: aboutDescription,
    mainEntity: {
      "@type": "Person",
      name: SITE.name,
      jobTitle: "Filmmaker & Producer",
      url: SITE.url,
      worksFor: {
        "@type": "Organization",
        name: "Reforest Films",
        url: "https://www.reforestfilms.com/",
      },
      award: about.awards.map((a) => `${a.kind} (${a.year}) — ${a.body}`),
      sameAs: about.connect_links.map((l) => l.url),
    },
  };

  return (
    <main className="relative min-h-screen bg-white px-4 pt-8 pb-24 text-[#040d08] md:px-6 lg:px-10">
      <JsonLd id="ld-about" data={aboutJsonLd} />
      <h1 className="sr-only">About {SITE.name}</h1>
      <SmoothScroll />
      <div className="grid grid-cols-1 gap-x-10 gap-y-16 md:grid-cols-3">
        <aside className="md:col-span-1">
          <nav
            className="font-serif text-[24px] leading-[1.25] md:text-[26px]"
            aria-label="Primary"
          >
            <Link
              href="/"
              className="font-bold tracking-tight transition-colors hover:italic hover:text-emerald-600"
            >
              Aurora Leonard
            </Link>
            <ul className="mt-2 space-y-1">
              <li>
                <Link
                  href="/about"
                  aria-current="page"
                  className="transition-colors hover:italic hover:text-emerald-600"
                >
                  About
                </Link>
              </li>
            </ul>
          </nav>
        </aside>

        <div className="space-y-14 md:col-span-2 md:max-w-[640px]">
          {about.bio && (
            <Section title="About">
              <p className="text-[14px] leading-[1.6] whitespace-pre-line">
                {about.bio}
              </p>
            </Section>
          )}

          {about.awards.length > 0 && (
            <Section title="Awards">
              <ul className="space-y-5 text-[14px] leading-[1.5]">
                {about.awards.map((a, i) => (
                  <li key={i}>
                    <p>
                      {a.year} – <strong className="font-semibold">{a.kind}</strong>
                    </p>
                    <p className="text-[#0a1f15]">{a.body}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(about.production_email || about.commercial.email) && (
            <Section title="Contact">
              <dl className="space-y-4 text-[14px] leading-[1.5]">
                {about.production_email && (
                  <ContactRow label="Production:">
                    <p>
                      <a
                        href={`mailto:${about.production_email}`}
                        className="transition-colors hover:italic hover:text-emerald-600"
                      >
                        {about.production_email}
                      </a>
                    </p>
                  </ContactRow>
                )}
                {about.commercial.email && (
                  <ContactRow label="Commercial:">
                    <p>
                      {about.commercial.name && `${about.commercial.name}, `}
                      <a
                        href={`mailto:${about.commercial.email}`}
                        className="transition-colors hover:italic hover:text-emerald-600"
                      >
                        {about.commercial.email}
                      </a>
                    </p>
                  </ContactRow>
                )}
              </dl>
            </Section>
          )}

          {(about.reforest.body || about.reforest.links.length > 0) && (
            <Section title="Reforest Films">
              {about.reforest.body && (
                <p className="text-[14px] leading-[1.6] whitespace-pre-line">
                  {about.reforest.body}
                </p>
              )}
              {about.reforest.links.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-[14px]">
                  {about.reforest.links.map((l, i) => (
                    <ExternalLink key={i} href={l.url}>
                      {l.label}
                    </ExternalLink>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {about.connect_links.length > 0 && (
            <Section title="Connect">
              <ul className="space-y-1.5 text-[14px]">
                {about.connect_links.map((l, i) => (
                  <ExternalLink key={i} href={l.url}>
                    {l.label}
                  </ExternalLink>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-serif text-[28px] leading-[1.1] tracking-tight md:text-[30px]">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ContactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-semibold">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:italic hover:text-emerald-600"
      >
        {children}
      </a>
    </li>
  );
}
