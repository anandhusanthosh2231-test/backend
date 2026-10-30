import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Check, ChevronDown, Clock3, Copy, ExternalLink, Film, Search, Sparkles, WandSparkles, X } from "lucide-react";
import { Link, useParams } from "wouter";
import { pageTitle } from "@/lib/pageTitle";
import "./vybe.css";

type VybeAsset = {
  assetId?: string;
  url: string;
  alt: string;
  type: "image" | "video";
  caption?: string;
};

type VybeCreation = {
  id: number;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  category: string;
  contentType: string;
  model: string;
  models: string[];
  prompt: string;
  negativePrompt: string;
  style: string;
  aspectRatio: string;
  parameters: Record<string, unknown>;
  scene: string;
  motion: string;
  cameraInstructions: string;
  durationSeconds: number | null;
  videoUrl: string;
  posterUrl: string;
  visualReferences: VybeAsset[];
  exampleOutputs: VybeAsset[];
  refinementInstructions: string;
  builderInstructions: string;
  tools: string[];
  demoUrl: string;
  verificationDetails: string;
  experienceUrl: string;
  experienceControls: string[];
  mediaAssets: VybeAsset[];
  imageUrl: string;
  imageAlt: string;
  tags: string[];
  status: string;
  featured: boolean;
  trending: boolean;
  publishedAt?: string | null;
};

type VybeListResponse = { items: VybeCreation[]; total: number; page: number; pageSize: number };
const contentTypes = ["image", "video", "art", "design", "3d", "app", "game", "interactive", "custom"];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "VYBE could not be loaded.");
  return body as T;
}

function isVybeListResponse(value: unknown): value is VybeListResponse & { categories?: string[] } {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<VybeListResponse> & { categories?: unknown };
  return Array.isArray(response.items) && typeof response.total === "number"
    && typeof response.page === "number" && typeof response.pageSize === "number"
    && (response.categories === undefined || Array.isArray(response.categories));
}

function listEndpoint(previewMode: boolean) {
  return previewMode ? "/api/admin/vybe" : "/api/vybe";
}

