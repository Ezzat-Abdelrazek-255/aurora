import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../components/JsonLd";
import { SmoothScroll } from "../components/SmoothScroll";
import { SITE } from "../lib/site";

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
    award: [
      "LA Drama Critics Circle Award Nominee (2023) — Featured Performance, ‘A View from the Bridge’",
      "Audience Choice Award Winner (2024) — NY Dances with Films, ‘Sonny Boy’",
      "Honorable Mention (2025) — Ojai Film Festival, ‘Sonny Boy’",
    ],
    sameAs: [
      "https://www.instagram.com/auroraleonard/",
      "https://www.linkedin.com/in/aurora-leonard/",
      "https://www.facebook.com/AuroraLeonardReforestFilms/",
    ],
  },
};

export default function AboutPage() {
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
                  className="text-red-600"
                >
                  About
                </Link>
              </li>
            </ul>
          </nav>
        </aside>

        <div className="space-y-14 md:col-span-2 md:max-w-[640px]">
          <Section title="About">
            <p className="text-[14px] leading-[1.6]">
              Aurora Leonard is a filmmaker, producer, and creative with a
              diverse career spanning film, television, theater, and commercial
              work. From major broadcast and streaming platforms to
              award-nominated stage performances and feature films, she brings
              a nuanced understanding of storytelling and production across
              mediums. Through her production company Reforest Films, she
              channels this expansive creative foundation into purpose-driven
              work amplifying voices of environmental stewardship and social
              impact, crafting narratives that are as artistically rigorous as
              they are intentional about reshaping culture more towards
              compassion and humanity.
            </p>
          </Section>

          <Section title="Awards">
            <ul className="space-y-5 text-[14px] leading-[1.5]">
              <Award
                year="2023"
                kind="LA Drama Critics Circle Award Nominee"
                body="Featured Performance — Arthur Miller’s ‘A View from the Bridge’"
              />
              <Award
                year="2024"
                kind="Audience Choice Award Winner"
                body="NY Dances with Films — ‘Sonny Boy’"
              />
              <Award
                year="2025"
                kind="Honorable Mention"
                body="Ojai Film Festival — ‘Sonny Boy’"
              />
            </ul>
          </Section>

          <Section title="Contact">
            <dl className="space-y-4 text-[14px] leading-[1.5]">
              <ContactRow label="Production:">
                <p>
                  <a
                    href="mailto:hello@reforestfilms.com"
                    className="transition-colors hover:italic hover:text-emerald-600"
                  >
                    hello@reforestfilms.com
                  </a>
                </p>
              </ContactRow>
              <ContactRow label="Commercial:">
                <p>
                  Katherine Ryan,{" "}
                  <a
                    href="mailto:katherine@buchwald.com"
                    className="transition-colors hover:italic hover:text-emerald-600"
                  >
                    katherine@buchwald.com
                  </a>
                </p>
              </ContactRow>
            </dl>
          </Section>

          <Section title="Reforest Films">
            <p className="text-[14px] leading-[1.6]">
              Reforest Films is a creative video production company producing
              independent films and specializing in cinematic storytelling that
              amplifies the impact of purpose-led brands and changemakers.
            </p>
            <ul className="mt-4 space-y-1.5 text-[14px]">
              <ExternalLink href="https://www.reforestfilms.com/">
                reforestfilms.com
              </ExternalLink>
              <ExternalLink href="https://www.instagram.com/reforestfilms/">
                Instagram
              </ExternalLink>
              <ExternalLink href="https://www.facebook.com/people/Reforest-Films/61579531462899/">
                Facebook
              </ExternalLink>
            </ul>
          </Section>

          <Section title="Connect">
            <ul className="space-y-1.5 text-[14px]">
              <ExternalLink href="https://www.instagram.com/auroraleonard/">
                Instagram
              </ExternalLink>
              <ExternalLink href="https://www.linkedin.com/in/aurora-leonard/">
                LinkedIn
              </ExternalLink>
              <ExternalLink href="https://www.facebook.com/AuroraLeonardReforestFilms/">
                Facebook
              </ExternalLink>
            </ul>
          </Section>
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

function Award({
  year,
  kind,
  body,
}: {
  year: string;
  kind: string;
  body: string;
}) {
  return (
    <li>
      <p>
        {year} – <strong className="font-semibold">{kind}</strong>
      </p>
      <p className="text-[#0a1f15]">{body}</p>
    </li>
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
