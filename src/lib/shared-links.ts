import { z } from "zod";

export function publicLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !host.includes(".") ||
      /^[\d\[]/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)
    )
      return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
export const linkSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => !!publicLink(value),
    "Enter a public HTTPS link without a password or port.",
  );
export const agentPreferencesSchema = z.object({
  brief: z.string().trim().max(4000),
  sources: z.array(linkSchema).max(15),
  useProfile: z.boolean(),
});
export const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});
export const leadSchema = z.object({
  url: linkSchema,
  title: z.string().trim().max(180).default(""),
  caption: z.string().trim().max(6000).default(""),
});
export function platformFor(url: string): "Instagram" | "LinkedIn" | "Website" {
  const host = new URL(url).hostname.toLowerCase();
  if (host === "instagram.com" || host.endsWith(".instagram.com"))
    return "Instagram";
  if (
    host === "linkedin.com" ||
    host.endsWith(".linkedin.com") ||
    host === "lnkd.in"
  )
    return "LinkedIn";
  return "Website";
}
export function sharedDraft(input: {
  url?: string;
  text?: string;
  title?: string;
}) {
  const text = (input.text || "").slice(0, 6000);
  const candidate = input.url || text.match(/https:\/\/[^\s<>]+/)?.[0] || "";
  const url = publicLink(candidate.replace(/[).,]+$/, "")) || "";
  return {
    url,
    caption: text.replace(url, "").trim(),
    title: (input.title || "").slice(0, 180),
  };
}

function decode(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Math.min(Number(n), 0x10ffff)),
    );
}
export function previewFromHTML(html: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const values: Record<string, string> = {};
  for (const tag of tags) {
    const attrs: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs))
      attrs[match[1].toLowerCase()] = decode(match[3]);
    const key = attrs.property || attrs.name;
    if (key && attrs.content) values[key.toLowerCase()] = attrs.content;
  }
  return {
    title: (values["og:title"] || "").replace(/\s+/g, " ").trim().slice(0, 180),
    caption: (values["og:description"] || values.description || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000),
  };
}

// Fetch only known public social-post hosts. Arbitrary supplied sites are stored,
// never fetched here. Stop on redirects so a supplied URL cannot reach other hosts.
export async function socialPreview(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const instagram =
    ["instagram.com", "www.instagram.com"].includes(host) &&
    /^\/(reel|p|tv)\/[\w-]+\/?$/.test(url.pathname);
  const linkedin =
    ["linkedin.com", "www.linkedin.com"].includes(host) &&
    /^\/(posts\/|feed\/update\/)/.test(url.pathname);
  if (!instagram && !linkedin) return null;
  try {
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "text/html" },
    });
    if (
      response.status !== 200 ||
      !response.headers.get("content-type")?.includes("text/html")
    )
      return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 350_000) break;
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    const result = previewFromHTML(html);
    if (
      !result.title ||
      (/^(instagram|linkedin|login|sign in|log in)(\s|$|[|•])/i.test(
        result.title,
      ) &&
        !result.caption)
    )
      return null;
    if (
      /log in to (instagram|linkedin)|sign in to (instagram|linkedin)/i.test(
        result.caption,
      )
    )
      return null;
    return result.title || result.caption ? result : null;
  } catch {
    return null;
  }
}