export function VybeMarketplace({ previewMode = false }: { previewMode?: boolean }) {
  const launched = import.meta.env.VITE_VYBE_ENABLED === "true";
  const enabled = previewMode || launched;
  const initialParams = new URLSearchParams(window.location.search);
  const [items, setItems] = useState<VybeCreation[]>([]);
  const [featuredItems, setFeaturedItems] = useState<VybeCreation[]>([]);
  const [trendingItems, setTrendingItems] = useState<VybeCreation[]>([]);
  const [recentItems, setRecentItems] = useState<VybeCreation[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState(initialParams.get("q") ?? "");
  const [category, setCategory] = useState(initialParams.get("category") ?? "");
  const [contentType, setContentType] = useState(initialParams.get("contentType") ?? "");
  const [model, setModel] = useState(initialParams.get("model") ?? "");
  const [tag, setTag] = useState(initialParams.get("tag") ?? "");
  const [sort, setSort] = useState(initialParams.get("sort") ?? "featured");
  const [page, setPage] = useState(Math.max(1, Number(initialParams.get("page")) || 1));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = pageTitle(previewMode ? "VYBE Preview" : enabled ? "VYBE Creative AI, in motion" : "VYBE Coming soon");
    let robots = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = launched && !previewMode ? "index,follow" : "noindex,nofollow";
    return () => { if (!launched || previewMode) robots?.remove(); };
  }, [enabled, launched, previewMode]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    if (contentType) params.set("contentType", contentType);
    if (model.trim()) params.set("model", model.trim());
    if (tag.trim()) params.set("tag", tag.trim());
    if (sort !== "featured") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [query, category, contentType, model, tag, sort, page]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: "24" });
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("category", category);
      if (contentType) params.set("contentType", contentType);
      if (model.trim()) params.set("model", model.trim());
      if (tag.trim()) params.set("tag", tag.trim());
      if (sort) params.set("sort", sort);
      setLoading(true);
      setError("");
      fetchJson<unknown>(`${listEndpoint(previewMode)}?${params}`, { credentials: "include" })
        .then((response) => {
          if (!isVybeListResponse(response)) throw new Error("The VYBE catalogue response was invalid.");
          setItems(response.items);
          setTotal(response.total);
          setCategories(response.categories ?? []);
        })
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "VYBE could not be loaded."))
        .finally(() => setLoading(false));
    }, query ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [enabled, previewMode, page, query, category, contentType, model, tag, sort]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const loadShelf = async (filters: Record<string, string>) => {
      const params = new URLSearchParams({ page: "1", pageSize: "3", ...filters });
      if (previewMode) params.set("status", "PUBLISHED");
      const response = await fetchJson<unknown>(`${listEndpoint(previewMode)}?${params}`, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!isVybeListResponse(response)) throw new Error("The VYBE catalogue response was invalid.");
      return response.items;
    };
    void Promise.all([
      loadShelf({ featured: "true" }).then(setFeaturedItems),
      loadShelf({ trending: "true" }).then(setTrendingItems),
      loadShelf({ sort: "newest" }).then(setRecentItems),
    ]).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "VYBE shelves could not be loaded.");
    });
    return () => controller.abort();
  }, [enabled, previewMode]);

  const models = useMemo(() => [...new Set(items.flatMap((item) => [item.model, ...(item.models ?? [])]).filter(Boolean))].sort(), [items]);
  const pageCount = Math.max(1, Math.ceil(total / 24));
  const updateQuery = (value: string) => { setPage(1); setQuery(value); };
  const clearFilters = () => {
    setPage(1);
    setQuery("");
    setCategory("");
    setContentType("");
    setModel("");
    setTag("");
    setSort("featured");
  };

  if (!enabled) {
    return <main className="vybe-closed" aria-labelledby="vybe-closed-title">
      <span className="vybe-eyebrow"><span /> A private creative universe</span>
      <h1 id="vybe-closed-title">VYBE is in the making.</h1>
      <p>This creative space is being prepared. Come back when the doors open.</p>
      <Link href="/recipes" className="vybe-back-link"><ArrowLeft size={16} /> Explore TaskBakeAI recipes</Link>
    </main>;
  }

  return <main className="vybe-page">
    {previewMode && <div className="vybe-preview-banner"><span>PRIVATE ADMIN PREVIEW</span><strong>Preview only · content is not publicly launched</strong></div>}
    <header className="vybe-hero">
      <div className="vybe-hero__grid" aria-hidden="true" />
      <div className="vybe-hero__content">
        <span className="vybe-eyebrow"><span /> An independent creative universe</span>
        <h1>Make something<br /><em>impossible to ignore.</em></h1>
        <p>Image prompts, moving worlds, dimensional art, and ideas built to become real. Made for the curious, not the catalogue.</p>
        <form className="vybe-hero-search" role="search" onSubmit={(event) => { event.preventDefault(); document.querySelector("#discover")?.scrollIntoView({ behavior: "smooth" }); }}>
          <Search size={18} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search prompts, visual styles, models…" aria-label="Search VYBE creations" />
          <button type="submit">Search <ArrowUpRight size={15} /></button>
        </form>
        <a className="vybe-hero__action" href="#discover">Explore creations <ArrowDownRight size={17} /></a>
      </div>
      <div className="vybe-hero__orb" aria-hidden="true"><div className="vybe-orb-core" /><span>IMAGINE<br />WHAT'S NEXT</span></div>
      <div className="vybe-hero__index"><span>01 / OPEN CANVAS</span><span>CREATIVE SYSTEMS · 2026</span></div>
    </header>

    {featuredItems.length > 0 && <section className="vybe-featured" aria-label="Featured creations">
      <div className="vybe-section-heading"><div><span className="vybe-label">SELECTED FREQUENCIES</span><h2>Featured signals</h2></div><span className="vybe-section-note">A few things worth getting lost in</span></div>
      <div className="vybe-featured-grid">
        {featuredItems.map((item, index) => <CreationCard key={item.id} item={item} index={index} featured previewMode={previewMode} />)}
      </div>
    </section>}

    {trendingItems.length > 0 && <section className="vybe-shelf" aria-label="Trending creations">
      <div className="vybe-section-heading"><div><span className="vybe-label">IN MOTION</span><h2>Trending now</h2></div><span className="vybe-section-note">Marked by the VYBE editorial team</span></div>
      <div className="vybe-shelf-grid">{trendingItems.map((item, index) => <CreationCard key={item.id} item={item} index={index} previewMode={previewMode} />)}</div>
    </section>}

    <section className="vybe-discovery" id="discover" aria-labelledby="vybe-discovery-title">
      <div className="vybe-section-heading"><div><span className="vybe-label">THE CREATIVE INDEX</span><h2 id="vybe-discovery-title">Find your next world.</h2></div><span className="vybe-section-note">{total} {total === 1 ? "creation" : "creations"} · made to be remixed</span></div>
      {categories.length > 0 && <nav className="vybe-category-nav" aria-label="Browse VYBE categories">
        <button type="button" className={!category ? "is-active" : ""} onClick={() => { setPage(1); setCategory(""); }}>All</button>
        {categories.map((item) => <button type="button" key={item} className={category === item ? "is-active" : ""} onClick={() => { setPage(1); setCategory(category === item ? "" : item); }}>{item}</button>)}
      </nav>}
      <div className="vybe-toolbar">
        <label className="vybe-search"><Search size={18} /><input type="search" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search styles, models, ideas…" aria-label="Search VYBE creations" /><kbd>↵</kbd></label>
        <label className="vybe-select"><span className="sr-only">Filter category</span><select value={category} onChange={(event) => { setPage(1); setCategory(event.target.value); }}><option value="">All categories</option>{(categories.length ? categories : ["Images", "Video", "Art", "Design", "3D", "Apps", "Games"]).map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={15} /></label>
        <label className="vybe-select"><span className="sr-only">Filter creation type</span><select value={contentType} onChange={(event) => { setPage(1); setContentType(event.target.value); }}><option value="">All formats</option>{contentTypes.map((item) => <option key={item} value={item}>{item === "3d" ? "3D" : item[0].toUpperCase() + item.slice(1)}</option>)}</select><ChevronDown size={15} /></label>
        <label className="vybe-select"><span className="sr-only">Filter by model</span><select value={model} onChange={(event) => { setPage(1); setModel(event.target.value); }}><option value="">All models</option>{models.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={15} /></label>
        <label className="vybe-tag-filter"><span className="sr-only">Filter by tag</span><input value={tag} onChange={(event) => { setPage(1); setTag(event.target.value); }} placeholder="Tag…" /></label>
        <label className="vybe-select"><span className="sr-only">Sort creations</span><select value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }}><option value="featured">Featured first</option><option value="newest">Recently added</option><option value="title">Title A–Z</option></select><ChevronDown size={15} /></label>
        {(query || category || contentType || model || tag || sort !== "featured") && <button className="vybe-clear-filters" type="button" onClick={clearFilters}><X size={14} /> Clear filters</button>}
      </div>
      {previewMode && <p className="vybe-preview-note">Administrator-only preview. Private drafts are labeled and are never served from public VYBE endpoints.</p>}
      {error && <div className="vybe-state vybe-state--error" role="alert"><strong>Couldn’t load the creative index.</strong><p>{error}</p></div>}
      {loading && <div className="vybe-card-grid" aria-label="Loading VYBE creations">{Array.from({ length: 6 }, (_, index) => <div className="vybe-card-skeleton" key={index} />)}</div>}
      {!loading && !error && items.length > 0 && <div className="vybe-card-grid">
        {items.map((item, index) => <CreationCard key={item.id} item={item} index={index} previewMode={previewMode} />)}
      </div>}
      {!loading && !error && items.length === 0 && <div className="vybe-state"><Sparkles size={20} /><strong>Nothing in this direction yet.</strong><p>Try a different search or open up the filters.</p><button className="vybe-clear-filters" type="button" onClick={clearFilters}>Clear all filters</button></div>}
      {pageCount > 1 && <nav className="vybe-pagination" aria-label="VYBE pages"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ArrowLeft size={15} /> Previous</button><span>{String(page).padStart(2, "0")} <i>/</i> {String(pageCount).padStart(2, "0")}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next <ArrowUpRight size={15} /></button></nav>}
    </section>
    {recentItems.length > 0 && <section className="vybe-shelf vybe-recent" aria-label="Recently added creations">
      <div className="vybe-section-heading"><div><span className="vybe-label">FRESH SIGNALS</span><h2>Recently added</h2></div><span className="vybe-section-note">The latest published work</span></div>
      <div className="vybe-shelf-grid">{recentItems.map((item, index) => <CreationCard key={item.id} item={item} index={index} previewMode={previewMode} />)}</div>
    </section>}
    <footer className="vybe-footer"><span>VYBE / KEEP MAKING STRANGE THINGS</span><WandSparkles size={17} /><span>NOTHING HERE IS THE FINAL FORM.</span></footer>
  </main>;
}

