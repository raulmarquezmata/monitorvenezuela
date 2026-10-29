import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import type { Lang } from "./i18n";

const DIR = path.join(process.cwd(), "content", "research");
const POST_RX = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/;

export type Post = {
  slug: string; date: string; title: string; author: string; type: string; tags: string[];
  summary: string; pdf: string | null; html: string; translated: boolean;
};

function read(file: string) {
  const raw = fs.readFileSync(path.join(DIR, file), "utf8");
  return matter(raw);
}

export function listPosts(lang: Lang): Post[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter((f) => POST_RX.test(f) && !f.endsWith(".en.md"))
    .map((f) => getPost(f.replace(/\.md$/, ""), lang)!)
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(slug: string, lang: Lang): Post | null {
  const file = `${slug}.md`;
  if (!POST_RX.test(file) || !fs.existsSync(path.join(DIR, file))) return null;
  const es = read(file);
  const enFile = `${slug}.en.md`;
  const en = lang === "en" && fs.existsSync(path.join(DIR, enFile)) ? read(enFile) : null;
  const fm = { ...es.data, ...(en?.data ?? {}) } as Record<string, unknown>;
  const d = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date ?? slug.slice(0, 10));
  return {
    slug, date: d,
    title: String(fm.title ?? slug),
    author: String(fm.author ?? "Research Desk"),
    type: String(fm.type ?? ""),
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    summary: String(fm.summary ?? ""),
    pdf: fm.pdf ? `/research/${String(fm.pdf).replace(/^\/?research\//, "")}` : null,
    html: marked.parse(en ? en.content : es.content, { async: false }) as string,
    translated: Boolean(en),
  };
}
