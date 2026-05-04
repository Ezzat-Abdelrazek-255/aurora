"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "../../components/Spinner";
import type {
  AboutAward,
  AboutContent,
  AboutLink,
} from "../../lib/about";

const eq = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const stripEmptyAwards = (xs: AboutAward[]) =>
  xs.filter((x) => x.year || x.kind || x.body);
const stripEmptyLinks = (xs: AboutLink[]) =>
  xs.filter((x) => x.label || x.url);

const normalize = (c: AboutContent): AboutContent => ({
  ...c,
  awards: stripEmptyAwards(c.awards),
  reforest: { ...c.reforest, links: stripEmptyLinks(c.reforest.links) },
  connect_links: stripEmptyLinks(c.connect_links),
});

export function AboutEditor({ initial }: { initial: AboutContent }) {
  const router = useRouter();
  const [data, setData] = useState<AboutContent>(initial);
  const [baseline, setBaseline] = useState<AboutContent>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);

  const dirty = useMemo(() => {
    const a = normalize(data);
    const b = normalize(baseline);
    const bio = a.bio !== b.bio;
    const awards = !eq(a.awards, b.awards);
    const production = a.production_email !== b.production_email;
    const commercial = !eq(a.commercial, b.commercial);
    const contact = production || commercial;
    const reforestBody = a.reforest.body !== b.reforest.body;
    const reforestLinks = !eq(a.reforest.links, b.reforest.links);
    const reforest = reforestBody || reforestLinks;
    const connect = !eq(a.connect_links, b.connect_links);
    return {
      bio,
      awards,
      contact,
      reforest,
      reforestBody,
      reforestLinks,
      connect,
      any: bio || awards || contact || reforest || connect,
    };
  }, [data, baseline]);

  const save = useCallback(async () => {
    if (pending) return false;
    setPending(true);
    setError(null);
    const payload = normalize(data);
    const res = await fetch("/api/about", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(body?.message ?? body?.error ?? `${res.status}`);
      return false;
    }
    setData(payload);
    setBaseline(payload);
    setSavedAt(Date.now());
    router.refresh();
    return true;
  }, [data, pending, router]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dirty.any) save();
  };

  // Ctrl+S / Cmd+S to save.
  const dirtyRef = useRef(dirty.any);
  dirtyRef.current = dirty.any;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "s") {
        e.preventDefault();
        if (dirtyRef.current) save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  // Tab close / hard reload — browser-native warning (custom UI not allowed
  // by the spec for beforeunload).
  useEffect(() => {
    if (!dirty.any) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty.any]);

  // In-app navigation — intercept anchor clicks so we can show our own modal.
  useEffect(() => {
    if (!dirty.any) return;
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      setLeaveTarget(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [dirty.any]);

  const reset = {
    bio: () => setData({ ...data, bio: baseline.bio }),
    awards: () => setData({ ...data, awards: baseline.awards }),
    contact: () =>
      setData({
        ...data,
        production_email: baseline.production_email,
        commercial: baseline.commercial,
      }),
    reforest: () => setData({ ...data, reforest: baseline.reforest }),
    reforestBody: () =>
      setData({
        ...data,
        reforest: { ...data.reforest, body: baseline.reforest.body },
      }),
    reforestLinks: () =>
      setData({
        ...data,
        reforest: { ...data.reforest, links: baseline.reforest.links },
      }),
    connect: () =>
      setData({ ...data, connect_links: baseline.connect_links }),
  };

  const cancelLeave = () => setLeaveTarget(null);
  const discardAndLeave = () => {
    if (!leaveTarget) return;
    const target = leaveTarget;
    setLeaveTarget(null);
    setBaseline(data);
    router.push(target);
  };
  const saveAndLeave = async () => {
    if (!leaveTarget) return;
    const target = leaveTarget;
    const ok = await save();
    if (ok) {
      setLeaveTarget(null);
      router.push(target);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-10">
      <Block title="Bio" dirty={dirty.bio} onReset={reset.bio}>
        <textarea
          value={data.bio}
          onChange={(e) => setData({ ...data, bio: e.target.value })}
          rows={8}
          className={textareaCls}
          placeholder="Write the bio paragraph"
        />
      </Block>

      <Block
        title="Awards"
        dirty={dirty.awards}
        onReset={reset.awards}
        action={
          <AddButton
            onClick={() =>
              setData({
                ...data,
                awards: [{ year: "", kind: "", body: "" }, ...data.awards],
              })
            }
          />
        }
      >
        <ul className="space-y-3">
          {data.awards.map((a, i) => (
            <AwardRow
              key={i}
              award={a}
              onChange={(next) =>
                setData({
                  ...data,
                  awards: data.awards.map((x, j) => (j === i ? next : x)),
                })
              }
              onRemove={() =>
                setData({
                  ...data,
                  awards: data.awards.filter((_, j) => j !== i),
                })
              }
            />
          ))}
          {data.awards.length === 0 && <Empty>No awards yet.</Empty>}
        </ul>
      </Block>

      <Block title="Contact" dirty={dirty.contact} onReset={reset.contact}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Production email">
            <input
              type="email"
              value={data.production_email}
              onChange={(e) =>
                setData({ ...data, production_email: e.target.value })
              }
              className={inputCls}
              placeholder="hello@example.com"
            />
          </Field>
          <Field label="Commercial contact name">
            <input
              type="text"
              value={data.commercial.name}
              onChange={(e) =>
                setData({
                  ...data,
                  commercial: { ...data.commercial, name: e.target.value },
                })
              }
              className={inputCls}
              placeholder="Agent name"
            />
          </Field>
          <Field label="Commercial contact email" className="md:col-span-2">
            <input
              type="email"
              value={data.commercial.email}
              onChange={(e) =>
                setData({
                  ...data,
                  commercial: { ...data.commercial, email: e.target.value },
                })
              }
              className={inputCls}
              placeholder="agent@example.com"
            />
          </Field>
        </div>
      </Block>

      <Block
        title="Reforest Films"
        dirty={dirty.reforest}
        onReset={reset.reforest}
      >
        <Field
          label="Description"
          dirty={dirty.reforestBody}
          onReset={reset.reforestBody}
        >
          <textarea
            value={data.reforest.body}
            onChange={(e) =>
              setData({
                ...data,
                reforest: { ...data.reforest, body: e.target.value },
              })
            }
            rows={4}
            className={textareaCls}
          />
        </Field>
        <div className="mt-4">
          <SubHeader
            title="Links"
            dirty={dirty.reforestLinks}
            onReset={reset.reforestLinks}
            action={
              <AddButton
                onClick={() =>
                  setData({
                    ...data,
                    reforest: {
                      ...data.reforest,
                      links: [
                        { label: "", url: "" },
                        ...data.reforest.links,
                      ],
                    },
                  })
                }
              />
            }
          />
          <div className="mt-3">
            <LinkList
              links={data.reforest.links}
              onChange={(links) =>
                setData({ ...data, reforest: { ...data.reforest, links } })
              }
            />
          </div>
        </div>
      </Block>

      <Block
        title="Connect"
        dirty={dirty.connect}
        onReset={reset.connect}
        action={
          <AddButton
            onClick={() =>
              setData({
                ...data,
                connect_links: [{ label: "", url: "" }, ...data.connect_links],
              })
            }
          />
        }
      >
        <LinkList
          links={data.connect_links}
          onChange={(connect_links) => setData({ ...data, connect_links })}
        />
      </Block>

      <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-lg border border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="min-h-[16px] text-[12px] text-neutral-600">
          {error ? (
            <span className="text-red-700">Save failed: {error}</span>
          ) : dirty.any ? (
            <span className="text-neutral-700">
              Unsaved changes
              <span className="ml-2 text-[11px] text-neutral-500">
                (⌘/Ctrl + S to save)
              </span>
            </span>
          ) : savedAt ? (
            <span className="text-emerald-700">Saved.</span>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending || !dirty.any}
          className="inline-flex h-[38px] items-center gap-2 rounded-md bg-[#040d08] px-4 text-[12px] uppercase leading-none tracking-wider text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {pending && <Spinner size={12} />}
          {pending ? "Saving" : "Save changes"}
        </button>
      </div>
      {leaveTarget && (
        <LeaveWarning
          pending={pending}
          onCancel={cancelLeave}
          onDiscard={discardAndLeave}
          onSave={saveAndLeave}
        />
      )}
    </form>
  );
}

function LeaveWarning({
  pending,
  onCancel,
  onDiscard,
  onSave,
}: {
  pending: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-[420px] rounded-lg bg-white p-6 shadow-xl">
        <h3
          id="leave-title"
          className="font-serif text-[20px] tracking-tight"
          style={{ fontFamily: "var(--font-roslindale-display)" }}
        >
          Leave with unsaved changes?
        </h3>
        <p className="mt-2 text-[13px] leading-[1.5] text-neutral-700">
          You have unsaved edits. Save them before navigating away, or discard
          them to leave.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="text-[11px] uppercase tracking-wider text-neutral-600 transition hover:text-neutral-900 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDiscard}
              disabled={pending}
              className="text-[11px] uppercase tracking-wider text-red-700 transition hover:text-red-900 disabled:opacity-40"
            >
              Discard & leave
            </button>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="inline-flex h-[34px] items-center gap-2 rounded-md bg-[#040d08] px-3 text-[11px] uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {pending && <Spinner size={11} />}
            {pending ? "Saving" : "Save & leave"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AwardRow({
  award,
  onChange,
  onRemove,
}: {
  award: AboutAward;
  onChange: (a: AboutAward) => void;
  onRemove: () => void;
}) {
  return (
    <li className="grid grid-cols-[80px_1fr_1fr_auto] gap-3 rounded-md border border-neutral-200 p-3">
      <input
        type="text"
        value={award.year}
        onChange={(e) => onChange({ ...award, year: e.target.value })}
        placeholder="2025"
        className={inputCls}
      />
      <input
        type="text"
        value={award.kind}
        onChange={(e) => onChange({ ...award, kind: e.target.value })}
        placeholder="Award name"
        className={inputCls}
      />
      <input
        type="text"
        value={award.body}
        onChange={(e) => onChange({ ...award, body: e.target.value })}
        placeholder="Project / role"
        className={inputCls}
      />
      <RemoveButton onClick={onRemove} />
    </li>
  );
}

function LinkList({
  links,
  onChange,
}: {
  links: AboutLink[];
  onChange: (links: AboutLink[]) => void;
}) {
  if (links.length === 0) return <Empty>No links yet.</Empty>;
  return (
    <ul className="space-y-3">
      {links.map((l, i) => (
        <li
          key={i}
          className="grid grid-cols-[1fr_2fr_auto] gap-3 rounded-md border border-neutral-200 p-3"
        >
          <input
            type="text"
            value={l.label}
            onChange={(e) =>
              onChange(
                links.map((x, j) =>
                  j === i ? { ...x, label: e.target.value } : x,
                ),
              )
            }
            placeholder="Label"
            className={inputCls}
          />
          <input
            type="url"
            value={l.url}
            onChange={(e) =>
              onChange(
                links.map((x, j) =>
                  j === i ? { ...x, url: e.target.value } : x,
                ),
              )
            }
            placeholder="https://"
            className={inputCls}
          />
          <RemoveButton onClick={() => onChange(links.filter((_, j) => j !== i))} />
        </li>
      ))}
    </ul>
  );
}

function Block({
  title,
  action,
  children,
  dirty,
  onReset,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  dirty?: boolean;
  onReset?: () => void;
}) {
  return (
    <section>
      <SubHeader
        title={title}
        action={action}
        dirty={dirty}
        onReset={onReset}
      />
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SubHeader({
  title,
  action,
  dirty,
  onReset,
}: {
  title: string;
  action?: React.ReactNode;
  dirty?: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h3
        className="inline-flex items-baseline gap-2 font-serif text-[16px] tracking-tight"
        style={{ fontFamily: "var(--font-roslindale-display)" }}
      >
        {title}
        {dirty && <DirtyDot />}
        {dirty && onReset && <ResetButton onClick={onReset} />}
      </h3>
      {action}
    </div>
  );
}

function Field({
  label,
  children,
  className,
  dirty,
  onReset,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  dirty?: boolean;
  onReset?: () => void;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-neutral-600">
        {label}
        {dirty && <DirtyDot />}
        {dirty && onReset && <ResetButton onClick={onReset} />}
      </span>
      {children}
    </label>
  );
}

function DirtyDot() {
  return (
    <span
      aria-label="Unsaved changes"
      title="Unsaved changes"
      className="inline-block h-1.5 w-1.5 rounded-full bg-red-500"
    />
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[10px] uppercase tracking-wider text-neutral-500 transition hover:text-[#040d08]"
    >
      Reset
    </button>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] uppercase tracking-wider text-neutral-700 transition hover:text-[#040d08]"
    >
      + Add
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="self-center text-[11px] uppercase tracking-wider text-red-700 transition hover:text-red-900"
    >
      Remove
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-[12.5px] text-neutral-500">
      {children}
    </p>
  );
}

const inputCls =
  "box-border block h-[34px] w-full rounded-md border border-neutral-300 bg-white px-3 text-[13px] leading-none outline-none focus:border-[#040d08]";

const textareaCls =
  "block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-[13px] leading-[1.5] outline-none focus:border-[#040d08]";