function CreationCard({ item, index, featured = false, previewMode = false }: { item: VybeCreation; index: number; featured?: boolean; previewMode?: boolean }) {
  const preview = item.imageUrl || item.posterUrl || item.mediaAssets?.find((asset) => asset.type === "image")?.url || "";
  const typeLabel = item.contentType === "3d" ? "3D" : item.contentType;
  return <article className={`vybe-card${featured ? " vybe-card--featured" : ""}`} style={{ "--card-index": index } as React.CSSProperties}>
    <Link href={`/vybe/${item.slug}${previewMode ? "?preview=1" : ""}`} className="vybe-card__link" aria-label={`Explore ${item.title}`}>
      <div className="vybe-card__art">
        {preview ? <img src={preview} alt={item.imageAlt || item.title} loading="lazy" decoding="async" width="900" height="700" /> : <div className="vybe-card__placeholder"><Sparkles size={27} /><span>ARTWORK IN PROGRESS</span></div>}
        <div className="vybe-card__art-shade" />
        <div className="vybe-card__top"><span>{item.category}</span><span>{item.featured ? "FEATURED" : typeLabel.toUpperCase()}</span></div>
        {item.videoUrl && <span className="vybe-card__play"><Film size={14} /> Motion</span>}
        {previewMode && item.status !== "PUBLISHED" && <span className="vybe-card__draft">{item.status}</span>}
        <div className="vybe-card__reveal"><span>{item.model || item.models?.[0] || "Creative prompt"}</span><span>Open creation <ArrowUpRight size={15} /></span></div>
      </div>
      <div className="vybe-card__body"><div className="vybe-card__title-row"><h3>{item.title}</h3>{item.trending && <span className="vybe-trending">TRENDING</span>}</div><p>{item.shortDescription}</p><div className="vybe-card__meta"><span>{typeLabel}</span>{item.model && <span>{item.model}</span>}{item.tags?.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
    </Link>
  </article>;
}

export function VybeCreationPage({ previewMode = false }: { previewMode?: boolean }) {
  const { slug = "" } = useParams<{ slug: string }>();
  const launched = import.meta.env.VITE_VYBE_ENABLED === "true";
  const enabled = previewMode || launched;
  const [item, setItem] = useState<VybeCreation | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    document.title = pageTitle(previewMode ? "VYBE Preview" : enabled ? "Creation VYBE" : "VYBE Coming soon");
    let robots = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = launched && !previewMode ? "index,follow" : "noindex,nofollow";
    let active = true;
    if (!enabled) {
      return () => {
        active = false;
        robots?.remove();
      };
    }
    fetchJson<VybeCreation>(
      previewMode
        ? `/api/admin/vybe/preview/${encodeURIComponent(slug)}`
        : `/api/vybe/${encodeURIComponent(slug)}`,
      { credentials: "include" },
    )
      .then((value) => { if (active) setItem(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "This creation could not be loaded."); });
    return () => { active = false; };
  }, [enabled, launched, previewMode, slug]);

  if (!enabled) return <div className="vybe-closed vybe-closed--detail"><span className="vybe-eyebrow"><span /> A private creative universe</span><h1>VYBE is in the making.</h1><p>This creative space is being prepared.</p><Link href="/recipes" className="vybe-back-link"><ArrowLeft size={16} /> Explore TaskBakeAI recipes</Link></div>;
  if (error || !item) return <div className="vybe-state vybe-state--detail" role={error ? "alert" : "status"}><strong>{error ? "Creation unavailable" : "Tuning the signal…"}</strong>{error && <p>{error}</p>}<Link href="/vybe"><ArrowLeft size={15} /> Back to VYBE</Link></div>;

  const assets = [...(item.exampleOutputs ?? []), ...(item.visualReferences ?? [])];
  const preview = item.imageUrl || item.posterUrl || assets.find((asset) => asset.type === "image")?.url;
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopied(true);
      setCopyError("");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError("Clipboard access is unavailable in this browser.");
    }
  };

  const copyRefinement = async () => {
    try {
      await navigator.clipboard.writeText(item.refinementInstructions);
      setCopied(true);
      setCopyError("");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError("Clipboard access is unavailable in this browser.");
    }
  };

  return <main className="vybe-detail">
    <div className="vybe-detail__top"><Link href="/vybe"><ArrowLeft size={15} /> All creations</Link><span>VYBE / {item.contentType.toUpperCase()}</span></div>
    {previewMode && <div className={`vybe-detail__preview-status ${item.status === "PUBLISHED" ? "" : "is-private"}`}>{item.status === "PUBLISHED" ? "ADMIN PREVIEW · PUBLISHED" : `PRIVATE PREVIEW · ${item.status}`}</div>}
    <section className="vybe-detail__hero">
      <div className="vybe-detail__visual">{item.videoUrl ? <video src={item.videoUrl} poster={item.posterUrl || preview} controls playsInline preload="metadata" /> : preview ? <img src={preview} alt={item.imageAlt || item.title} fetchPriority="high" decoding="async" /> : <div className="vybe-card__placeholder"><Sparkles size={30} /><span>VISUAL EXPERIMENT</span></div>}</div>
      <div className="vybe-detail__intro"><span className="vybe-label">{item.category} / {item.contentType}</span><h1>{item.title}</h1><p>{item.shortDescription}</p><div className="vybe-card__meta">{(item.models?.length ? item.models : [item.model]).filter(Boolean).map((model) => <span key={model}>{model}</span>)}{item.tags?.map((tag) => <span key={tag}>#{tag}</span>)}</div><span className="vybe-detail__scroll">SCROLL TO EXPLORE <ArrowDownRight size={15} /></span></div>
    </section>
    <section className="vybe-detail__content">
      <div className="vybe-detail__main">
        <span className="vybe-label">THE IDEA</span><h2>Start with a feeling.</h2><p className="vybe-detail__description">{item.description}</p>
        {item.contentType === "video" && <div className="vybe-spec-grid"><Spec title="Scene" value={item.scene} /><Spec title="Motion" value={item.motion} /><Spec title="Camera" value={item.cameraInstructions} /><Spec title="Duration" value={item.durationSeconds ? `${item.durationSeconds} sec` : ""} /></div>}
        {(item.contentType === "image" || item.contentType === "art" || item.contentType === "design" || item.contentType === "3d") && <div className="vybe-spec-grid"><Spec title="Visual style" value={item.style} /><Spec title="Aspect ratio" value={item.aspectRatio} /><Spec title="Parameters" value={Object.entries(item.parameters ?? {}).map(([key, value]) => `${key}: ${String(value)}`).join("\n")} /></div>}
        {(item.contentType === "app" || item.contentType === "game") && <div className="vybe-prompt-block"><div className="vybe-prompt-block__top"><span>BUILDER INSTRUCTIONS</span><span>{(item.tools ?? []).join(" · ")}</span></div><pre>{item.builderInstructions}</pre>{item.demoUrl && <a className="vybe-outbound" href={item.demoUrl} target="_blank" rel="noopener noreferrer">Open demo <ExternalLink size={15} /></a>}</div>}
        {item.contentType === "interactive" && item.experienceUrl && <div className="vybe-interactive"><span className="vybe-label">VERIFIED EXPERIENCE</span><h3>Step inside.</h3><p>{item.verificationDetails}</p>{(item.experienceControls ?? []).length > 0 && <ul>{(item.experienceControls ?? []).map((control) => <li key={control}>{control}</li>)}</ul>}<a className="vybe-primary-action" href={item.experienceUrl} target="_blank" rel="noopener noreferrer">Play experience <ArrowUpRight size={16} /></a></div>}
        {item.prompt && <div className="vybe-prompt-block"><div className="vybe-prompt-block__top"><span>THE PROMPT</span><button type="button" onClick={() => void copyPrompt()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy prompt"}</button></div><pre>{item.prompt}</pre>{item.negativePrompt && <><span className="vybe-label">NEGATIVE PROMPT</span><pre>{item.negativePrompt}</pre></>}</div>}
        {item.refinementInstructions && <div className="vybe-refinement"><div className="vybe-refinement__heading"><span className="vybe-label">KEEP EXPLORING</span><button type="button" onClick={() => void copyRefinement()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy refinement"}</button></div><p>{item.refinementInstructions}</p></div>}
        {copyError && <p className="vybe-copy-error" role="status">{copyError}</p>}
        {item.verificationDetails && item.contentType !== "interactive" && <div className="vybe-refinement"><span className="vybe-label">VERIFIED</span><p>{item.verificationDetails}</p></div>}
      </div>
      <aside className="vybe-detail__aside"><span className="vybe-label">EXAMPLE OUTPUTS</span>{assets.length ? <div className="vybe-output-grid">{assets.map((asset, index) => <figure key={`${asset.assetId ?? asset.url}-${index}`}>{asset.type === "video" ? <video src={asset.url} controls playsInline preload="none" /> : <img src={asset.url} alt={asset.alt} loading="lazy" decoding="async" />}{asset.caption && <figcaption>{asset.caption}</figcaption>}</figure>)}</div> : <p className="vybe-no-output">No example outputs attached.</p>}</aside>
    </section>
    <footer className="vybe-footer"><span>VYBE / REMIX THE IMPOSSIBLE</span><Sparkles size={17} /><Link href="/vybe">Back to discovery</Link></footer>
  </main>;
}

function Spec({ title, value }: { title: string; value: string }) {
  if (!value) return null;
  return <div className="vybe-spec"><span>{title}</span><p>{value}</p></div>;
}
