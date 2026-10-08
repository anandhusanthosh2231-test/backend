import { useEffect, useMemo, useRef, useState } from 'react';
import './loader.css';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import {
  AlertCircle, ArrowRight, BarChart3, Bookmark, BookmarkCheck, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Clock3, Copy, ExternalLink, Eye, EyeOff, FileText, Filter, Flame,
  History, Info, Key, Layers, LayoutDashboard, Lock, Menu, PenLine, Phone, Plus, RefreshCw,
  Search, Send, Share2, Shield, ShieldAlert, ShieldCheck, Sliders, Smartphone, Sparkles, Tag, ThumbsUp, Trash2, Upload,
  TrendingUp, Unlock, Users, Wand2, X, Zap,
} from 'lucide-react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import {
  getGetAudienceQueryKey, getGetCategoryQueryKey, getGetRecipeQueryKey, getGetRelatedRecipesQueryKey,
  getGetAdminSummaryQueryKey, getGetHomeQueryKey, getListAdminRecipesQueryKey, getListAdminSubmissionsQueryKey, getListRecipesQueryKey, getListSavedRecipesQueryKey,
  useCreateAdminRecipe, useCreateSubmission, useDeleteAdminRecipe, useDuplicateAdminRecipe,
  useGenerateDraftRecipe, useGetAdminAnalytics, useGetAdminSummary, useGetAudience, useGetCategory,
  useGetHome, useGetMe, useGetRecipe, useGetRelatedRecipes, useListAdminRecipes,
  useImportAdminRecipesCsv, useListAdminSubmissions, useListAudiences, useListCategories, useListHistory, useListRecipes,
  useListSavedRecipes, useSaveRecipe, useSubmitFeedback, useTrackEvent, useUnsaveRecipe,
  useUpdateAdminRecipe, useUpdateAdminSubmission,
} from '@workspace/api-client-react';
import type { EventInput, ImportAdminRecipesResponse, Recipe, RecipeCard, RecipeGuide, RecipeInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MobileBottomNav } from '@/components/mobile/MobileBottomNav';
import { MobileTopHeader } from '@/components/mobile/MobileTopHeader';
import { MobileCategoryChips } from '@/components/mobile/MobileCategoryChips';
import { MobileBannerCarousel } from '@/components/mobile/MobileBannerCarousel';
import { useMobileEnforcement } from '@/hooks/useMobileEnforcement';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const clerkProxyUrl = import.meta.env.DEV ? "" : import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  variables: {
    colorPrimary: '#272235', colorForeground: '#272235', colorMutedForeground: '#766f7d',
    colorDanger: '#ad3f36', colorBackground: '#fffdf7', colorInput: '#f5f0e5',
    colorInputForeground: '#272235', colorNeutral: '#ddd4c5', fontFamily: 'DM Sans',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf7] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#ddd4c5]',
    card: '!shadow-none !border-0 !bg-transparent',
    footer: '!shadow-none !border-0 !bg-transparent',
    headerTitle: 'text-[#272235] font-semibold',
    headerSubtitle: 'text-[#766f7d]',
    socialButtonsBlockButtonText: 'text-[#272235]',
    formFieldLabel: 'text-[#272235]',
    footerActionLink: 'text-[#ad3f36] font-semibold',
    footerActionText: 'text-[#766f7d]',
    dividerText: 'text-[#766f7d]',
    formButtonPrimary: 'bg-[#272235] hover:bg-[#3d3452] text-[#fffdf7]',
    formFieldInput: 'bg-[#f5f0e5] text-[#272235] border-[#ddd4c5]',
    logoBox: 'h-10',
    logoImage: 'h-10',
    socialButtonsBlockButton: 'border-[#ddd4c5] bg-[#fffdf7]',
    footerAction: 'border-[#ddd4c5]',
    main: 'bg-transparent',
  },
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
};

function usePageMeta(title: string, description: string, structured?: unknown) {
  useEffect(() => {
    document.title = title;
    const setMeta = (name: string, content: string, property = false) => {
      const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let tag = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!tag) { tag = document.createElement('meta'); property ? tag.setAttribute('property', name) : tag.setAttribute('name', name); document.head.appendChild(tag); }
      tag.content = content;
    };
    setMeta('description', description);
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:type', 'website', true);
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = window.location.href.split('?')[0];
    const existing = document.head.querySelector('script[data-recipe-schema]');
    if (existing) existing.remove();
    if (structured) {
      const script = document.createElement('script');
      script.type = 'application/ld+json'; script.dataset.recipeSchema = 'true'; script.textContent = JSON.stringify(structured); document.head.appendChild(script);
    }
    return () => { if (structured) document.head.querySelector('script[data-recipe-schema]')?.remove(); };
  }, [title, description, structured]);
}

function Logo() {
  return <Link href="/" className="brand-mark" data-testid="link-logo"><span className="brand-dot" />AI Recipes</Link>;
}

function Header() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { isSignedIn } = useAuth();
  const links = [['/recipes', 'Discover'], ['/categories', 'Categories'], ['/audiences', 'Collections'], ['/about', 'About']];
  return <header className="site-header">
    <div className="shell header-inner">
      <Logo />
       <nav className={`main-nav ${open ? 'is-open' : ''}`} aria-label="Primary navigation">
        {links.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={location.startsWith(href) ? 'active' : ''} data-testid={`link-nav-${label.toLowerCase()}`}>{label}</Link>)}
      </nav>
        <div className="header-actions">
         <Link href="/search" className="icon-button" aria-label="Search" data-testid="link-search"><Search size={18} /></Link>
         <Link href="/submit" className="header-create-link" data-testid="link-header-submit"><PenLine size={14} /> Create</Link>
        {isSignedIn ? <Link href="/saved" className="icon-button" aria-label="Saved recipes" data-testid="link-saved-nav"><Bookmark size={18} /></Link> : null}
        {isSignedIn ? <Link href="/profile" className="avatar-chip" data-testid="link-profile">AR</Link> : <Link href="/sign-in" className="text-button" data-testid="link-sign-in">Sign in</Link>}
        {!isSignedIn && <Link href="/sign-up" className="button button-small" data-testid="link-sign-up">Join free</Link>}
        <button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle menu" data-testid="button-menu">{open ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div>
  </header>;
}

function Footer() {
  return <footer className="site-footer"><div className="shell footer-grid">
    <div><Logo /><p className="footer-note">A practical field guide to doing better work with AI.</p></div>
    <div><span className="footer-label">Explore</span><Link href="/recipes">All recipes</Link><Link href="/categories">Categories</Link><Link href="/audiences">For every kind of work</Link></div>
    <div><span className="footer-label">The project</span><Link href="/about">About AI Recipes</Link><Link href="/submit">Share a workflow</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
    <div className="footer-signal"><span className="signal-dot" />Tested in the real world<br /><span>Built for India, useful everywhere.</span></div>
  </div><div className="shell footer-bottom"><span>© 2025 AI Recipes</span><span>Practical beats impressive.</span></div></footer>;
}

function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <MobileTopHeader />
      <main>{children}</main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}

function LoadingState({ label = 'Finding useful workflows' }: { label?: string }) {
  return (
    <div className="loading-state" data-testid="status-loading">
      <section className="loader">
        <div className="slider" style={{ '--i': 0 } as React.CSSProperties}></div>
        <div className="slider" style={{ '--i': 1 } as React.CSSProperties}></div>
        <div className="slider" style={{ '--i': 2 } as React.CSSProperties}></div>
        <div className="slider" style={{ '--i': 3 } as React.CSSProperties}></div>
        <div className="slider" style={{ '--i': 4 } as React.CSSProperties}></div>
      </section>
      <p style={{ marginTop: '2rem' }}>{label}<span className="loading-ellipsis">...</span></p>
    </div>
  );
}

function ErrorState({ retry }: { retry?: () => void }) {
  return <div className="state-panel error-state" data-testid="status-error"><span className="state-kicker">Something went sideways</span><h2>We could not load this page.</h2><p>Try again in a moment. If it keeps happening, the recipe shelf is still here when you return.</p>{retry && <button className="button button-dark" onClick={retry} data-testid="button-retry">Try again</button>}</div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="state-panel empty-state" data-testid="status-empty"><span className="empty-icon"><Sparkles size={20} /></span><h2>{title}</h2><p>{body}</p>{action}</div>;
}

function RecipeCardView({ recipe, saved = false, onSave }: { recipe: RecipeCard; saved?: boolean; onSave?: (recipe: RecipeCard) => void }) {
  return <article className={`recipe-card category-${recipe.categorySlug}`} data-testid={`card-recipe-${recipe.id}`}>
    <div className="card-topline"><span className="category-pill">{recipe.category}</span>{recipe.trending && <span className="trend-label"><Flame size={12} /> Trending</span>}</div>
    <Link href={`/recipes/${recipe.slug}`} className="card-title-link" data-testid={`link-recipe-${recipe.id}`}><h3>{recipe.title}</h3></Link>
    <p className="card-description">{recipe.shortDescription}</p>
    <div className="card-meta-chips"><span className="meta-chip"><Clock3 size={12} /> {recipe.estimatedTime}</span><span className="meta-chip">{recipe.difficulty}</span><span className="meta-chip">{recipe.language}</span></div>
    {recipe.tags?.length ? <div className="card-tags">{recipe.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
    <div className="card-footer">
      <span className="card-stat"><Eye size={12} /> {recipe.viewCount.toLocaleString()}</span>
      <span className="card-open-cta">Open Recipe <ArrowRight size={13} /></span>
      <button className={`save-button ${saved ? 'saved' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSave?.(recipe); }} aria-label={saved ? 'Remove saved recipe' : 'Save recipe'} data-testid={`button-save-${recipe.id}`}>{saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}</button>
    </div>
  </article>;
}

function RecipeGrid({ recipes, savedIds, onSave }: { recipes: RecipeCard[]; savedIds?: Set<number>; onSave?: (r: RecipeCard) => void }) {
  if (!recipes.length) return <EmptyState title="No recipes found yet" body="Try a broader search, or tell us what workflow you need next." action={<Link href="/submit" className="button button-dark" data-testid="link-submit-empty">Suggest a workflow <ArrowRight size={16} /></Link>} />;
  return <div className="recipe-grid">{recipes.map((recipe) => <RecipeCardView key={recipe.id} recipe={recipe} saved={savedIds?.has(recipe.id)} onSave={onSave} />)}</div>;
}

function RecipeGridSkeleton({ count = 6 }: { count?: number }) {
  return <div className="recipe-grid" data-testid="status-loading-grid" aria-label="Loading recipes">{Array.from({ length: count }).map((_, i) => <div className="recipe-card-skeleton" key={i}><div className="skeleton-block sk-eyebrow" /><div className="skeleton-block sk-title" /><div className="skeleton-block sk-line" /><div className="skeleton-block sk-line short" /><div className="skeleton-block sk-meta" /></div>)}</div>;
}

function SaveAction({ recipe, isSaved = false }: { recipe: RecipeCard | Recipe; isSaved?: boolean }) {
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(isSaved);
  const save = useSaveRecipe();
  const unsave = useUnsaveRecipe();
  const handle = () => {
    if (!isSignedIn) { setLocation('/sign-in'); return; }
    setSaved(!saved);
    const mutation = saved ? unsave : save;
    mutation.mutate({ recipeId: recipe.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSavedRecipesQueryKey() }); } });
  };
  return <button className={`button button-save ${saved ? 'button-saved' : ''}`} onClick={handle} data-testid="button-save-recipe">{saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}{saved ? 'Saved to your shelf' : 'Save recipe'}</button>;
}

function HomePage() {
  const { data, isLoading, isError, refetch } = useGetHome();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const exampleSearches = ['Create a LinkedIn post', 'Build a presentation', 'Analyze data', 'Create an Instagram campaign', 'Study for an exam', 'Generate an image'];
  const runExampleSearch = (example: string) => setLocation(`/search?q=${encodeURIComponent(example)}`);
  usePageMeta('AI Recipes — Practical AI workflows for real work', 'A trusted, Indian-first field guide to practical AI workflows you can copy, run, and make your own.');
  if (isLoading) return <SiteShell><LoadingState /></SiteShell>;
  if (isError || !data) return <SiteShell><ErrorState retry={() => refetch()} /></SiteShell>;
  return <SiteShell>
    <MobileCategoryChips categories={data.categories} />
    <MobileBannerCarousel recipeOfDay={data.recipeOfDay} />
    <div className="home-hero"><div className="shell hero-grid"><div className="hero-copy"><span className="kicker"><span className="kicker-mark" />A field guide for the AI age</span><h1>Practical AI workflows you can actually use.</h1><p>Tested, outcome-focused recipes for writing, studying, running a business, making things, and getting through the everyday.</p><div className="hero-cta-row"><Link href="/recipes" className="button button-dark" data-testid="link-hero-explore">Explore Recipes <ArrowRight size={16} /></Link><Link href="/submit" className="button button-outline" data-testid="link-hero-create">Create a Recipe</Link></div><form className="hero-search" onSubmit={(e) => { e.preventDefault(); if (search.trim()) setLocation(`/search?q=${encodeURIComponent(search.trim())}`); }}><Search size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search AI recipes, workflows, and use cases..." aria-label="Search workflows" data-testid="input-home-search" /><button type="submit" data-testid="button-home-search">Search <ArrowRight size={16} /></button></form><div className="hero-examples">{exampleSearches.map((example) => <button key={example} type="button" className="hero-example-chip" onClick={() => runExampleSearch(example)} data-testid={`chip-example-${example.toLowerCase().replace(/\s+/g, '-')}`}>{example}</button>)}</div><div className="hero-proof"><span className="proof-avatars"><i>AS</i><i>RK</i><i>MP</i></span><span>Made for real work, not prompt theatre.</span></div></div><div className="hero-art"><div className="hero-index-card"><span className="hero-index-card__label">A curated index</span><strong>01—30</strong><span>tested workflows<br />for the workday</span><i>AI<br />RECIPES</i></div><div className="hero-side-note"><span>FIELD NOTE / 001</span><strong>Start with the problem.</strong><p>Not the tool.</p></div><div className="hero-art-footer"><span>Vol. 01</span><span>India / Everywhere</span></div></div></div></div>
    <section className="shell home-section feature-section">{data.recipeOfDay && <div className="feature-card"><div className="feature-side"><span className="kicker">Recipe of the day</span><span className="feature-number">01</span><p>One thoughtful workflow, picked for the way people actually work today.</p></div><div className="feature-main"><div className="card-topline"><span className="eyebrow">{data.recipeOfDay.category}</span><span className="verified-label"><Check size={13} /> Tested workflow</span></div><Link href={`/recipes/${data.recipeOfDay.slug}`} data-testid="link-recipe-of-day"><h2>{data.recipeOfDay.title}</h2></Link><p>{data.recipeOfDay.shortDescription}</p><div className="feature-bottom"><span><Clock3 size={14} /> {data.recipeOfDay.estimatedTime}</span><Link href={`/recipes/${data.recipeOfDay.slug}`} className="arrow-link" data-testid="link-recipe-of-day-read">Read the recipe <ArrowRight size={16} /></Link></div></div></div>}</section>
    <section className="shell home-section"><div className="section-heading"><div><span className="kicker">The shelf, refreshed</span><h2>For the thing you need to do next.</h2></div><Link href="/recipes" className="arrow-link" data-testid="link-all-recipes">Browse all recipes <ArrowRight size={16} /></Link></div><RecipeGrid recipes={data.trending || []} /></section>
    <section className="categories-band"><div className="shell home-section"><div className="section-heading"><div><span className="kicker">Browse by context</span><h2>Start where the work lives.</h2></div></div><div className="category-list">{data.categories.map((category) => <Link href={`/categories/${category.slug}`} className="category-row" key={category.id} data-testid={`link-category-${category.id}`}><span className="category-index">{String(category.id).padStart(2, '0')}</span><span className="category-name">{category.name}</span><span className="category-count">{category.recipeCount} recipes</span><ArrowRight size={18} /></Link>)}</div></div></section>
     <section className="shell home-section audience-section"><div><span className="kicker">Made for</span><h2>Different desks.<br /><em>Same clarity.</em></h2></div><div className="audience-pills">{data.audiences.map((audience) => <Link href={`/audiences/${audience.slug}`} key={audience.id} className="audience-pill" data-testid={`link-audience-${audience.id}`}>{audience.name}<span>{audience.recipeCount}</span></Link>)}</div></section>
     <section className="creator-cta"><div className="shell creator-cta-inner"><div><span className="kicker">Make the shelf better</span><h2>Have a workflow that actually works?</h2><p>Share the problem, the prompt, and what happened. Good submissions become tested recipes for everyone.</p></div><div className="creator-cta-actions"><Link href="/submit" className="button button-light" data-testid="link-home-submit">Share your workflow <ArrowRight size={16} /></Link><div className="creator-steps"><span><b>01</b> Tell us the moment</span><span><b>02</b> Add the workflow</span><span><b>03</b> We test the result</span></div></div></div></section>
  </SiteShell>;
}

function LibraryPage() {
  const initial = new URLSearchParams(window.location.search);
  const [q, setQ] = useState(initial.get('q') || '');
  const [page, setPage] = useState(Number(initial.get('page') || 1));
  const [category, setCategory] = useState('');
  const [audience, setAudience] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState<'relevance' | 'popular' | 'newest'>('relevance');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const params = useMemo(() => ({ q: q || undefined, category: category || undefined, audience: audience || undefined, difficulty: difficulty || undefined, page, pageSize: 9, sort }), [q, category, audience, difficulty, page, sort]);
  const query = useListRecipes(params);
  const { data: categories } = useListCategories();
  const { data: audiences } = useListAudiences();
  const [savedIds] = useState(() => new Set<number>());
  const [, setLocation] = useLocation();
  usePageMeta(q ? `Search results for ${q} — AI Recipes` : 'Recipe library — AI Recipes', 'Browse practical, tested AI workflows for work, study, business, creativity, and everyday life.');
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchInputRef.current?.focus(); } };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const submit = (e: FormEvent) => { e.preventDefault(); setPage(1); setLocation(`/recipes${q ? `?q=${encodeURIComponent(q)}` : ''}`); };
  const onSave = (recipe: RecipeCard) => { if (!savedIds.has(recipe.id)) savedIds.add(recipe.id); else savedIds.delete(recipe.id); setLocation(`/sign-in?redirect_url=${encodeURIComponent(`/recipes/${recipe.slug}`)}`); };
  const clearFilters = () => { setQ(''); setCategory(''); setAudience(''); setDifficulty(''); setPage(1); setMobileFiltersOpen(false); };
  const activeFilterCount = [category, audience, difficulty].filter(Boolean).length;
  const hasResults = (query.data?.items.length ?? 0) > 0;
  const isEmpty = !query.isLoading && !query.isError && !hasResults;
  const filterControls = <><div className="category-chip-row">
    <button type="button" className={`filter-chip ${!category ? 'active' : ''}`} onClick={() => { setCategory(''); setPage(1); }} data-testid="chip-category-all">All</button>
    {categories?.map((c) => <button key={c.id} type="button" className={`filter-chip ${category === c.slug ? 'active' : ''}`} onClick={() => { setCategory(c.slug); setPage(1); }} data-testid={`chip-category-${c.slug}`}>{c.name}</button>)}
  </div><div className="secondary-filter-row">
    <label className="pill-select"><span>Audience</span><select value={audience} onChange={(e) => { setAudience(e.target.value); setPage(1); }} data-testid="select-audience"><option value="">Everyone</option>{audiences?.map((a) => <option key={a.id} value={a.slug}>{a.name}</option>)}</select></label>
    <label className="pill-select"><span>Difficulty</span><select value={difficulty} onChange={(e) => { setDifficulty(e.target.value); setPage(1); }} data-testid="select-difficulty"><option value="">Any</option><option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option></select></label>
  </div></>;
  return <SiteShell>
    <MobileCategoryChips categories={categories} activeSlug={category} onSelectCategory={(slug) => { setCategory(slug); setPage(1); }} />
    <div className="library-hero shell">
      <span className="kicker">AI recipe library</span>
      <h1>Explore AI Recipes</h1>
      <p>Practical AI workflows for work, business, creativity, study, coding, and everyday life.</p>
      {!query.isLoading && !query.isError && <span className="result-count" data-testid="text-result-count">{query.data?.total ?? 0} recipes</span>}
      <form className="library-search library-search-lg" onSubmit={submit}>
        <Search size={19} />
        <input ref={searchInputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes, workflows, tools, and use cases..." aria-label="Search recipes" data-testid="input-library-search" />
        {q && <button type="button" className="search-clear" onClick={() => setQ('')} aria-label="Clear search" data-testid="button-search-clear"><X size={15} /></button>}
        <kbd className="search-kbd">Ctrl K</kbd>
        <button type="submit" data-testid="button-library-search">Search</button>
      </form>
    </div>
    <section className="shell library-layout-modern">
      <div className="filter-bar-desktop">{filterControls}</div>
      <button type="button" className="filter-toggle-mobile" onClick={() => setMobileFiltersOpen(true)} data-testid="button-open-filters"><Filter size={15} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</button>
      <div className="results-toolbar"><span>{query.data?.total ?? 0} recipes</span><select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} aria-label="Sort recipes" data-testid="select-sort"><option value="relevance">Most relevant</option><option value="popular">Most copied</option><option value="newest">Newest tested</option></select></div>
      {query.isLoading ? <RecipeGridSkeleton /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : isEmpty ? <EmptyState title="No recipes found" body="Try another search or clear your filters." action={<button type="button" className="button button-dark" onClick={clearFilters} data-testid="button-clear-filters">Clear filters</button>} /> : <RecipeGrid recipes={query.data?.items || []} savedIds={savedIds} onSave={onSave} />}
      {hasResults && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page" data-testid="button-page-prev"><ChevronLeft size={17} /></button><span>Page {page} of {Math.max(1, Math.ceil((query.data?.total || 0) / 9))}</span><button disabled={!query.data || page >= Math.ceil(query.data.total / 9)} onClick={() => setPage(page + 1)} aria-label="Next page" data-testid="button-page-next"><ChevronRight size={17} /></button></div>}
    </section>
    {mobileFiltersOpen && <div className="mobile-filter-sheet-backdrop" onClick={() => setMobileFiltersOpen(false)}>
      <div className="mobile-filter-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-filter-sheet-header"><span>Filters</span><button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters" data-testid="button-close-filters"><X size={18} /></button></div>
        {filterControls}
        <button type="button" className="button button-dark sheet-apply" onClick={() => setMobileFiltersOpen(false)} data-testid="button-apply-filters">Show results</button>
      </div>
    </div>}
  </SiteShell>;
}

function RecipePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const query = useGetRecipe(slug, {
    query: { queryKey: getGetRecipeQueryKey(slug) },
  });
  const related = useGetRelatedRecipes(
    slug,
    { limit: 3 },
    { query: { queryKey: getGetRelatedRecipesQueryKey(slug, { limit: 3 }) } },
  );
  const track = useTrackEvent();
  const feedback = useSubmitFeedback();
  const [copied, setCopied] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackReasonsOpen, setFeedbackReasonsOpen] = useState(false);
  const [situationSelection, setSituationSelection] = useState<{ slug: string; value: string } | null>(null);
  const [selectedRefinement, setSelectedRefinement] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [copyError, setCopyError] = useState(false);
  const selectedSituation = situationSelection?.slug === slug ? situationSelection.value : '';
  const updateSelectedSituation = (value: string) => setSituationSelection({ slug, value });
  useEffect(() => {
    setVariableValues({});
    setFeedbackSent(false);
    setSelectedRefinement('');
    try {
      setSituationSelection({ slug, value: localStorage.getItem(`recipe-situation:${slug}`) ?? '' });
    } catch {
      setSituationSelection({ slug, value: '' });
    }
  }, [slug]);
  useEffect(() => {
    if (situationSelection?.slug !== slug) return;
    try {
      if (situationSelection.value) localStorage.setItem(`recipe-situation:${slug}`, situationSelection.value);
      else localStorage.removeItem(`recipe-situation:${slug}`);
    } catch {
      // Local personalization is optional.
    }
  }, [slug, situationSelection]);
  useEffect(() => {
    if (query.data)
      track.mutate({ data: { type: "recipe_view", recipeId: query.data.id } });
  }, [query.data]);
  usePageMeta(
    query.data ? `${query.data.title} — AI Recipes` : "Recipe — AI Recipes",
    query.data?.seoDescription ||
      "A tested, practical AI workflow from AI Recipes.",
    query.data
      ? {
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: query.data.title,
          description: query.data.shortDescription,
          step:
            query.data.steps?.map((text, i) => ({
              "@type": "HowToStep",
              position: i + 1,
              text,
            })) || [],
        }
      : undefined,
  );
  if (query.isLoading)
    return (
      <SiteShell>
        <LoadingState label="Opening the recipe" />
      </SiteShell>
    );
  if (query.isError || !query.data)
    return (
      <SiteShell>
        <ErrorState retry={() => query.refetch()} />
      </SiteShell>
    );
  const recipe = query.data as Recipe & { guide?: RecipeGuideData | null };
  const guide = normalizeRecipeGuide(recipe.guide, recipe.requiredInputs);
  if (!recipe.guide?.quality && recipe.testedAt && recipe.testedWith?.length) {
    guide.quality = {
      status: "tested",
      lastTested: recipe.testedAt,
      version: recipe.version,
      testedWith: recipe.testedWith,
    };
  }
  const declaredVariables = guide.promptVariables ?? [];
  const variableFields: NonNullable<RecipeGuideData["promptVariables"]> = declaredVariables.length
    ? declaredVariables.map((variable) => ({
        ...variable,
        name: variable.name.trim().replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, ""),
      }))
    : [...recipe.prompt.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((match) => ({
        name: match[1] ?? "",
        label: (match[1] ?? "").replace(/[_-]+/g, " ").toLowerCase(),
        required: false,
      }));
  const missingRequiredPromptVariables = variableFields.some((variable) => variable.required && !variableValues[variable.name]?.trim());
  const chosenSituation = guide.situations?.find((item) => item.name === selectedSituation);
  const customizedPrompt = variableFields.reduce((prompt, variable) => {
    const escapedName = variable.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return prompt.replace(new RegExp(`\\{\\{\\s*${escapedName}\\s*\\}\\}`, "g"), variableValues[variable.name] ?? `{{${variable.name}}}`);
  }, recipe.prompt);
  const finalPrompt = chosenSituation?.promptModifier
    ? `${customizedPrompt}\n\nSituation-specific instructions:\n${chosenSituation.promptModifier}${selectedRefinement ? `\n\nRefinement:\n${selectedRefinement}` : ''}`
    : `${customizedPrompt}${selectedRefinement ? `\n\nRefinement:\n${selectedRefinement}` : ''}`;
  const trackGuideEvent = (
    type: EventInput["type"],
    metadata: NonNullable<EventInput["metadata"]> = {},
  ) => {
    track.mutate({ data: { type, recipeId: recipe.id, metadata: { category: recipe.category, ...metadata } } });
  };
  const copyPrompt = async () => {
    if (missingRequiredPromptVariables) return;
    try {
      await navigator.clipboard.writeText(finalPrompt);
      setCopyError(false);
      setCopied(true);
      trackGuideEvent("recipe_copy");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError(true);
    }
  };
  const share = async () => {
    if (navigator.share)
      await navigator.share({
        title: recipe.title,
        text: recipe.shortDescription,
        url: window.location.href,
      });
    else await navigator.clipboard?.writeText(window.location.href);
    trackGuideEvent("recipe_share");
  };
  const tools: NonNullable<RecipeGuideData["tools"]> = guide.tools?.length
    ? guide.tools
    : (recipe.aiTools ?? []).map((name) => ({ name, support: "compatible" as const }));
  const examples = guide.examples?.length
    ? guide.examples
    : recipe.exampleInput || recipe.exampleOutput
      ? [{ scenario: "Example", input: recipe.exampleInput, output: recipe.exampleOutput, whyItWorks: [] }]
      : [];
  const privacyNote = "Before you paste, remove passwords, payment details, private customer information, API keys, and confidential material unless your AI service and organization explicitly permit using it.";
  const tested = guide.quality?.status === "tested";
  const AI_PLATFORM_URLS: Record<string, string> = {
    'chatgpt': 'https://chat.openai.com',
    'gpt': 'https://chat.openai.com',
    'gpt-4': 'https://chat.openai.com',
    'gpt-5': 'https://chat.openai.com',
    'gpt-4o': 'https://chat.openai.com',
    'gpt-5.6': 'https://chat.openai.com',
    'openai': 'https://chat.openai.com',
    'claude': 'https://claude.ai',
    'claude 3': 'https://claude.ai',
    'claude 3.5': 'https://claude.ai',
    'claude 4': 'https://claude.ai',
    'anthropic': 'https://claude.ai',
    'gemini': 'https://gemini.google.com',
    'google gemini': 'https://gemini.google.com',
    'bard': 'https://gemini.google.com',
    'grok': 'https://grok.com',
    'grok 3': 'https://grok.com',
    'perplexity': 'https://www.perplexity.ai',
    'mistral': 'https://chat.mistral.ai',
    'le chat': 'https://chat.mistral.ai',
    'copilot': 'https://copilot.microsoft.com',
    'microsoft copilot': 'https://copilot.microsoft.com',
    'bing': 'https://copilot.microsoft.com',
    'llama': 'https://www.meta.ai',
    'meta ai': 'https://www.meta.ai',
    'luna': 'https://lunaai.app',
    'deepseek': 'https://chat.deepseek.com',
    'pi': 'https://pi.ai',
    'notion ai': 'https://www.notion.so/product/ai',
    'jasper': 'https://www.jasper.ai',
    'cohere': 'https://coral.cohere.com',
  };
  const getAIPlatformUrl = (name: string): string | undefined =>
    AI_PLATFORM_URLS[name.toLowerCase().trim()];
  const bestForItems = [
    ...(guide.bestFor?.people ?? []),
    ...(guide.bestFor?.tasks ?? []),
    ...(guide.bestFor?.channels ?? []),
  ];
  const sendFeedback = (helpful: boolean, note?: string) => {
    feedback.mutate(
      { data: { recipeId: recipe.id, helpful, note } },
      { onSuccess: () => setFeedbackSent(true) },
    );
    trackGuideEvent("recipe_feedback");
  };
  return (
    <SiteShell>
      <div className="recipe-hero shell">
        <div className="breadcrumbs">
          <Link href="/recipes" data-testid="link-breadcrumb-library">
            Library
          </Link>
          <ChevronRight size={14} />
          <Link
            href={`/categories/${recipe.categorySlug}`}
            data-testid="link-breadcrumb-category"
          >
            {recipe.category}
          </Link>
          <ChevronRight size={14} />
          <span>{recipe.title}</span>
        </div>
        <div className="recipe-hero-grid">
          <div>
            <div className="card-topline">
              <span className="eyebrow">{recipe.category}</span>
              {tested && (
                <span className="verified-label verified-label--pill">
                  <span className="verified-pulse" />
                  <Check size={11} strokeWidth={3} />
                  Tested
                  {guide.quality?.lastTested && (
                    <> · {new Date(guide.quality.lastTested).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</>
                  )}
                </span>
              )}
              {guide.quality?.status === "in_testing" && <span className="recipe-status-label recipe-status-label--testing">In testing</span>}
            </div>
            <h1>{recipe.title}</h1>
            <p className="recipe-lede">{recipe.shortDescription}</p>
            <div className="recipe-meta">
              <span>
                <Clock3 size={15} /> {recipe.estimatedTime}
              </span>
              <span>
                <Zap size={15} /> {recipe.difficulty}
              </span>
              <span>
                <Tag size={15} /> {recipe.language}
              </span>
            </div>
            <div className="recipe-actions">
              <SaveAction recipe={recipe} />
              <button
                className="button button-outline"
                onClick={share}
                data-testid="button-share-recipe"
              >
                <Share2 size={16} /> Share
              </button>
            </div>
          </div>
          {tested && (
            <div className="recipe-cert-card">
              <div className="cert-card-header">
                <div className="cert-check-mark">
                  <Check size={22} strokeWidth={3} />
                </div>
                <div className="cert-title-block">
                  <span className="cert-label">FIELD</span>
                  <span className="cert-label cert-label--accent">TESTED</span>
                </div>
                <div className="cert-corner-stripe" aria-hidden="true" />
              </div>
              <div className="cert-divider" />
              <div className="cert-body">
                {guide.quality?.lastTested && (
                  <div className="cert-row">
                    <span className="cert-row-label">Tested</span>
                    <strong className="cert-row-value">
                      {new Date(guide.quality.lastTested).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                    </strong>
                  </div>
                )}
                <div className="cert-row">
                  <span className="cert-row-label">Version</span>
                  <strong className="cert-row-value">v{guide.quality?.version || recipe.version}</strong>
                </div>
                {!!guide.quality?.testedWith?.length && (
                  <div className="cert-platforms">
                    <span className="cert-row-label">Works on</span>
                    <div className="cert-platform-list">
                      {guide.quality.testedWith.map((tool) => {
                        const url = getAIPlatformUrl(tool);
                        return url ? (
                          <a
                            key={tool}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cert-platform-link"
                            title={`Try on ${tool}`}
                          >
                            {tool}
                            <ExternalLink size={9} />
                          </a>
                        ) : (
                          <span key={tool} className="cert-platform-tag">{tool}</span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <section className="recipe-snapshot" aria-label="Recipe snapshot">
          <span className="kicker">Recipe snapshot</span>
          <div className="recipe-snapshot-grid">
            <div><span>Best for</span><strong>{guide.snapshot?.bestFor || bestForItems.slice(0, 3).join(", ") || recipe.audience}</strong></div>
            {!!(guide.snapshot?.worksBestWhen || guide.useCases?.length) && <div><span>Works best when</span><strong>{guide.snapshot?.worksBestWhen || guide.useCases?.[0]?.description}</strong></div>}
            <div><span>Time to result</span><strong>{guide.timeToResult || guide.snapshot?.timeToResult || recipe.estimatedTime}</strong></div>
            {(guide.snapshot?.output || guide.expectedOutput?.description) && <div><span>Output</span><strong>{guide.snapshot?.output || guide.expectedOutput?.description}</strong></div>}
            {(guide.snapshot?.bestWith?.length || tools.length > 0) && <div><span>Best with</span><strong>{(guide.snapshot?.bestWith?.length ? guide.snapshot.bestWith : tools.map((tool) => tool.name)).join(" · ")}</strong></div>}
            <div><span>Skill level</span><strong>{guide.snapshot?.skillLevel || recipe.difficulty}</strong></div>
          </div>
        </section>
      </div>
      <section className="shell recipe-quick-start">
        <div><span className="kicker">Quick start</span><h2>Ready to try?</h2></div>
        <ol><li>Copy the prompt</li><li>Add your context</li><li>Run it in your AI tool</li><li>Review the result</li><li>Refine if needed</li></ol>
        <button type="button" className="button button-dark" onClick={copyPrompt} disabled={missingRequiredPromptVariables} data-testid="button-quick-copy"><Copy size={15} />{copied ? "Copied" : "Copy prompt"}</button>
      </section>
      <article className="shell recipe-body">
        <div className="recipe-main">
          <section className="problem-section">
            <span className="kicker">The problem</span>
            <p className="problem-copy">{recipe.problem}</p>
            <div className="tool-row">
              {tools.map((tool) => (
                <span key={tool.name} className="tool-chip" title={tool.notes || "Compatible AI tool"}>
                  {tool.name}<small>{tool.support === "compatible" ? "Compatible" : tool.support}</small>
                </span>
              ))}
            </div>
          </section>
          {!!guide.useCases?.length && <details className="recipe-guide-section" open>
            <summary><span className="kicker">When to use this</span><strong>Useful situations</strong></summary>
            <ul className="guide-bullet-list">{guide.useCases.map((item, index) => <li key={`${item.name}-${index}`}><strong>{item.name}</strong><span>{item.description}</span></li>)}</ul>
          </details>}
          {!!bestForItems.length && <details className="recipe-guide-section">
            <summary><span className="kicker">Who and what</span><strong>Best for</strong></summary>
            {guide.bestFor?.people?.length ? <div className="guide-chip-group"><h3>People</h3>{guide.bestFor.people.map((item) => <span className="guide-chip" key={item}>{item}</span>)}</div> : null}
            {guide.bestFor?.tasks?.length ? <div className="guide-chip-group"><h3>Tasks</h3>{guide.bestFor.tasks.map((item) => <span className="guide-chip" key={item}>{item}</span>)}</div> : null}
            {guide.bestFor?.channels?.length ? <div className="guide-chip-group"><h3>Channels</h3>{guide.bestFor.channels.map((item) => <span className="guide-chip" key={item}>{item}</span>)}</div> : null}
          </details>}
          {!!guide.whenNotToUse?.length && <section className="recipe-warning-card"><span className="kicker">When not to use this</span><ul>{guide.whenNotToUse.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}
          <details className="recipe-guide-section" open>
            <summary><span className="kicker">Before you start</span><strong>What you need</strong></summary>
            <div className="guide-input-columns">
              {!!(guide.inputs?.required?.length || recipe.requiredInputs?.length) && <div><h3>Required</h3><ul className="input-list">{(guide.inputs?.required?.length ? guide.inputs.required : recipe.requiredInputs ?? []).map((input, index) => <li key={`${input}-${index}`}><Check size={16} />{input}</li>)}</ul></div>}
              {!!guide.inputs?.optional?.length && <div><h3>Optional</h3><ul className="input-list">{guide.inputs.optional.map((input, index) => <li key={`${input}-${index}`}><Plus size={16} />{input}</li>)}</ul></div>}
            </div>
          </details>
          {!!guide.situations?.length && <section className="recipe-situation-picker">
            <div className="content-heading"><span className="step-count">01</span><div><span className="kicker">Choose your situation</span><h2>What are you working on?</h2></div></div>
            <div className="situation-options">{guide.situations.map((item) => <button type="button" key={item.name} className={selectedSituation === item.name ? "active" : ""} onClick={() => updateSelectedSituation(item.name)} aria-pressed={selectedSituation === item.name}>{item.name}</button>)}</div>
            {chosenSituation?.description && <p className="situation-description">{chosenSituation.description}</p>}
          </section>}
          {!!recipe.steps?.length && <section>
            <div className="content-heading">
              <span className="step-count">02</span>
              <div>
                <span className="kicker">The workflow</span>
                <h2>Run it in three moves.</h2>
              </div>
            </div>
            <div className="steps-list">
              {recipe.steps?.map((step, index) => (
                <div className="step-row" key={`${step}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </section>}
          <section className="prompt-section recipe-prompt-experience" id="recipe-prompt">
            <div className="content-heading">
              <span className="step-count">03</span>
              <div>
                <span className="kicker">Your AI recipe</span>
                <h2>Fill these in, then copy.</h2>
              </div>
            </div>
            {!!variableFields.length && <div className="prompt-variable-form">
              {variableFields.map((variable) => <label key={variable.name}>{variable.label}{variable.required && <span className="required-mark">Required</span>}<textarea value={variableValues[variable.name] ?? ""} onChange={(event) => setVariableValues((current) => ({ ...current, [variable.name]: event.target.value }))} placeholder={variable.placeholder || `Enter ${variable.label.toLowerCase()}`} rows={variable.label.toLowerCase().includes("context") || variable.label.toLowerCase().includes("message") ? 3 : 2} />{variable.required && !variableValues[variable.name]?.trim() && <small>Fill this in before copying.</small>}</label>)}
            </div>}
            {missingRequiredPromptVariables && <p className="form-error" role="alert">Fill in the required details above before copying this prompt.</p>}
            <div className="prompt-box">
              <div className="prompt-label">
                <span>Prompt · {finalPrompt.length.toLocaleString()} characters</span>
                <button onClick={copyPrompt} disabled={missingRequiredPromptVariables} data-testid="button-copy-prompt">
                  {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy prompt</>}
                </button>
              </div>
              <pre>{finalPrompt.split(/(\{\{\s*[\w.-]+\s*\}\})/g).map((part, index) => part.startsWith("{{") ? <mark className="prompt-variable-token" key={`${part}-${index}`}>{part}</mark> : part)}</pre>
            </div>
            <div className="prompt-version-row"><span>Version {guide.quality?.version || recipe.version}</span>{recipe.updatedAt && <span>Updated {new Date(recipe.updatedAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>}{tested && guide.quality?.lastTested && <span>Last tested {new Date(guide.quality.lastTested).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>}</div>
            {copyError && <p className="form-error" role="alert">Clipboard access failed. Select and copy the prompt text above.</p>}
          </section>
          {!!(guide.expectedOutput?.description || guide.expectedOutput?.characteristics?.length) && <section className="expected-output-section"><div className="content-heading"><span className="step-count">04</span><div><span className="kicker">Expected output</span><h2>What you’ll get</h2></div></div>{guide.expectedOutput.description && <p className="expected-output-copy">{guide.expectedOutput.description}</p>}{!!guide.expectedOutput.characteristics?.length && <div className="output-characteristics">{guide.expectedOutput.characteristics.map((item) => <span key={item}><Check size={14} />{item}</span>)}</div>}</section>}
          {!!examples.length && <details className="recipe-guide-section recipe-examples" onToggle={(event) => { if (event.currentTarget.open) trackGuideEvent("recipe_example_view"); }}>
            <summary><span className="kicker">Use</span><strong>Realistic examples</strong></summary>
            <div className="example-scroll-row">{examples.map((item, index) => <article className="recipe-example-card" key={`${item.scenario}-${index}`}><span className="kicker">Example {index + 1} · {item.scenario}</span><h3>Input</h3><div className="example-box">{item.input}</div><h3>Output</h3><div className="example-box output">{item.output}</div>{!!item.whyItWorks?.length && <><h3>Why this works</h3><ul>{item.whyItWorks.map((reason, reasonIndex) => <li key={`${reason}-${reasonIndex}`}>{reason}</li>)}</ul></>}</article>)}</div>
          </details>}
          {!!recipe.refinementPrompts?.length && <details className="recipe-guide-section">
            <summary><span className="kicker">Improve</span><strong>Refinement prompts</strong></summary>
            <div className="refinement-list">{recipe.refinementPrompts.map((prompt, index) => <button type="button" key={prompt} className={selectedRefinement === prompt ? "selected" : ""} onClick={() => { setSelectedRefinement(selectedRefinement === prompt ? "" : prompt); trackGuideEvent("recipe_refinement_click", { refinement: String(index + 1) }); }}><span>+</span>{prompt}</button>)}</div>
          </details>}
          {!!guide.commonMistakes?.length && <details className="recipe-guide-section">
            <summary><span className="kicker">Improve</span><strong>Common mistakes</strong></summary>
            <ul className="guide-bullet-list">{guide.commonMistakes.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            {guide.betterApproach && <div className="better-approach"><strong>Better approach</strong><p>{guide.betterApproach}</p></div>}
          </details>}
          {!!guide.proTips?.length && <details className="recipe-guide-section">
            <summary><span className="kicker">Improve</span><strong>Make the result better</strong></summary>
            <ol className="pro-tip-list">{guide.proTips.map((tip, index) => <li key={`${tip}-${index}`}><span>Tip {String(index + 1).padStart(2, "0")}</span>{tip}</li>)}</ol>
          </details>}
          <section className="verification-box">
            <div><Check size={19} /><span className="kicker">Check the result</span></div>
            <p>{recipe.verificationNotes}</p>
          </section>
          <section className="recipe-privacy-card"><span className="kicker">Before you paste</span><p>{privacyNote}</p>{!!guide.safetyNotes?.length && <ul>{guide.safetyNotes.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}</section>
          <section className="feedback-box">
            <span>Was this useful?</span>
            <button type="button" onClick={() => sendFeedback(true)} data-testid="button-feedback-yes"><Check size={15} /> Yes</button>
            <button type="button" onClick={() => setFeedbackReasonsOpen((open) => !open)} data-testid="button-feedback-no"><X size={15} /> Not yet</button>
            {feedbackReasonsOpen && <div className="feedback-reasons" aria-label="Why was this not useful?">{["Too generic", "Prompt didn't work", "Missing example", "Missing information", "Too complicated", "Other"].map((reason) => <button type="button" key={reason} onClick={() => sendFeedback(false, reason)}>{reason}</button>)}</div>}
            {feedbackSent && <small>Thanks — your note helps us improve this recipe.</small>}
          </section>
        </div>
        <aside className="recipe-aside">
          <div className="aside-card recipe-glance-card">
            <span className="kicker">At a glance</span>
            <div><span>Audience</span><Link href={`/audiences/${recipe.audienceSlug}`} data-testid="link-recipe-audience">{recipe.audience}</Link></div>
            <div><span>Category</span><Link href={`/categories/${recipe.categorySlug}`} data-testid="link-recipe-category">{recipe.category}</Link></div>
            <div><span>Language</span><strong>{recipe.language}</strong></div>
            <div><span>Time</span><strong>{guide.timeToResult || recipe.estimatedTime}</strong></div>
            <div><span>Difficulty</span><strong>{guide.snapshot?.skillLevel || recipe.difficulty}</strong></div>
            {!!tools.length && <div><span>Works with</span><strong>{tools.map((tool) => tool.name).join(", ")}</strong></div>}
            {(guide.snapshot?.output || guide.expectedOutput?.description) && <div><span>Output</span><strong>{guide.snapshot?.output || guide.expectedOutput?.description}</strong></div>}
            {tested && <div><span>Recipe status</span><strong>Tested · v{guide.quality?.version || recipe.version}</strong></div>}
            <SaveAction recipe={recipe} />
            <button type="button" className="button button-dark full-button" onClick={copyPrompt} disabled={missingRequiredPromptVariables}><Copy size={15} />{copied ? "Copied" : "Copy prompt"}</button>
          </div>
        </aside>
      </article>
      <section className="shell related-section">
        <div className="section-heading">
          <div>
            <span className="kicker">Keep going</span>
            <h2>More like this.</h2>
            <p>{related.data?.some((item) => item.categorySlug === recipe.categorySlug) ? `Because you’re working in ${recipe.category}.` : related.data?.some((item) => item.audienceSlug === recipe.audienceSlug) ? `More workflows for ${recipe.audience}.` : "A few practical next recipes."}</p>
          </div>
        </div>
        <RecipeGrid recipes={related.data || []} />
      </section>
      <div className="recipe-mobile-copy"><button type="button" className="button button-dark" onClick={copyPrompt} disabled={missingRequiredPromptVariables}><Copy size={16} />{copied ? "Copied" : "Copy prompt"}</button></div>
    </SiteShell>
  );
}

function CollectionPage({ type }: { type: "category" | "audience" }) {
  const { slug = "" } = useParams<{ slug: string }>();
  const query =
    type === "category"
      ? useGetCategory(slug, {
          query: { queryKey: getGetCategoryQueryKey(slug) },
        })
      : useGetAudience(slug, {
          query: { queryKey: getGetAudienceQueryKey(slug) },
        });
  usePageMeta(
    query.data
      ? `${query.data.name} workflows — AI Recipes`
      : "Collection — AI Recipes",
    query.data?.description ||
      "Browse practical AI workflows in this collection.",
  );
  if (query.isLoading)
    return (
      <SiteShell>
        <LoadingState />
      </SiteShell>
    );
  if (query.isError || !query.data)
    return (
      <SiteShell>
        <ErrorState retry={() => query.refetch()} />
      </SiteShell>
    );
  return (
    <SiteShell>
      <div className="collection-hero shell">
        <span className="kicker">
          {type === "category" ? "Category" : "Audience"}
        </span>
        <h1>{query.data.name}</h1>
        <p>{query.data.description}</p>
        <span className="collection-count">
          {query.data.recipes.length} recipes in this shelf
        </span>
      </div>
      <section className="shell collection-body">
        <RecipeGrid recipes={query.data.recipes} />
      </section>
    </SiteShell>
  );
}

function CollectionsIndex({ type }: { type: 'category' | 'audience' }) {
  const query = type === 'category' ? useListCategories() : useListAudiences();
  usePageMeta(type === 'category' ? 'Categories — AI Recipes' : 'Audiences — AI Recipes', 'Find the right shelf of practical AI workflows for the work you do.');
  if (query.isLoading) return <SiteShell><LoadingState /></SiteShell>;
  if (query.isError || !query.data) return <SiteShell><ErrorState retry={() => query.refetch()} /></SiteShell>;
  const items = query.data;
  return <SiteShell><div className="page-intro shell"><span className="kicker">{type === 'category' ? 'Browse by context' : 'Browse by person'}</span><h1>{type === 'category' ? 'Start with the work.' : 'Made for your kind of day.'}</h1><p>{type === 'category' ? 'From blank page to busy back office, find a workflow that meets you where you are.' : 'Useful workflows are shaped by the person using them. Pick the desk, season, or role that feels familiar.'}</p></div><section className="shell collection-index">{items.map((item, index) => <Link href={`/${type === 'category' ? 'categories' : 'audiences'}/${item.slug}`} className="index-row" key={item.id} data-testid={`link-${type}-${item.id}`}><span className="category-index">{String(index + 1).padStart(2, '0')}</span><div><h2>{item.name}</h2><p>{item.description}</p></div><span className="category-count">{item.recipeCount} recipes</span><ArrowRight size={20} /></Link>)}</section></SiteShell>;
}

function SubmitPage() {
  const create = useCreateSubmission();
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ title: '', problem: '', workflow: '', howUsed: '', email: '' });
  usePageMeta('Share a workflow — AI Recipes', 'Share a practical AI workflow with the AI Recipes field guide.');
  const update = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value });
  if (sent) return <SiteShell><div className="success-panel shell"><span className="success-mark"><Check size={25} /></span><span className="kicker">Workflow received</span><h1>That is exactly the kind of thing we want to test.</h1><p>We will review your workflow for clarity, usefulness, and whether someone else can actually run it.</p><Link href="/recipes" className="button button-dark" data-testid="link-submit-success">Back to the library <ArrowRight size={16} /></Link></div></SiteShell>;
  return <SiteShell><div className="form-page shell"><div className="form-intro"><span className="kicker">Contribute to the field guide</span><h1>What workflow saved you time?</h1><p>Share the problem, the steps, and how you know it worked. We will do the editing and testing; you bring the useful bit.</p><div className="form-aside-note"><PenLine size={18} /><span>Good submissions are specific, honest, and repeatable.</span></div></div><form className="workflow-form" onSubmit={(e) => { e.preventDefault(); create.mutate({ data: { ...form, email: form.email || null } }, { onSuccess: () => setSent(true) }); }}><label>Give it a useful title<input required minLength={3} value={form.title} onChange={update('title')} placeholder="e.g. Turn a messy brief into a clear project plan" data-testid="input-submit-title" /></label><label>What problem does it solve?<textarea required minLength={10} value={form.problem} onChange={update('problem')} placeholder="Describe the moment when this workflow is useful." data-testid="input-submit-problem" /></label><label>Walk us through the workflow<textarea required minLength={20} className="tall-input" value={form.workflow} onChange={update('workflow')} placeholder="What do you put in, what do you ask, and what do you do with the result?" data-testid="input-submit-workflow" /></label><label>How did you use it?<textarea required minLength={10} value={form.howUsed} onChange={update('howUsed')} placeholder="Tell us what changed, or what you checked." data-testid="input-submit-how-used" /></label><label>Your email <span className="optional">(optional)</span><input type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" data-testid="input-submit-email" /></label><button className="button button-dark submit-button" type="submit" disabled={create.isPending} data-testid="button-submit-workflow">{create.isPending ? 'Sending...' : 'Send workflow for review'} <Send size={16} /></button>{create.isError && <p className="form-error">Could not send that just now. Please try again.</p>}</form></div></SiteShell>;
}

function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingState label="Checking your shelf" />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <SiteShell>{children}</SiteShell>;
}

function SavedPage() {
  const query = useListSavedRecipes();
  usePageMeta('Saved recipes — AI Recipes', 'Your saved practical AI workflows.');
  if (query.isLoading) return <LoadingState label="Opening your shelf" />;
  if (query.isError) return <ErrorState retry={() => query.refetch()} />;
  return <div className="protected-page shell"><div className="page-intro compact"><span className="kicker">Your shelf</span><h1>Saved for later.</h1><p>A short list of workflows worth keeping close.</p></div><RecipeGrid recipes={query.data || []} /></div>;
}

function HistoryPage() {
  const query = useListHistory();
  usePageMeta('History — AI Recipes', 'Recently opened workflows from AI Recipes.');
  if (query.isLoading) return <LoadingState label="Replaying your trail" />;
  if (query.isError) return <ErrorState retry={() => query.refetch()} />;
  return <div className="protected-page shell"><div className="page-intro compact"><span className="kicker">Your trail</span><h1>Recently opened.</h1><p>Pick up where you left off.</p></div><RecipeGrid recipes={query.data || []} /></div>;
}

function ProfilePage() {
  const query = useGetMe();
  const { user } = useUser();
  const { signOut } = useClerk();
  usePageMeta('Profile — AI Recipes', 'Your AI Recipes profile and personal library.');
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState retry={() => query.refetch()} />;
  const profile = query.data;
  return <div className="protected-page shell profile-page"><div className="profile-head"><div className="profile-avatar">{(user?.firstName?.[0] || 'A')}{(user?.lastName?.[0] || 'R')}</div><div><span className="kicker">Your account</span><h1>{profile.displayName}</h1><p>{profile.email}</p></div><button className="button button-outline" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button></div><div className="profile-stats"><Link href="/saved" data-testid="link-profile-saved"><Bookmark size={18} /><strong>{profile.savedCount}</strong><span>Saved recipes</span></Link><Link href="/history" data-testid="link-profile-history"><History size={18} /><strong>{profile.historyCount}</strong><span>Recipes opened</span></Link></div></div>;
}

interface MfaChallengeState {
  tempToken: string;
  maskedPhone: string;
  expiresInSeconds: number;
}

function useAdminAuth() {
  const [adminUser, setAdminUser] = useState<{ emailMasked: string; provider: string } | null>(null);
  const [tokenVerified, setTokenVerified] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');

  useEffect(() => {
    // Read error params from URL if present
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if (err === 'not_allowed') {
        setAuthError('Access denied. Your account is not on the admin allow-list.');
      } else if (err === 'cancelled') {
        setAuthError('Sign-in was cancelled or timed out. Please try again.');
      } else if (err) {
        setAuthError('Authentication failed. Please try again.');
      }
    }

    // Verify session on mount with /api/auth/me
    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data && data.authenticated && data.user) {
          setAdminUser(data.user);
        } else {
          setAdminUser(null);
        }
      })
      .catch(() => {
        setAdminUser(null);
      })
      .finally(() => setTokenVerified(true));
  }, []);

  const loginWithGoogle = () => {
    setIsSubmitting(true);
    window.location.href = '/api/auth/google';
  };

  const loginWithGitHub = () => {
    setIsSubmitting(true);
    window.location.href = '/api/auth/github';
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setAdminUser(null);
    window.location.href = '/admin';
  };

  const isAuthenticated = tokenVerified && Boolean(adminUser);

  return {
    isAuthenticated,
    tokenVerified,
    adminUser,
    authError,
    isSubmitting,
    loginWithGoogle,
    loginWithGitHub,
    logout,
    clearSession: logout,
    adminToken: 'oauth_session',
  };
}

function AdminAuthGateway({ auth }: { auth: ReturnType<typeof useAdminAuth> }) {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'github' | null>(null);

  const handleGoogleClick = () => {
    setLoadingProvider('google');
    auth.loginWithGoogle();
  };

  const handleGitHubClick = () => {
    setLoadingProvider('github');
    auth.loginWithGitHub();
  };

  return (
    <div className="admin-gateway-wrapper">
      <div className="admin-gateway-card">
        <div className="admin-gateway-icon">
          <ShieldCheck size={36} />
        </div>
        <span className="kicker">Admin Command Center</span>
        <h1>Admin Authorization</h1>
        <p className="admin-gateway-subtitle">
          Only authorized administrator accounts on the private allow-list can access this dashboard.
        </p>

        {auth.authError && (
          <div className="gateway-error-banner" role="alert" tabIndex={0}>
            <AlertCircle size={18} /> <span>{auth.authError}</span>
          </div>
        )}

        <div className="admin-social-signin-box">
          <button
            type="button"
            className="button button-outline social-signin-btn google-btn full-button"
            onClick={handleGoogleClick}
            disabled={loadingProvider !== null || auth.isSubmitting}
            data-testid="button-admin-login-google"
          >
            {loadingProvider === 'google' ? (
              <>
                <RefreshCw size={16} className="spin-icon" /> Connecting to Google...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" className="provider-icon">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <button
            type="button"
            className="button button-outline social-signin-btn github-btn full-button"
            onClick={handleGitHubClick}
            disabled={loadingProvider !== null || auth.isSubmitting}
            data-testid="button-admin-login-github"
          >
            {loadingProvider === 'github' ? (
              <>
                <RefreshCw size={16} className="spin-icon" /> Connecting to GitHub...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="provider-icon">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                Continue with GitHub
              </>
            )}
          </button>
        </div>

        <div className="admin-gateway-footer">
          <Link href="/" className="arrow-link">
            <ChevronLeft size={14} /> Back to AI Recipes public site
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdminSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; adminToken?: string }) {
  const [adminUser, setAdminUser] = useState<{ emailMasked: string; provider: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/auth/me')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.authenticated) {
            setAdminUser(data.user);
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container admin-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <ShieldCheck size={22} className="accent-indigo" />
            <h2>Admin Account & Security</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <h3>👤 Active Administrator Account</h3>
            <p>Signed in securely via OAuth 2.0 with PKCE and encrypted allow-list verification.</p>
            <div className="code-display-box">
              <code>Account: {adminUser?.emailMasked || 'Authenticated Admin'}</code>
              {adminUser?.provider && <span className="status-badge">{adminUser.provider.toUpperCase()}</span>}
            </div>
          </div>

          <div className="settings-section">
            <h3>🔒 Admin Allow-List Management</h3>
            <p>
              The admin allow-list is stored encrypted in server environment variables (<code>ADMIN_ALLOWLIST_HASHES</code>).
              There is <strong>no API route or database screen</strong> that edits the allow-list.
            </p>
            <p>To add or remove administrators, run the local CLI utility from your server workspace:</p>
            <div className="code-display-box">
              <code>node scripts/admin-allowlist.mjs add someone@gmail.com</code>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={onClose}>
              Close Window
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const RECIPE_STARTER_PRESETS: Array<{
  name: string;
  categorySlug: string;
  audienceSlug: string;
  badge: string;
  description: string;
  data: Partial<RecipeInput>;
}> = [
  {
    name: "B2B Cold Outreach & Sales Pitch",
    categorySlug: "business",
    audienceSlug: "founders",
    badge: "Sales & Pitch",
    description: "Personalized, constraint-driven cold email that gets replies from busy founders and executives.",
    data: {
      title: "B2B Cold Outreach for Decision Makers",
      slug: "b2b-cold-outreach-decision-makers",
      shortDescription: "A personalized, constraint-driven cold email prompt designed to get replies from busy founders and executives.",
      problem: "Cold outreach often gets ignored because it sounds templated, talks too much about the sender, or lacks an easy low-friction call to action.",
      subcategory: "Sales & Outreach",
      difficulty: "Beginner",
      estimatedTime: "10 min",
      language: "English",
      aiTools: ["Claude 3.5 Sonnet", "ChatGPT-4o"],
      requiredInputs: [
        "Target executive name and company",
        "1 specific observation or trigger event (funding, new launch, recent post)",
        "Your concise value proposition in 1 sentence",
        "A low-friction CTA (e.g. 15-min chat, sending a 2-min loom)"
      ],
      steps: [
        "Fill the prospect context and trigger event in the bracketed variables.",
        "Generate 3 variations focusing on problem-first framing.",
        "Select the crispest draft (under 100 words), verify tone, and send."
      ],
      prompt: `You are an elite B2B sales copywriter known for short, high-conversion cold emails.

Objective:
Write a cold email to [TARGET PROSPECT NAME] at [COMPANY NAME].

Context:
- Trigger / Observation: [RELEVANT TRIGGER e.g. recent product launch, LinkedIn post, hiring]
- Value Proposition: [HOW WE HELP IN 1 SENTENCE]
- Proof Point: [1 METRIC OR CASE STUDY e.g. helped X increase demo conversion by 28%]
- Low Friction Call-to-Action: [e.g. open to a 2-minute teardown video?]

Constraints:
1. Maximum 90 words.
2. Subject line must be under 5 words, all lowercase, casual.
3. No buzzwords like "hope this finds you well", "synergy", or "game-changer".
4. The first sentence must reference the trigger event immediately.`,
      exampleInput: `Prospect: Priya Sharma, Head of Growth at FinFlow
Trigger: Just launched their instant UPI merchant checkout
Value Prop: We reduce checkout abandonment by 18% with 1-click fallback
Proof: Scaled 40+ fintech apps in India including PayZen
CTA: Would you be against me sending a 2-minute video teardown showing where the drop-off occurs on mobile?`,
      exampleOutput: `Subject: quick note on upi checkout

Hi Priya,

Saw the launch of FinFlow's instant UPI merchant checkout yesterday—huge congrats to the team.

Quick question: are you seeing drop-offs on secondary bank OTP timeouts? We built a 1-click fallback that helped PayZen recover 18% of abandoned UPI payments last quarter.

Would you be against me sending a 2-minute video teardown showing where the drop-off occurs on mobile?

Best,
[Your Name]`,
      refinementPrompts: [
        "Make this 20% more casual for an early-stage startup founder.",
        "Add a 1-sentence P.S. referencing an Indian fintech regulation advantage.",
        "Write a 3-day follow-up message if she does not reply."
      ],
      verificationNotes: "Ensure word count is strictly under 100 words and that the trigger event sounds genuinely researched.",
      tags: ["outreach", "b2b", "email", "sales", "growth"],
      status: "DRAFT",
      featured: false,
      trending: true,
      recipeOfDay: false,
      version: "1.0",
      testedWith: ["Claude 3.5 Sonnet", "ChatGPT-4o"],
      seoTitle: "B2B Cold Outreach for Decision Makers | AI Recipes",
      seoDescription: "A tested, high-converting B2B cold email recipe tailored for executive response rates."
    }
  },
  {
    name: "Executive Summary & Decision Memo",
    categorySlug: "career",
    audienceSlug: "professionals",
    badge: "Leadership",
    description: "Distill messy multi-page documents, strategy decks, or transcripts into a crisp 1-page decision memo.",
    data: {
      title: "1-Page Executive Briefing & Decision Memo",
      slug: "1-page-executive-briefing-memo",
      shortDescription: "Distill messy multi-page documents, strategy decks, or transcripts into a crisp 1-page decision memo for leadership.",
      problem: "Leadership teams lack the time to read 20-page decks. Key insights get buried under raw data without clear recommendations.",
      subcategory: "Strategy & Writing",
      difficulty: "Intermediate",
      estimatedTime: "15 min",
      language: "English",
      aiTools: ["Claude 3.5 Sonnet", "ChatGPT-4o"],
      requiredInputs: [
        "Raw document text, meeting notes, or report transcript",
        "Primary business decision or question at hand",
        "Key stakeholders involved"
      ],
      steps: [
        "Paste the raw notes or document into the prompt.",
        "Review the structured 4-section executive summary generated.",
        "Validate key metrics and verify risk assessments before sharing with stakeholders."
      ],
      prompt: `You are a Chief of Staff preparing a 1-page executive decision memo for senior leadership.

Document / Raw Notes:
[PASTE DOCUMENT OR REPORT HERE]

Core Decision to Make:
[STATE THE DECISION e.g. Approve Q3 Marketing Budget Reallocation]

Format the output strictly into these 4 sections:
1. Executive TL;DR (3 bullet points: Context, Problem, Proposed Solution)
2. Strategic Implications & Expected ROI
3. Key Risks & Mitigation Plan
4. Required Approvals & Next 14-Day Milestones

Tone: Direct, analytical, objective, and executive-ready.`,
      exampleInput: `Document: 14 pages of user feedback on our mobile app checkout.
Core Decision: Rebuild the checkout UI in React Native or patch current native view.`,
      exampleOutput: `EXECUTIVE MEMO: Mobile Checkout Architecture Decision

1. Executive TL;DR
- Context: Checkout completion rate has plateaued at 64% due to latency.
- Problem: Native Android view requires 3 distinct team handoffs per update.
- Recommendation: Rebuild checkout in unified React Native framework over 4 weeks.

2. Strategic Implications
- Reduces feature deployment cycle from 12 days to 24 hours.
- Expected 7-10% uplift in completed checkouts ($140k ARR impact).

3. Key Risks & Mitigations
- Risk: Short-term iOS regression during migration.
- Mitigation: Roll out via 10% feature flag with automated rollback trigger.

4. Action Required
- Engineering Lead approval by Friday 5 PM to begin Sprint 1.`,
      refinementPrompts: [
        "Make this format follow the Amazon 6-pager memo style.",
        "Add a table comparing cost vs speed for Option A vs Option B."
      ],
      verificationNotes: "Double-check all financial numbers and timeline commitments against engineering capacity.",
      tags: ["executive", "memo", "leadership", "strategy", "productivity"],
      status: "DRAFT",
      featured: true,
      trending: false,
      recipeOfDay: false,
      version: "1.0",
      testedWith: ["Claude 3.5 Sonnet"],
      seoTitle: "1-Page Executive Briefing & Decision Memo | AI Recipes",
      seoDescription: "Synthesize dense reports into structured, executive-ready 1-page decision memos."
    }
  },
  {
    name: "Production Code Refactor & Security Audit",
    categorySlug: "career",
    audienceSlug: "professionals",
    badge: "Engineering",
    description: "Audit and refactor source code for performance, type safety, memory leaks, and security vulnerabilities.",
    data: {
      title: "Production Code Refactor & Security Review",
      slug: "production-code-refactor-security-review",
      shortDescription: "A structured engineering prompt to audit code for memory leaks, type safety, security bugs, and performance bottlenecks.",
      problem: "Quickly reviewing legacy code often misses subtle security vulnerabilities, unhandled async errors, or memory leaks.",
      subcategory: "Engineering",
      difficulty: "Intermediate",
      estimatedTime: "15 min",
      language: "English",
      aiTools: ["Claude 3.5 Sonnet", "ChatGPT-4o"],
      requiredInputs: [
        "Target source code snippet",
        "Target language & runtime (e.g. TypeScript / Node.js 24)",
        "Specific focus areas (e.g. concurrency, SQL injection, error boundaries)"
      ],
      steps: [
        "Paste the code snippet into the prompt with language annotations.",
        "Review the numbered critique of potential bottlenecks and vulnerabilities.",
        "Apply the refactored code and run unit tests to verify behavior."
      ],
      prompt: `You are a Principal Software Architect and Security Auditor.

Review the following code:
\`\`\`[LANGUAGE]
[INSERT CODE SNIPPET HERE]
\`\`\`

Analyze and provide:
1. Critical Issues & Security Flaws (Injection, race conditions, memory leaks, unhandled errors)
2. Performance & Clean Code Recommendations
3. Refactored Code (Production-ready, strongly typed, idiomatic, and clean)
4. Unit Test Suggestions (Corner cases and failure modes)`,
      exampleInput: `Language: TypeScript / Express
Code: function getUser(req, res) { db.query('SELECT * FROM users WHERE id = ' + req.params.id, (err, user) => res.json(user)) }`,
      exampleOutput: `1. Security & Architecture Audit:
- CRITICAL: SQL Injection vulnerability via string concatenation on req.params.id.
- Missing error handling: callback error is ignored, potentially leaving requests hanging.
- Missing input validation: id is not validated as numeric or sanitized.

2. Refactored Code:
\`\`\`typescript
import { Request, Response } from 'express';
import { db } from '../db';
import { z } from 'zod';

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export async function getUser(req: Request, res: Response): Promise<void> {
  const result = ParamsSchema.safeParse(req.params);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }
  const user = await db.query('SELECT id, name, email FROM users WHERE id = $1', [result.data.id]);
  if (!user.rows[0]) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user.rows[0]);
}
\`\`\``,
      refinementPrompts: [
        "Add Jest unit tests covering positive and negative cases.",
        "Add OpenTelemetry tracing spans to this refactored function."
      ],
      verificationNotes: "Always run automated unit tests and linter after applying AI-refactored code.",
      tags: ["code", "typescript", "security", "refactoring", "developer"],
      status: "DRAFT",
      featured: false,
      trending: false,
      recipeOfDay: false,
      version: "1.0",
      testedWith: ["Claude 3.5 Sonnet"],
      seoTitle: "Production Code Refactor & Security Review | AI Recipes",
      seoDescription: "Audit and refactor source code for performance, type safety, and security vulnerabilities."
    }
  },
  {
    name: "Active Recall Study Guide & Quiz",
    categorySlug: "education",
    audienceSlug: "students",
    badge: "Study & Exam",
    description: "Convert textbook chapters or notes into an interactive active-recall study guide with quizzes.",
    data: {
      title: "Active Recall Study Guide & Concept Mastery Quiz",
      slug: "active-recall-study-guide-quiz",
      shortDescription: "Convert textbook chapters or lecture notes into an interactive active-recall study guide with progressive difficulty quizzes.",
      problem: "Passive reading creates the illusion of competence. Real exam mastery requires active retrieval and testing under timed pressure.",
      subcategory: "Study & Exam Prep",
      difficulty: "Beginner",
      estimatedTime: "12 min",
      language: "English",
      aiTools: ["ChatGPT-4o", "Claude 3.5 Sonnet"],
      requiredInputs: [
        "Topic or raw notes/chapter text",
        "Target exam or difficulty level",
        "Key concepts to emphasize"
      ],
      steps: [
        "Paste the topic or notes into the prompt.",
        "Study the 3 core concept summaries and intuition analogies.",
        "Take the 5-question active recall quiz without looking at notes, then check explanations."
      ],
      prompt: `You are an expert tutor specializing in active recall and cognitive learning techniques.

Topic / Study Notes:
[INSERT TOPIC OR CHAPTER NOTES]

Goal:
Prepare a high-retention study session.

Provide:
1. Core Concepts Simplified (Explain like I'm 15 with 1 memorable analogy)
2. Common Misconceptions / Trap Questions
3. 5 Progressive Active Recall Questions (2 conceptual, 2 scenario-based, 1 tough application question)
4. Hidden Answer Key with explanatory breakdowns`,
      exampleInput: `Topic: How DNS resolution works (Recursive vs Authoritative DNS, TTL, Root servers). Exam: Systems Engineering Interview.`,
      exampleOutput: `1. Core Concept (The Phonebook Analogy):
DNS is the Internet's GPS/Phonebook. When you type 'google.com', your computer doesn't know where the server lives. It asks the Recursive Resolver (the detective), which checks the Root Server (the country directory), then the TLD Server (.com directory), and finally the Authoritative Nameserver (the exact address).

2. Common Trap:
Confusing 'Recursive' (does the legwork) with 'Authoritative' (holds the definitive answer).

3. Active Recall Questions:
Q1: What is the exact difference between Recursive DNS and Authoritative DNS?
Q2: If an engineer updates an A record, why might users still see the old IP for 2 hours?
Q3: What happens if the root DNS servers go offline?

4. Answer Key & Self-Check:
A1: Recursive queries on behalf of client; Authoritative holds the original DNS records.
A2: TTL (Time To Live) cached at ISP or local resolver.`,
      refinementPrompts: [
        "Generate 10 flashcard pairs in Anki CSV format.",
        "Create a mnemonic device to remember the 4 stages of DNS lookup."
      ],
      verificationNotes: "Test your recall by answering questions on paper before reading the hidden answer key.",
      tags: ["study", "exam", "education", "learning", "active-recall"],
      status: "DRAFT",
      featured: false,
      trending: true,
      recipeOfDay: false,
      version: "1.0",
      testedWith: ["ChatGPT-4o"],
      seoTitle: "Active Recall Study Guide & Concept Mastery Quiz | AI Recipes",
      seoDescription: "Transform notes into active recall questions and self-testing quizzes for faster learning."
    }
  }
];

function SmartDraftModal({
  isOpen,
  onClose,
  onImportCsv,
  onSelectDraft,
  categories,
  audiences,
}: {
  isOpen: boolean;
  onClose: () => void;
  onImportCsv?: () => void;
  onSelectDraft: (draft: Partial<RecipeInput>) => void;
  categories?: Array<{ id: number; name: string; slug: string }>;
  audiences?: Array<{ id: number; name: string; slug: string }>;
}) {
  const [tab, setTab] = useState<'presets' | 'ai'>('presets');
  const [promptInput, setPromptInput] = useState('');
  const generate = useGenerateDraftRecipe();

  if (!isOpen) return null;

  const handleGenerate = (e: FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    generate.mutate(
      { data: { topicOrPrompt: promptInput.trim() } },
      {
        onSuccess: (data: any) => {
          onSelectDraft(data);
          onClose();
        },
      }
    );
  };

  const handlePresetSelect = (preset: typeof RECIPE_STARTER_PRESETS[0]) => {
    const matchedCategory = categories?.find((c) => c.slug === preset.categorySlug)?.id ?? 1;
    const matchedAudience = audiences?.find((a) => a.slug === preset.audienceSlug)?.id ?? 1;
    onSelectDraft({
      ...preset.data,
      categoryId: matchedCategory,
      audienceId: matchedAudience,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container smart-draft-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <Wand2 size={20} className="accent-indigo" />
            <h2>✨ AI Smart Draft & Starter Presets</h2>
          </div>
          <div className="smart-draft-header-actions">
            {onImportCsv && (
              <button type="button" className="button button-small button-outline" onClick={onImportCsv} data-testid="button-smart-draft-import-csv">
                <Upload size={15} /> Import CSV
              </button>
            )}
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-tab-nav">
          <button
            type="button"
            className={tab === 'presets' ? 'active' : ''}
            onClick={() => setTab('presets')}
          >
            ⚡ Quick-Start Presets
          </button>
          <button
            type="button"
            className={tab === 'ai' ? 'active' : ''}
            onClick={() => setTab('ai')}
          >
            ✨ Custom AI Generator
          </button>
        </div>

        <div className="modal-body">
          {tab === 'presets' && (
            <div className="presets-grid">
              {RECIPE_STARTER_PRESETS.map((preset) => (
                <div
                  key={preset.name}
                  className="preset-card"
                  onClick={() => handlePresetSelect(preset)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="preset-card-top">
                    <span className="preset-badge">{preset.badge}</span>
                  </div>
                  <h3>{preset.name}</h3>
                  <p>{preset.description}</p>
                  <span className="use-preset-btn">
                    Use Template <ArrowRight size={13} />
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === 'ai' && (
            <form className="ai-generator-form" onSubmit={handleGenerate}>
              <p className="form-helper-text">
                Paste any raw prompt, rough notes, or simply describe the workflow you want to create (e.g. <em>"A recipe for writing engaging product release notes on LinkedIn"</em>). Our generator will structure the problem, steps, variables, and verification notes.
              </p>
              <textarea
                required
                rows={4}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Describe your workflow or paste a raw prompt here..."
                data-testid="input-ai-generator-prompt"
              />
              <div className="modal-actions">
                <button
                  type="submit"
                  className="button button-dark"
                  disabled={generate.isPending}
                  data-testid="button-generate-ai-draft"
                >
                  {generate.isPending ? (
                    <>
                      <RefreshCw size={15} className="spin-icon" /> Generating structured recipe...
                    </>
                  ) : (
                    <>
                      <Wand2 size={15} /> Generate Structured Recipe
                    </>
                  )}
                </button>
              </div>
              {generate.isError && (
                <p className="form-error">Could not generate draft. Please check your prompt and try again.</p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminShell({ children }: { children: ReactNode }) {
  const auth = useAdminAuth();
  const [location, setLocation] = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const submissionsQuery = useListAdminSubmissions();
  const categoriesQuery = useListCategories();
  const audiencesQuery = useListAudiences();

  if (!auth.isAuthenticated) {
    return <AdminAuthGateway auth={auth} />;
  }

  const pendingSubmissionsCount = submissionsQuery.data?.filter((s) => s.status === 'PENDING').length || 0;

  const navItems = [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard },
    { href: '/admin/recipes', label: 'Recipes', icon: FileText },
    { href: '/admin/submissions', label: 'Submissions', icon: InboxIcon, badge: pendingSubmissionsCount },
    { href: '/admin/categories', label: 'Categories', icon: Tag },
    { href: '/admin/audiences', label: 'Audiences', icon: Users },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="admin-shell">
      {/* Mobile header toggle */}
      <button
        type="button"
        className="admin-sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle admin sidebar"
        aria-expanded={sidebarOpen}
      >
        ☰
      </button>
      {/* Sidebar */}
      <aside className={`admin-sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <div className="admin-logo-row mb-6">
          <Logo />
          <span className="admin-status-pill">EDITOR</span>
        </div>
        <span className="admin-label">Workspace</span>
        <nav className="admin-nav" aria-label="Admin Navigation">
          {navItems.map(({ href, label, icon: Icon, badge }) => (
            <Link
              key={href}
              href={href}
              className={location === href || (href !== '/admin' && location.startsWith(href)) ? 'active' : ''}
              data-testid={`link-admin-${label.toLowerCase()}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {badge !== undefined && badge > 0 && <span className="nav-count-badge">{badge}</span>}
            </Link>
          ))}
        </nav>
        <div className="admin-side-bottom mt-auto border-t border-gray-600 pt-4">
          <button
            type="button"
            className="admin-side-action-btn mb-2 w-full flex items-center justify-center"
            onClick={() => setShowDraftModal(true)}
            data-testid="button-sidebar-smart-draft"
          >
            <Wand2 size={16} /> ✨ AI Draft Generator
          </button>
          <Link href="/" data-testid="link-admin-view-site" className="flex items-center">
            <ExternalLink size={16} /> View public site
          </Link>
        </div>
      </aside>
      {/* Main content */}
      <div className="admin-content">
        <header className="admin-topbar flex justify-between items-center h-16 px-4 border-b border-line text-gray-600 text-sm uppercase">
          <div className="admin-topbar-left flex items-center gap-2">
            <span className="topbar-crumb">AI Recipes / <strong>Admin Workspace</strong></span>
            <span className="admin-mode-pill passkey flex items-center">
              <ShieldCheck size={13} /> {(auth.adminUser as any)?.username ? `@${(auth.adminUser as any).username}` : 'Master Admin'}
            </span>
            {Boolean((auth.adminUser as any)?.mfaEnabled) && (
              <span className="admin-mode-pill clerk flex items-center">
                <Smartphone size={13} /> 2FA Active
              </span>
            )}
          </div>
          <div className="admin-topbar-actions flex gap-2">
            <button
              type="button"
              className="button button-small button-outline topbar-btn"
              onClick={() => setShowDraftModal(true)}
              data-testid="button-topbar-smart-draft"
            >
              <Wand2 size={14} /> AI Generator
            </button>
            <button
              type="button"
              className="button button-small button-outline topbar-btn"
              onClick={() => setShowSettings(true)}
              data-testid="button-admin-security-settings"
            >
              <Shield size={14} /> Security & 2FA
            </button>
            <button
              type="button"
              className="button button-small button-outline topbar-btn logout-btn"
              onClick={() => { auth.clearSession(); setLocation('/'); }}
              data-testid="button-admin-lock"
            >
              <Lock size={14} /> Lock Admin
            </button>
          </div>
        </header>
        <main className="p-6">
          {children}
        </main>
        <AdminSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} adminToken={auth.adminToken} />
        <SmartDraftModal
          isOpen={showDraftModal}
          onClose={() => setShowDraftModal(false)}
          onSelectDraft={(draft) => {
            setShowDraftModal(false);
            setLocation(`/admin/recipes/new?draft=${encodeURIComponent(JSON.stringify(draft))}`);
          }}
          categories={categoriesQuery.data}
          audiences={audiencesQuery.data}
        />
      </div>
    </div>
  );
}




function InboxIcon(props: { size?: number }) { return <FileText {...props} />; }

function AdminOverview() {
  const summaryQuery = useGetAdminSummary();
  const recipesQuery = useListAdminRecipes({ page: 1 });
  const submissionsQuery = useListAdminSubmissions();
  const categoriesQuery = useListCategories();
  const audiencesQuery = useListAudiences();
  const updateSubmission = useUpdateAdminSubmission();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [showDraftModal, setShowDraftModal] = useState(false);

  usePageMeta('Super Admin Dashboard — AI Recipes', 'Comprehensive command center for the AI Recipes field guide.');

  if (summaryQuery.isLoading || recipesQuery.isLoading) return <LoadingState label="Loading Command Center" />;
  if (summaryQuery.isError || !summaryQuery.data) return <ErrorState retry={() => summaryQuery.refetch()} />;

  const s = summaryQuery.data;
  const totalEngagements = s.views + s.copies * 3 + s.saves * 4;
  const copyRate = s.views > 0 ? ((s.copies / s.views) * 100).toFixed(1) : '0';
  const totalFeedback = s.positiveFeedback + s.negativeFeedback;
  const satisfactionScore = totalFeedback > 0 ? Math.round((s.positiveFeedback / totalFeedback) * 100) : 100;

  const pendingSubmissions = submissionsQuery.data?.filter((sub) => sub.status === 'PENDING') || [];
  const publishedCount = s.publishedRecipes;
  const testingCount = s.testingRecipes;
  const draftCount = s.draftRecipes;
  const totalRecipes = s.totalRecipes || 1;

  const handleApproveSubmission = (id: number) => {
    updateSubmission.mutate(
      { id, data: { status: 'APPROVED' } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminSubmissionsQueryKey() });
        },
      }
    );
  };

  const handleConvertSubmission = (submission: typeof pendingSubmissions[0]) => {
    const draft: Partial<RecipeInput> = {
      title: submission.title,
      slug: submission.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
      problem: submission.problem,
      shortDescription: `A practical, tested workflow to ${submission.title.toLowerCase()}.`,
      prompt: submission.workflow,
      exampleInput: submission.howUsed,
      exampleOutput: "Polished output demonstration...",
      steps: [
        "Gather required context and parameters.",
        "Run the submitted prompt in Claude or ChatGPT.",
        "Verify results against quality checklist."
      ],
      requiredInputs: ["[Context / Input Materials]", "[Target Output Constraints]"],
      status: "DRAFT",
    };
    setLocation(`/admin/recipes/new?draft=${encodeURIComponent(JSON.stringify(draft))}&submissionId=${submission.id}`);
  };

  return (
    <div className="admin-page">
      <div className="admin-page-heading dashboard-hero-header">
        <div>
          <span className="kicker">Editorial Command Center</span>
          <h1>Supercharged Dashboard</h1>
          <p className="admin-subtitle">Live pulse of recipes, community submissions, quality testing, and engagement.</p>
        </div>
        <div className="admin-heading-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={() => setShowDraftModal(true)}
            data-testid="button-overview-ai-generator"
          >
            <Wand2 size={16} /> ✨ AI Draft Generator
          </button>
          <Link href="/admin/recipes/new" className="button button-dark" data-testid="link-admin-new-recipe">
            <Plus size={16} /> New Recipe
          </Link>
        </div>
      </div>

      {/* 8 Metric KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card published-card">
          <div className="kpi-icon-wrap"><CheckCircle2 size={20} /></div>
          <span className="kpi-label">Published Workflows</span>
          <strong className="kpi-value">{s.publishedRecipes}</strong>
          <small className="kpi-sub">{Math.round((publishedCount / totalRecipes) * 100)}% of library</small>
        </div>

        <div className="kpi-card testing-card">
          <div className="kpi-icon-wrap"><Flame size={20} /></div>
          <span className="kpi-label">In Testing / QA</span>
          <strong className="kpi-value">{s.testingRecipes}</strong>
          <small className="kpi-sub">Awaiting verification</small>
        </div>

        <div className="kpi-card drafts-card">
          <div className="kpi-icon-wrap"><FileText size={20} /></div>
          <span className="kpi-label">Drafts & Ideas</span>
          <strong className="kpi-value">{s.draftRecipes}</strong>
          <small className="kpi-sub">In progress</small>
        </div>

        <div className="kpi-card submissions-card">
          <div className="kpi-icon-wrap"><InboxIcon size={20} /></div>
          <span className="kpi-label">Pending Submissions</span>
          <strong className="kpi-value">{s.pendingSubmissions}</strong>
          <small className="kpi-sub">{s.pendingSubmissions > 0 ? '⚡ Needs triage' : 'Queue clear'}</small>
        </div>

        <div className="kpi-card views-card">
          <div className="kpi-icon-wrap"><Eye size={20} /></div>
          <span className="kpi-label">Total Public Views</span>
          <strong className="kpi-value">{s.views.toLocaleString()}</strong>
          <small className="kpi-sub">Across all recipes</small>
        </div>

        <div className="kpi-card copies-card">
          <div className="kpi-icon-wrap"><Copy size={20} /></div>
          <span className="kpi-label">Prompt Copies</span>
          <strong className="kpi-value">{s.copies.toLocaleString()}</strong>
          <small className="kpi-sub">{copyRate}% conversion</small>
        </div>

        <div className="kpi-card saves-card">
          <div className="kpi-icon-wrap"><Bookmark size={20} /></div>
          <span className="kpi-label">Bookmarks Saved</span>
          <strong className="kpi-value">{s.saves.toLocaleString()}</strong>
          <small className="kpi-sub">Personal shelves</small>
        </div>

        <div className="kpi-card rating-card">
          <div className="kpi-icon-wrap"><ThumbsUp size={20} /></div>
          <span className="kpi-label">Community Rating</span>
          <strong className="kpi-value">{satisfactionScore}%</strong>
          <small className="kpi-sub">{s.positiveFeedback} positive reviews</small>
        </div>
      </div>

      {/* Visual Content Lifecycle Pipeline Funnel */}
      <div className="admin-card pipeline-card">
        <div className="pipeline-header">
          <div>
            <h2>Content Pipeline & Release Funnel</h2>
            <p>Visual status distribution across your recipe library.</p>
          </div>
          <div className="pipeline-legend">
            <span className="legend-item"><i className="dot dot-published" /> Published ({s.publishedRecipes})</span>
            <span className="legend-item"><i className="dot dot-testing" /> Testing ({s.testingRecipes})</span>
            <span className="legend-item"><i className="dot dot-draft" /> Drafts ({s.draftRecipes})</span>
          </div>
        </div>
        <div className="pipeline-bar-wrapper">
          <div
            className="pipeline-segment published"
            style={{ width: `${(publishedCount / totalRecipes) * 100}%` }}
            title={`Published: ${s.publishedRecipes}`}
          />
          <div
            className="pipeline-segment testing"
            style={{ width: `${(testingCount / totalRecipes) * 100}%` }}
            title={`Testing: ${s.testingRecipes}`}
          />
          <div
            className="pipeline-segment draft"
            style={{ width: `${(draftCount / totalRecipes) * 100}%` }}
            title={`Drafts: ${s.draftRecipes}`}
          />
        </div>
      </div>

      {/* Two Column Grid: Pending Submissions & Top Performing Workflows */}
      <div className="admin-two-col">
        {/* Left: Community Submissions Triage Queue */}
        <div className="admin-card triage-card">
          <div className="admin-card-heading">
            <div>
              <h2>Community Submissions Queue</h2>
              <p>Workflows shared by readers that can be converted into recipes.</p>
            </div>
            <Link href="/admin/submissions" className="arrow-link" data-testid="link-view-all-submissions">
              View all ({submissionsQuery.data?.length || 0}) <ArrowRight size={14} />
            </Link>
          </div>

          {pendingSubmissions.length === 0 ? (
            <div className="empty-triage-state">
              <CheckCircle2 size={32} className="accent-sage" />
              <h3>All caught up!</h3>
              <p>No pending community submissions right now.</p>
            </div>
          ) : (
            <div className="triage-items-list">
              {pendingSubmissions.slice(0, 3).map((sub) => (
                <div key={sub.id} className="triage-item-card">
                  <div className="triage-item-head">
                    <span className="status-badge pending">PENDING</span>
                    <time>{new Date(sub.createdAt).toLocaleDateString('en-IN')}</time>
                  </div>
                  <h3>{sub.title}</h3>
                  <p className="triage-item-snippet">{sub.problem}</p>
                  <div className="triage-actions-row">
                    <button
                      type="button"
                      className="button button-small button-dark"
                      onClick={() => handleConvertSubmission(sub)}
                      data-testid={`button-convert-submission-${sub.id}`}
                    >
                      <Wand2 size={13} /> Convert to Recipe & Edit
                    </button>
                    <button
                      type="button"
                      className="button button-small button-outline"
                      onClick={() => handleApproveSubmission(sub.id)}
                    >
                      <Check size={13} /> Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Top Performing Workflows */}
        <div className="admin-card top-recipes-card">
          <div className="admin-card-heading">
            <div>
              <h2>Top Performing Recipes</h2>
              <p>Workflows with the highest copy and reach counts.</p>
            </div>
            <Link href="/admin/recipes" className="arrow-link" data-testid="link-view-all-recipes">
              Manage all <ArrowRight size={14} />
            </Link>
          </div>

          <div className="top-recipes-list">
            {(recipesQuery.data?.items || [])
              .slice()
              .sort((a, b) => b.copyCount - a.copyCount)
              .slice(0, 5)
              .map((recipe) => (
                <div key={recipe.id} className="top-recipe-row">
                  <div className="top-recipe-info">
                    <Link href={`/admin/recipes/${recipe.id}`} className="top-recipe-title">
                      {recipe.title}
                    </Link>
                    <span className="top-recipe-meta">{recipe.category} · {recipe.estimatedTime}</span>
                  </div>
                  <div className="top-recipe-stats">
                    <span className="stat-pill"><Copy size={12} /> {recipe.copyCount} copies</span>
                    <span className="stat-pill"><Eye size={12} /> {recipe.viewCount} views</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <SmartDraftModal
        isOpen={showDraftModal}
        onClose={() => setShowDraftModal(false)}
        onSelectDraft={(draft) => {
          setShowDraftModal(false);
          setLocation(`/admin/recipes/new?draft=${encodeURIComponent(JSON.stringify(draft))}`);
        }}
        categories={categoriesQuery.data}
        audiences={audiencesQuery.data}
      />
    </div>
  );
}

function AdminRecipes() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const query = useListAdminRecipes({ q: q || undefined, status: status || undefined, page: 1 });
  const duplicate = useDuplicateAdminRecipe();
  const deleteMutation = useDeleteAdminRecipe();
  const importCsv = useImportAdminRecipesCsv();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [recipeToDelete, setRecipeToDelete] = useState<{ id: number; title: string } | null>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [importReport, setImportReport] = useState<ImportAdminRecipesResponse | null>(null);
  const [importError, setImportError] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const categoriesQuery = useListCategories();
  const audiencesQuery = useListAudiences();

  usePageMeta('Manage Recipes — AI Recipes', 'Edit, test, and publish recipes.');

  const handleDeleteConfirm = () => {
    if (!recipeToDelete) return;
    deleteMutation.mutate(
      { id: recipeToDelete.id },
      {
        onSuccess: () => {
          setRecipeToDelete(null);
          queryClient.invalidateQueries({ queryKey: getListAdminRecipesQueryKey({ q: q || undefined, status: status || undefined, page: 1 }) });
        },
      }
    );
  };

  const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setImportReport(null);
    setImportError('');
    setImportFileName(file.name);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportError('Choose a .csv file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportError('CSV files must be 5 MB or smaller.');
      return;
    }

    try {
      const csv = await file.text();
      if (!csv.trim()) {
        setImportError('The selected CSV is empty.');
        return;
      }
      importCsv.mutate({ data: { csv } }, {
        onSuccess: (report) => {
          setImportReport(report);
          void queryClient.invalidateQueries({ queryKey: getListAdminRecipesQueryKey({ q: q || undefined, status: status || undefined, page: 1 }) });
          void queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetHomeQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListRecipesQueryKey() });
        },
        onError: (error) => setImportError(error instanceof Error ? error.message : 'CSV import failed.'),
      });
    } catch {
      setImportError('Could not read the selected CSV file.');
    }
  };

  if (query.isLoading) return <LoadingState label="Loading recipe library..." />;
  if (query.isError || !query.data) return <ErrorState retry={() => query.refetch()} />;

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <span className="kicker">Content Library</span>
          <h1>Recipe Shelf ({query.data.total})</h1>
          <p className="admin-subtitle">Search, edit, test, and manage published and drafted recipes.</p>
        </div>
        <div className="admin-heading-actions">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={handleCsvFileChange}
            data-testid="input-admin-recipes-csv"
          />
          <button
            type="button"
            className="button button-outline"
            onClick={() => csvInputRef.current?.click()}
            disabled={importCsv.isPending}
            data-testid="button-admin-recipes-import-csv"
          >
            <Upload size={16} /> {importCsv.isPending ? 'Importing...' : 'Import CSV'}
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => setShowDraftModal(true)}
            data-testid="button-recipes-smart-draft"
          >
            <Wand2 size={16} /> ✨ Smart Draft
          </button>
          <Link href="/admin/recipes/new" className="button button-dark" data-testid="link-admin-add-recipe">
            <Plus size={16} /> Add Recipe
          </Link>
        </div>
      </div>

      {(importCsv.isPending || importError || importReport) && (
        <div className={`csv-import-feedback${importError || importReport?.failedCount ? ' has-errors' : ''}`} role={importError ? 'alert' : 'status'} aria-live="polite">
          {importCsv.isPending && <p>Importing {importFileName}...</p>}
          {importError && <p>{importError}</p>}
          {importReport && (
            <>
              <p><strong>{importReport.createdCount} recipes imported</strong> · {importReport.failedCount} rows need attention.</p>
              {importReport.failedCount > 0 && (
                <ul>
                  {importReport.results.filter((result) => result.status === 'failed').slice(0, 10).map((result) => (
                    <li key={`${result.row}-${result.slug}`}>Row {result.row}{result.slug ? ` (${result.slug})` : ''}: {result.message}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <div className="admin-toolbar">
        <div className="inline-search">
          <Search size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recipes by title or keyword..."
            data-testid="input-admin-recipes-search"
          />
        </div>
        <div className="admin-filter-pills">
          {['', 'PUBLISHED', 'TESTING', 'DRAFT'].map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-pill ${status === s ? 'active' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Recipe Title</th>
              <th>Category & Audience</th>
              <th>Status</th>
              <th>Engagement</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-empty-td">
                  No recipes found matching your filters.
                </td>
              </tr>
            ) : (
              query.data.items.map((recipe) => {
                const currentStatus = getAdminRecipeStatus(recipe);
                return (
                  <tr key={recipe.id}>
                    <td>
                      <Link href={`/admin/recipes/${recipe.id}`} className="table-title" data-testid={`link-admin-recipe-${recipe.id}`}>
                        {recipe.title}
                      </Link>
                      <small className="table-subinfo">{recipe.language} · {recipe.estimatedTime} · {recipe.difficulty}</small>
                    </td>
                    <td>
                      <span className="category-tag-pill">{recipe.category}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${currentStatus === 'PUBLISHED' ? 'published' : currentStatus === 'TESTING' ? 'testing' : 'draft'}`}>
                        {currentStatus}
                      </span>
                    </td>
                    <td>
                      <div className="table-reach-col">
                        <span><Eye size={12} /> {recipe.viewCount} views</span>
                        <span><Copy size={12} /> {recipe.copyCount} copies</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-actions-cell">
                        <Link href={`/admin/recipes/${recipe.id}`} className="table-action edit" title="Edit recipe">
                          <PenLine size={14} /> Edit
                        </Link>
                        <button
                          type="button"
                          className="table-action"
                          title="Duplicate as draft"
                          onClick={() => duplicate.mutate({ id: recipe.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAdminRecipesQueryKey({ q: q || undefined, status: status || undefined, page: 1 }) }) })}
                          data-testid={`button-duplicate-recipe-${recipe.id}`}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="table-action delete"
                          title="Delete recipe"
                          onClick={() => setRecipeToDelete({ id: recipe.id, title: recipe.title })}
                          data-testid={`button-delete-recipe-${recipe.id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                        {currentStatus === 'PUBLISHED' && (
                          <Link href={`/recipes/${recipe.slug}`} target="_blank" className="table-action view" title="View public page">
                            <ExternalLink size={14} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {recipeToDelete && (
        <div className="modal-backdrop" onClick={() => setRecipeToDelete(null)}>
          <div className="modal-container delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="delete-icon-wrap"><AlertCircle size={24} /></div>
              <h2>Confirm Deletion</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to permanently delete <strong>{recipeToDelete.title}</strong>?</p>
              <small>This will remove the recipe from the public library, search index, and saved user shelves.</small>
              <div className="modal-actions">
                <button type="button" className="button button-outline" onClick={() => setRecipeToDelete(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  disabled={deleteMutation.isPending}
                  onClick={handleDeleteConfirm}
                  data-testid="button-confirm-delete"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete Recipe'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SmartDraftModal
        isOpen={showDraftModal}
        onClose={() => setShowDraftModal(false)}
        onImportCsv={() => {
          csvInputRef.current?.click();
          setShowDraftModal(false);
        }}
        onSelectDraft={(draft) => {
          setShowDraftModal(false);
          setLocation(`/admin/recipes/new?draft=${encodeURIComponent(JSON.stringify(draft))}`);
        }}
        categories={categoriesQuery.data}
        audiences={audiencesQuery.data}
      />
    </div>
  );
}

function getAdminRecipeStatus(recipe: RecipeCard) {
  const withStatus = recipe as RecipeCard & { status?: string };
  return withStatus.status?.toUpperCase() ?? (recipe.featured ? 'PUBLISHED' : 'DRAFT');
}

const emptyRecipe: RecipeInput = {
  title: '',
  slug: '',
  shortDescription: '',
  problem: '',
  categoryId: 1,
  audienceId: 1,
  subcategory: 'Workflows',
  difficulty: 'Beginner',
  estimatedTime: '15 min',
  language: 'English',
  aiTools: ['ChatGPT-4o', 'Claude 3.5 Sonnet'],
  requiredInputs: ['[Context / Background notes]', '[Key Parameters]'],
  steps: [
    'Gather required background materials and inputs.',
    'Run the copyable prompt with your filled variables.',
    'Review the generated result against the verification notes.'
  ],
  prompt: '',
  exampleInput: '',
  exampleOutput: '',
  refinementPrompts: ['Make this 20% shorter and crisper.', 'Adapt tone for mobile readers.'],
  verificationNotes: 'Check that all placeholder brackets are replaced with actual context.',
  tags: ['workflow', 'practical'],
  status: 'DRAFT',
  featured: false,
  trending: false,
  recipeOfDay: false,
  version: '1.0',
  testedAt: null,
  testedWith: [],
  seoTitle: '',
  seoDescription: '',
};

type RecipeGuideData = RecipeGuide;

function createEmptyRecipeGuide(requiredInputs: string[] = []): RecipeGuideData {
  return {
    snapshot: { bestWith: [] },
    useCases: [],
    whenNotToUse: [],
    inputs: { required: [...requiredInputs], optional: [] },
    situations: [],
    tools: [],
    promptVariables: [],
    expectedOutput: { description: '', characteristics: [] },
    examples: [],
    bestFor: { people: [], tasks: [], channels: [] },
    timeToResult: '',
    effort: '',
    typicalIterations: '',
    commonMistakes: [],
    betterApproach: '',
    proTips: [],
    safetyNotes: [],
    quality: { status: 'untested', lastTested: null, version: '1.0', testedWith: [] },
  };
}

function normalizeRecipeGuide(guide?: RecipeGuideData | null, requiredInputs: string[] = []): RecipeGuideData {
  const defaults = createEmptyRecipeGuide(requiredInputs);
  return {
    ...defaults,
    ...guide,
    snapshot: { ...defaults.snapshot, ...guide?.snapshot },
    useCases: guide?.useCases ?? defaults.useCases,
    whenNotToUse: guide?.whenNotToUse ?? defaults.whenNotToUse,
    inputs: { ...defaults.inputs, ...guide?.inputs, required: guide?.inputs?.required ?? requiredInputs },
    situations: guide?.situations ?? defaults.situations,
    tools: guide?.tools ?? defaults.tools,
    promptVariables: guide?.promptVariables ?? defaults.promptVariables,
    expectedOutput: { ...defaults.expectedOutput, ...guide?.expectedOutput },
    examples: guide?.examples ?? defaults.examples,
    bestFor: { ...defaults.bestFor, ...guide?.bestFor },
    commonMistakes: guide?.commonMistakes ?? defaults.commonMistakes,
    proTips: guide?.proTips ?? defaults.proTips,
    safetyNotes: guide?.safetyNotes ?? defaults.safetyNotes,
    quality: { ...defaults.quality, ...guide?.quality },
  };
}

function cleanRecipeGuide(guide: RecipeGuideData, requiredInputs: string[]): RecipeGuideData {
  const normalized = normalizeRecipeGuide(guide, requiredInputs);
  const cleanStrings = (items?: string[]) => (items ?? []).map((item) => item.trim()).filter(Boolean);
  return {
    ...normalized,
    snapshot: { ...normalized.snapshot, bestWith: cleanStrings(normalized.snapshot?.bestWith) },
    useCases: (normalized.useCases ?? []).map((item) => ({ name: item.name.trim(), description: item.description.trim() })).filter((item) => item.name && item.description),
    whenNotToUse: cleanStrings(normalized.whenNotToUse),
    inputs: { required: cleanStrings(requiredInputs), optional: cleanStrings(normalized.inputs?.optional) },
    situations: (normalized.situations ?? []).map((item) => ({ ...item, name: item.name.trim(), description: item.description?.trim(), promptModifier: item.promptModifier.trim() })).filter((item) => item.name && item.promptModifier),
    tools: (normalized.tools ?? []).map((item) => ({ ...item, name: item.name.trim(), notes: item.notes?.trim() })).filter((item) => item.name),
    promptVariables: (normalized.promptVariables ?? []).map((item) => ({ ...item, name: item.name.trim(), label: item.label.trim(), placeholder: item.placeholder?.trim() })).filter((item) => item.name && item.label),
    expectedOutput: { ...normalized.expectedOutput, characteristics: cleanStrings(normalized.expectedOutput?.characteristics) },
    examples: (normalized.examples ?? []).map((item) => ({ ...item, scenario: item.scenario.trim(), input: item.input.trim(), output: item.output.trim(), whyItWorks: cleanStrings(item.whyItWorks) })).filter((item) => item.scenario && item.input && item.output),
    bestFor: { people: cleanStrings(normalized.bestFor?.people), tasks: cleanStrings(normalized.bestFor?.tasks), channels: cleanStrings(normalized.bestFor?.channels) },
    commonMistakes: cleanStrings(normalized.commonMistakes),
    betterApproach: normalized.betterApproach?.trim() ?? '',
    proTips: cleanStrings(normalized.proTips),
    safetyNotes: cleanStrings(normalized.safetyNotes),
    quality: { ...normalized.quality, testedWith: cleanStrings(normalized.quality?.testedWith) },
  };
}

function StringListEditor({
  label,
  values,
  onChange,
  placeholder = 'Add an item',
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  return (
    <fieldset className="repeatable-list-field">
      <legend>{label}</legend>
      <div className="repeatable-list-items">
        {values.map((value, index) => (
          <div className="repeatable-list-row" key={`${label}-${index}`}>
            <input
              value={value}
              onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
              aria-label={`${label} ${index + 1}`}
              placeholder={placeholder}
            />
            <button type="button" className="repeatable-remove" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}>
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="repeatable-add" onClick={() => onChange([...values, ''])}>
        <Plus size={14} /> Add {label.toLowerCase()}
      </button>
    </fieldset>
  );
}

function AdminRecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const list = useListAdminRecipes({ page: 1 });
  const existing = list.data?.items.find((item) => item.id === Number(id));
  const categories = useListCategories();
  const audiences = useListAudiences();
  const create = useCreateAdminRecipe();
  const update = useUpdateAdminRecipe();
  const deleteMutation = useDeleteAdminRecipe();
  const duplicateMutation = useDuplicateAdminRecipe();
  const updateSubmission = useUpdateAdminSubmission();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<RecipeInput>(emptyRecipe);
  const [guide, setGuide] = useState<RecipeGuideData>(() => createEmptyRecipeGuide(emptyRecipe.requiredInputs));
  const [editorTab, setEditorTab] = useState<'edit' | 'preview' | 'checklist'>('edit');
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Check URL params for draft prefill or submission conversion
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const draftParam = urlParams.get('draft');
    if (draftParam && isNew) {
      try {
        const parsed = JSON.parse(draftParam) as Partial<RecipeInput> & { guide?: RecipeGuideData };
        setForm((prev) => ({ ...prev, ...parsed }));
        if (parsed.guide) setGuide(normalizeRecipeGuide(parsed.guide));
      } catch (err) {
        console.error('Failed to parse draft from URL:', err);
      }
    }
  }, [isNew]);

  const existingDetail = existing as unknown as (Recipe & { guide?: RecipeGuideData | null }) | undefined;
  useEffect(() => {
    if (existingDetail && !isNew) {
      const loadedGuide = normalizeRecipeGuide(existingDetail.guide, existingDetail.requiredInputs);
      if (!existingDetail.guide?.quality && existingDetail.testedAt && existingDetail.testedWith?.length) {
        loadedGuide.quality = { status: 'tested', lastTested: existingDetail.testedAt, version: existingDetail.version, testedWith: existingDetail.testedWith };
      }
      setGuide(loadedGuide);
      setForm((old) => ({
        ...old,
        title: existingDetail.title,
        slug: existingDetail.slug,
        shortDescription: existingDetail.shortDescription,
        problem: existingDetail.problem,
        categoryId: categories.data?.find((item) => item.slug === existingDetail.categorySlug)?.id ?? old.categoryId,
        audienceId: audiences.data?.find((item) => item.slug === existingDetail.audienceSlug)?.id ?? old.audienceId,
        subcategory: existingDetail.subcategory,
        difficulty: existingDetail.difficulty,
        estimatedTime: existingDetail.estimatedTime,
        language: existingDetail.language,
        aiTools: existingDetail.aiTools,
        requiredInputs: existingDetail.guide?.inputs?.required ?? existingDetail.requiredInputs,
        steps: existingDetail.steps,
        prompt: existingDetail.prompt,
        exampleInput: existingDetail.exampleInput,
        exampleOutput: existingDetail.exampleOutput,
        refinementPrompts: existingDetail.refinementPrompts,
        verificationNotes: existingDetail.verificationNotes,
        tags: existingDetail.tags,
        status: getAdminRecipeStatus(existingDetail),
        featured: existingDetail.featured,
        trending: existingDetail.trending,
        recipeOfDay: (existingDetail as any)?.recipeOfDay ?? false,
        version: existingDetail.version,
        testedAt: existingDetail.testedAt,
        testedWith: existingDetail.testedWith,
        seoTitle: existingDetail.seoTitle,
        seoDescription: existingDetail.seoDescription,
      }));
    }
  }, [existingDetail, isNew, categories.data, audiences.data]);

  const set = (key: keyof RecipeInput) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox'
      ? (e.target as HTMLInputElement).checked
      : key === 'categoryId' || key === 'audienceId'
        ? Number(e.target.value)
        : e.target.value;
    setForm({ ...form, [key]: value });
  };

  const setList = (key: 'aiTools' | 'requiredInputs' | 'steps' | 'refinementPrompts' | 'tags' | 'testedWith') => (e: ChangeEvent<HTMLTextAreaElement>) => {
    setForm({ ...form, [key]: e.target.value.split('\n').map((value) => value.trim()).filter(Boolean) });
  };

  const updateGuide = (patch: Partial<RecipeGuideData>) => {
    setGuide((current) => normalizeRecipeGuide({ ...current, ...patch }, form.requiredInputs));
  };
  const updateGuideList = (key: 'whenNotToUse' | 'commonMistakes' | 'proTips' | 'safetyNotes', values: string[]) => updateGuide({ [key]: values });
  const updateGuideInputs = (key: 'required' | 'optional', values: string[]) => {
    updateGuide({ inputs: { ...guide.inputs, [key]: values } });
    if (key === 'required') setForm((current) => ({ ...current, requiredInputs: values }));
  };
  const updateBestFor = (key: 'people' | 'tasks' | 'channels', values: string[]) => updateGuide({ bestFor: { ...guide.bestFor, [key]: values } });

  const autoGenerateSlug = () => {
    if (!form.title) return;
    const generated = form.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 45);
    setForm((prev) => ({
      ...prev,
      slug: generated,
      seoTitle: prev.seoTitle || `${prev.title} | AI Recipes`,
      seoDescription: prev.seoDescription || prev.shortDescription,
    }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const mutation = isNew ? create : update;
    const cleanGuide = cleanRecipeGuide(guide, form.requiredInputs);
    cleanGuide.quality = {
      ...cleanGuide.quality,
      version: form.version || cleanGuide.quality?.version,
      lastTested: cleanGuide.quality?.status === 'tested'
        ? cleanGuide.quality.lastTested || form.testedAt || null
        : cleanGuide.quality?.lastTested,
      testedWith: cleanGuide.quality?.status === 'tested'
        ? cleanGuide.quality.testedWith?.length ? cleanGuide.quality.testedWith : form.testedWith
        : cleanGuide.quality?.testedWith,
    };
    const body = {
      data: {
        ...form,
        testedAt: cleanGuide.quality.status === 'tested' ? cleanGuide.quality.lastTested : form.testedAt,
        testedWith: cleanGuide.quality.status === 'tested' ? cleanGuide.quality.testedWith ?? form.testedWith : form.testedWith,
        guide: cleanGuide,
      },
      ...(isNew ? {} : { id: Number(id) }),
    } as never;
    mutation.mutate(body, {
      onSuccess: () => {
        // If converting a submission, mark it as CONVERTED
        const urlParams = new URLSearchParams(window.location.search);
        const submissionId = urlParams.get('submissionId');
        if (submissionId) {
          updateSubmission.mutate({ id: Number(submissionId), data: { status: 'CONVERTED' } });
        }
        queryClient.invalidateQueries({ queryKey: getListAdminRecipesQueryKey() });
        setLocation('/admin/recipes');
      },
    });
  };

  const handleDeleteRecipe = () => {
    if (isNew) return;
    deleteMutation.mutate(
      { id: Number(id) },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminRecipesQueryKey() });
          setLocation('/admin/recipes');
        },
      }
    );
  };

  const handleDuplicateRecipe = () => {
    if (isNew) return;
    duplicateMutation.mutate(
      { id: Number(id) },
      {
        onSuccess: (dup: any) => {
          queryClient.invalidateQueries({ queryKey: getListAdminRecipesQueryKey() });
          setLocation(`/admin/recipes/${dup.id}`);
        },
      }
    );
  };

  // Real-time Checklist computation
  const checklist = [
    { label: 'Catchy & clear Title (>= 3 chars)', done: form.title.trim().length >= 3 },
    { label: 'Meaningful Problem statement (>= 15 chars)', done: form.problem.trim().length >= 15 },
    { label: 'At least 2 Required Inputs', done: form.requiredInputs.length >= 2 },
    { label: 'At least 3 Workflow Steps', done: form.steps.length >= 3 },
    { label: 'Structured Prompt (>= 40 chars)', done: form.prompt.trim().length >= 40 },
    { label: 'Real-world Example Input & Output provided', done: Boolean(form.exampleInput.trim() && form.exampleOutput.trim()) },
    { label: 'Honest Verification & Testing Notes', done: form.verificationNotes.trim().length >= 10 },
    { label: 'Tested with AI Model specified', done: Boolean(guide.quality?.testedWith?.length || form.testedWith.length) },
    { label: 'Useful moment described', done: Boolean(guide.snapshot?.worksBestWhen?.trim() || guide.useCases?.length) },
    { label: 'Expected output described', done: Boolean(guide.expectedOutput?.description?.trim()) },
  ];
  const completedChecks = checklist.filter((c) => c.done).length;
  const completenessScore = Math.round((completedChecks / checklist.length) * 100);

  const selectedCategoryName = categories.data?.find((c) => c.id === form.categoryId)?.name || 'Category';
  const selectedAudienceName = audiences.data?.find((a) => a.id === form.audienceId)?.name || 'Audience';

  usePageMeta(isNew ? 'New Recipe Editor — AI Recipes' : `Edit: ${form.title || 'Recipe'} — AI Recipes`, 'Edit and curate practical AI workflows.');

  return (
    <div className="admin-page editor-page">
      <div className="admin-page-heading editor-topbar-heading">
        <div>
          <Link href="/admin/recipes" className="back-link" data-testid="link-back-admin-recipes">
            <ChevronLeft size={15} /> Back to Recipes
          </Link>
          <h1>{isNew ? 'Create New AI Recipe' : `Edit: ${form.title || 'Recipe'}`}</h1>
        </div>
        <div className="editor-heading-actions">
          <button
            type="button"
            className="button button-outline"
            onClick={() => setShowDraftModal(true)}
            data-testid="button-editor-ai-draft"
          >
            <Wand2 size={15} /> ✨ Smart Auto-Fill & Presets
          </button>
          {!isNew && (
            <button
              type="button"
              className="button button-outline"
              onClick={handleDuplicateRecipe}
              data-testid="button-editor-duplicate"
            >
              <Copy size={15} /> Duplicate
            </button>
          )}
          {!isNew && (
            <button
              type="button"
              className="button button-outline delete-btn"
              onClick={() => setShowDeleteModal(true)}
              data-testid="button-editor-delete"
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button
            type="button"
            className="button button-dark"
            onClick={submit}
            disabled={create.isPending || update.isPending}
            data-testid="button-header-save"
          >
            {create.isPending || update.isPending ? 'Saving...' : form.status === 'PUBLISHED' ? 'Publish Recipe 🚀' : 'Save Draft 💾'}
          </button>
        </div>
      </div>

      {/* Editor Navigation Tabs */}
      <div className="editor-nav-tabs">
        <button
          type="button"
          className={editorTab === 'edit' ? 'active' : ''}
          onClick={() => setEditorTab('edit')}
          data-testid="tab-editor-form"
        >
          <FileText size={16} /> 📝 Structured Editor
        </button>
        <button
          type="button"
          className={editorTab === 'preview' ? 'active' : ''}
          onClick={() => setEditorTab('preview')}
          data-testid="tab-editor-preview"
        >
          <Eye size={16} /> 👁️ Live Real-Time Preview
        </button>
        <button
          type="button"
          className={editorTab === 'checklist' ? 'active' : ''}
          onClick={() => setEditorTab('checklist')}
          data-testid="tab-editor-checklist"
        >
          <CheckCircle2 size={16} /> ✅ Quality Checklist ({completenessScore}%)
        </button>
      </div>

      {/* Tab 1: Form View */}
      {editorTab === 'edit' && (
        <form className="editor-form" onSubmit={submit}>
          <div className="editor-main">
            <div className="editor-section-label">01 / Concept & Taxonomy</div>
            <label>
              Recipe Title
              <input
                required
                value={form.title}
                onChange={set('title')}
                onBlur={autoGenerateSlug}
                placeholder="e.g. B2B Cold Outreach for Decision Makers"
                data-testid="input-editor-title"
              />
            </label>
            <div className="editor-split">
              <label>
                URL Slug
                <div className="input-with-action">
                  <input
                    required
                    value={form.slug}
                    onChange={set('slug')}
                    placeholder="clear-url-slug"
                    data-testid="input-editor-slug"
                  />
                  <button type="button" className="inline-action-btn" onClick={autoGenerateSlug}>
                    Auto-Slug
                  </button>
                </div>
              </label>
              <label>
                Subcategory
                <input
                  value={form.subcategory}
                  onChange={set('subcategory')}
                  placeholder="e.g. Sales, Code Review, Revision"
                />
              </label>
            </div>
            <label>
              Short Description (1-2 sentences)
              <textarea
                required
                value={form.shortDescription}
                onChange={set('shortDescription')}
                placeholder="What does this workflow help someone achieve?"
                data-testid="input-editor-description"
              />
            </label>
            <label>
              The Real Problem / Pain Point
              <textarea
                required
                value={form.problem}
                onChange={set('problem')}
                placeholder="Name the frustrating or inefficient moment this recipe solves."
                data-testid="input-editor-problem"
              />
            </label>
            <div className="editor-split">
              <label>
                Category
                <select value={form.categoryId} onChange={set('categoryId')}>
                  {categories.data?.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Target Audience
                <select value={form.audienceId} onChange={set('audienceId')}>
                  {audiences.data?.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="editor-section-label">02 / Step-by-Step Workflow & Prompt</div>
            <StringListEditor
              label="Required inputs"
              values={form.requiredInputs}
              onChange={(values) => updateGuideInputs('required', values)}
              placeholder="e.g. Customer's original message"
            />
            <label>
              Steps to Execute (One step per line)
              <textarea
                className="tall-input"
                value={form.steps.join('\n')}
                onChange={setList('steps')}
                placeholder="Step 1...\nStep 2...\nStep 3..."
              />
            </label>
            <label>
              The Copyable Prompt
              <textarea
                required
                className="tall-input code-input"
                value={form.prompt}
                onChange={set('prompt')}
                placeholder="Write the exact battle-tested prompt with bracketed [VARIABLES]..."
                data-testid="input-editor-prompt"
              />
            </label>
            <div className="editor-split">
              <label>
                Example Input (Variables filled in)
                <textarea
                  value={form.exampleInput}
                  onChange={set('exampleInput')}
                  placeholder="Show real-world inputs..."
                />
              </label>
              <label>
                Example Output (Demonstration result)
                <textarea
                  value={form.exampleOutput}
                  onChange={set('exampleOutput')}
                  placeholder="Show the ideal output from AI..."
                />
              </label>
            </div>

            <div className="editor-section-label">03 / Quality, Trust & Refinement</div>
            <label>
              Refinement Follow-Up Prompts (One per line)
              <textarea
                value={form.refinementPrompts.join('\n')}
                onChange={setList('refinementPrompts')}
                placeholder="Make this 20% shorter...\nAdapt tone for mobile..."
              />
            </label>
            <label>
              Verification & Testing Notes (How to verify accuracy)
              <textarea
                value={form.verificationNotes}
                onChange={set('verificationNotes')}
                placeholder="What checks should the user make before sending/using the output?"
                data-testid="input-editor-verification"
              />
            </label>
            <div className="editor-split">
              <label>
                AI Tools (One per line)
                <textarea
                  value={form.aiTools.join('\n')}
                  onChange={setList('aiTools')}
                  placeholder="ChatGPT-4o\nClaude 3.5 Sonnet\nPerplexity"
                />
              </label>
              <label>
                Tags (One per line)
                <textarea
                  value={form.tags.join('\n')}
                  onChange={setList('tags')}
                  placeholder="outreach\nsales\nb2b"
                />
              </label>
            </div>
            <div className="editor-split">
              <label>
                Tested With (Assistants/Models)
                <textarea
                  value={form.testedWith.join('\n')}
                  onChange={setList('testedWith')}
                  placeholder="Claude 3.5 Sonnet\nChatGPT-4o"
                />
              </label>
              <label>
                Tested Date
                <input
                  type="date"
                  value={form.testedAt ?? ''}
                  onChange={set('testedAt')}
                />
              </label>
            </div>

            <div className="editor-section-label">04 / Discovery & Metadata</div>
            <div className="editor-split">
              <label>
                Difficulty
                <select value={form.difficulty} onChange={set('difficulty')}>
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </label>
              <label>
                Estimated Time
                <input
                  value={form.estimatedTime}
                  onChange={set('estimatedTime')}
                  data-testid="input-editor-time"
                />
              </label>
            </div>
            <div className="editor-split">
              <label>
                Version
                <input value={form.version} onChange={set('version')} />
              </label>
              <label>
                SEO Title
                <input value={form.seoTitle} onChange={set('seoTitle')} />
              </label>
            </div>
            <label>
              SEO Description
              <textarea value={form.seoDescription} onChange={set('seoDescription')} />
            </label>

            <div className="editor-section-label">05 / Practical Recipe Guide</div>
            <details className="recipe-guide-editor" open>
              <summary>Snapshot, useful situations, and audience</summary>
              <div className="editor-split">
                <label>Best for<input value={guide.snapshot?.bestFor ?? ''} onChange={(event) => updateGuide({ snapshot: { ...guide.snapshot, bestFor: event.target.value } })} /></label>
                <label>Works best when<input value={guide.snapshot?.worksBestWhen ?? ''} onChange={(event) => updateGuide({ snapshot: { ...guide.snapshot, worksBestWhen: event.target.value } })} /></label>
                <label>Time to result<input value={guide.timeToResult ?? guide.snapshot?.timeToResult ?? ''} onChange={(event) => updateGuide({ timeToResult: event.target.value, snapshot: { ...guide.snapshot, timeToResult: event.target.value } })} placeholder="About 5 minutes" /></label>
                <label>Output<input value={guide.snapshot?.output ?? guide.expectedOutput?.description ?? ''} onChange={(event) => updateGuide({ snapshot: { ...guide.snapshot, output: event.target.value } })} /></label>
                <label>Skill level<input value={guide.snapshot?.skillLevel ?? ''} onChange={(event) => updateGuide({ snapshot: { ...guide.snapshot, skillLevel: event.target.value } })} placeholder="Beginner" /></label>
              </div>
              <StringListEditor label="Best with" values={guide.snapshot?.bestWith ?? []} onChange={(values) => updateGuide({ snapshot: { ...guide.snapshot, bestWith: values } })} placeholder="ChatGPT" />
              <StringListEditor label="Best for people" values={guide.bestFor?.people ?? []} onChange={(values) => updateBestFor('people', values)} />
              <StringListEditor label="Best for tasks" values={guide.bestFor?.tasks ?? []} onChange={(values) => updateBestFor('tasks', values)} />
              <StringListEditor label="Best for channels" values={guide.bestFor?.channels ?? []} onChange={(values) => updateBestFor('channels', values)} />
              <div className="repeatable-object-list">
                <div className="repeatable-object-heading"><strong>When this recipe is useful</strong><button type="button" className="repeatable-add" onClick={() => updateGuide({ useCases: [...(guide.useCases ?? []), { name: '', description: '' }] })}><Plus size={14} /> Add use case</button></div>
                {(guide.useCases ?? []).map((item, index) => (
                  <div className="repeatable-object-card" key={`use-case-${index}`}>
                    <div className="repeatable-object-heading"><span>Use case {index + 1}</span><button type="button" className="repeatable-remove" onClick={() => updateGuide({ useCases: (guide.useCases ?? []).filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove use case ${index + 1}`}><X size={15} /></button></div>
                    <input aria-label={`Use case ${index + 1} name`} value={item.name} onChange={(event) => updateGuide({ useCases: (guide.useCases ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, name: event.target.value } : value) })} placeholder="e.g. Reply to a price question" />
                    <textarea aria-label={`Use case ${index + 1} description`} value={item.description} onChange={(event) => updateGuide({ useCases: (guide.useCases ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, description: event.target.value } : value) })} placeholder="Describe the moment this recipe helps with." />
                  </div>
                ))}
              </div>
              <StringListEditor label="When not to use this" values={guide.whenNotToUse ?? []} onChange={(values) => updateGuideList('whenNotToUse', values)} />
            </details>

            <details className="recipe-guide-editor">
              <summary>Inputs, situations, tools, and prompt variables</summary>
              <StringListEditor label="Optional inputs" values={guide.inputs?.optional ?? []} onChange={(values) => updateGuideInputs('optional', values)} />
              <div className="repeatable-object-list">
                <div className="repeatable-object-heading"><strong>Choose your situation</strong><button type="button" className="repeatable-add" onClick={() => updateGuide({ situations: [...(guide.situations ?? []), { name: '', description: '', promptModifier: '' }] })}><Plus size={14} /> Add situation</button></div>
                {(guide.situations ?? []).map((item, index) => (
                  <div className="repeatable-object-card" key={`situation-${index}`}>
                    <div className="repeatable-object-heading"><span>Situation {index + 1}</span><button type="button" className="repeatable-remove" onClick={() => updateGuide({ situations: (guide.situations ?? []).filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove situation ${index + 1}`}><X size={15} /></button></div>
                    <input aria-label={`Situation ${index + 1} name`} value={item.name} onChange={(event) => updateGuide({ situations: (guide.situations ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, name: event.target.value } : value) })} placeholder="Customer complaint" />
                    <input aria-label={`Situation ${index + 1} description`} value={item.description ?? ''} onChange={(event) => updateGuide({ situations: (guide.situations ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, description: event.target.value } : value) })} placeholder="What is happening?" />
                    <textarea aria-label={`Situation ${index + 1} prompt modifier`} value={item.promptModifier} onChange={(event) => updateGuide({ situations: (guide.situations ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, promptModifier: event.target.value } : value) })} placeholder="Add situation-specific instructions to the prompt." />
                  </div>
                ))}
              </div>
              <div className="repeatable-object-list">
                <div className="repeatable-object-heading"><strong>Supported AI tools</strong><button type="button" className="repeatable-add" onClick={() => updateGuide({ tools: [...(guide.tools ?? []), { name: '', support: 'compatible' }] })}><Plus size={14} /> Add tool</button></div>
                {(guide.tools ?? []).map((item, index) => (
                  <div className="repeatable-object-card" key={`tool-${index}`}>
                    <div className="repeatable-object-heading"><span>Tool {index + 1}</span><button type="button" className="repeatable-remove" onClick={() => updateGuide({ tools: (guide.tools ?? []).filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove tool ${index + 1}`}><X size={15} /></button></div>
                    <div className="editor-split"><input aria-label={`Tool ${index + 1} name`} value={item.name} onChange={(event) => updateGuide({ tools: (guide.tools ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, name: event.target.value } : value) })} placeholder="ChatGPT" /><select aria-label={`Tool ${index + 1} support`} value={item.support} onChange={(event) => updateGuide({ tools: (guide.tools ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, support: event.target.value as typeof value.support } : value) })}><option value="compatible">Compatible</option><option value="good">Good</option><option value="excellent">Excellent</option></select></div>
                    <input aria-label={`Tool ${index + 1} notes`} value={item.notes ?? ''} onChange={(event) => updateGuide({ tools: (guide.tools ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, notes: event.target.value } : value) })} placeholder="Optional tested notes" />
                  </div>
                ))}
              </div>
              <div className="repeatable-object-list">
                <div className="repeatable-object-heading"><strong>Prompt variables</strong><button type="button" className="repeatable-add" onClick={() => updateGuide({ promptVariables: [...(guide.promptVariables ?? []), { name: '', label: '', required: false }] })}><Plus size={14} /> Add variable</button></div>
                {(guide.promptVariables ?? []).map((item, index) => (
                  <div className="repeatable-object-card" key={`variable-${index}`}>
                    <div className="repeatable-object-heading"><span>Variable {index + 1}</span><button type="button" className="repeatable-remove" onClick={() => updateGuide({ promptVariables: (guide.promptVariables ?? []).filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove variable ${index + 1}`}><X size={15} /></button></div>
                    <div className="editor-split"><input aria-label={`Variable ${index + 1} name`} value={item.name} onChange={(event) => updateGuide({ promptVariables: (guide.promptVariables ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, name: event.target.value } : value) })} placeholder="CUSTOMER_MESSAGE" /><input aria-label={`Variable ${index + 1} label`} value={item.label} onChange={(event) => updateGuide({ promptVariables: (guide.promptVariables ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, label: event.target.value } : value) })} placeholder="Customer message" /></div>
                    <input aria-label={`Variable ${index + 1} placeholder`} value={item.placeholder ?? ''} onChange={(event) => updateGuide({ promptVariables: (guide.promptVariables ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, placeholder: event.target.value } : value) })} placeholder="Paste the original message" />
                    <label className="toggle-line"><input type="checkbox" checked={item.required ?? false} onChange={(event) => updateGuide({ promptVariables: (guide.promptVariables ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, required: event.target.checked } : value) })} /> Required before prompt generation</label>
                  </div>
                ))}
              </div>
            </details>

            <details className="recipe-guide-editor">
              <summary>Expected output, examples, tips, safety, and testing</summary>
              <label>Expected output<textarea value={guide.expectedOutput?.description ?? ''} onChange={(event) => updateGuide({ expectedOutput: { ...guide.expectedOutput, description: event.target.value } })} placeholder="Describe the result and what makes it useful." /></label>
              <StringListEditor label="Output characteristics" values={guide.expectedOutput?.characteristics ?? []} onChange={(values) => updateGuide({ expectedOutput: { ...guide.expectedOutput, characteristics: values } })} />
              <div className="repeatable-object-list">
                <div className="repeatable-object-heading"><strong>Realistic examples</strong><button type="button" className="repeatable-add" onClick={() => updateGuide({ examples: [...(guide.examples ?? []), { scenario: '', input: '', output: '', whyItWorks: [] }] })}><Plus size={14} /> Add example</button></div>
                {(guide.examples ?? []).map((item, index) => (
                  <div className="repeatable-object-card" key={`example-${index}`}>
                    <div className="repeatable-object-heading"><span>Example {index + 1}</span><button type="button" className="repeatable-remove" onClick={() => updateGuide({ examples: (guide.examples ?? []).filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove example ${index + 1}`}><X size={15} /></button></div>
                    <input aria-label={`Example ${index + 1} scenario`} value={item.scenario} onChange={(event) => updateGuide({ examples: (guide.examples ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, scenario: event.target.value } : value) })} placeholder="Customer complaint" />
                    <textarea aria-label={`Example ${index + 1} input`} value={item.input} onChange={(event) => updateGuide({ examples: (guide.examples ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, input: event.target.value } : value) })} placeholder="Realistic input" />
                    <textarea aria-label={`Example ${index + 1} output`} value={item.output} onChange={(event) => updateGuide({ examples: (guide.examples ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, output: event.target.value } : value) })} placeholder="A realistic result" />
                    <StringListEditor label={`Why example ${index + 1} works`} values={item.whyItWorks ?? []} onChange={(values) => updateGuide({ examples: (guide.examples ?? []).map((value, itemIndex) => itemIndex === index ? { ...value, whyItWorks: values } : value) })} />
                  </div>
                ))}
              </div>
              <StringListEditor label="Common mistakes" values={guide.commonMistakes ?? []} onChange={(values) => updateGuideList('commonMistakes', values)} />
              <label>Better approach<textarea value={guide.betterApproach ?? ''} onChange={(event) => updateGuide({ betterApproach: event.target.value })} /></label>
              <StringListEditor label="Pro tips" values={guide.proTips ?? []} onChange={(values) => updateGuideList('proTips', values)} />
              <StringListEditor label="Additional safety notes" values={guide.safetyNotes ?? []} onChange={(values) => updateGuideList('safetyNotes', values)} />
              <div className="editor-split">
                <label>Effort<input value={guide.effort ?? ''} onChange={(event) => updateGuide({ effort: event.target.value })} placeholder="Low" /></label>
                <label>Typical AI iterations<input value={guide.typicalIterations ?? ''} onChange={(event) => updateGuide({ typicalIterations: event.target.value })} placeholder="1–3" /></label>
              </div>
              <div className="editor-split">
                <label>Recipe test status<select value={guide.quality?.status ?? 'untested'} onChange={(event) => updateGuide({ quality: { ...guide.quality, status: event.target.value as NonNullable<RecipeGuideData['quality']>['status'] } })}><option value="untested">Not tested</option><option value="in_testing">In testing</option><option value="tested">Tested</option></select></label>
                <label>Last tested<input type="date" value={guide.quality?.lastTested ?? ''} onChange={(event) => updateGuide({ quality: { ...guide.quality, lastTested: event.target.value || null } })} /></label>
              </div>
              <StringListEditor label="Tested with" values={guide.quality?.testedWith ?? []} onChange={(values) => updateGuide({ quality: { ...guide.quality, testedWith: values } })} />
            </details>
          </div>

          <aside className="editor-aside">
            <div className="aside-card completeness-aside-card">
              <div className="completeness-header">
                <span className="kicker">Quality Score</span>
                <strong>{completenessScore}%</strong>
              </div>
              <div className="completeness-bar">
                <div className="completeness-fill" style={{ width: `${completenessScore}%` }} />
              </div>
              <p className="completeness-hint">
                {completenessScore === 100
                  ? '✨ Excellent quality! Ready for publishing.'
                  : `${checklist.length - completedChecks} items remaining in quality checklist.`}
              </p>
            </div>

            <div className="aside-card editor-publish">
              <label>
                Publishing Status
                <select value={form.status} onChange={set('status')}>
                  <option value="DRAFT">Draft</option>
                  <option value="TESTING">In Testing / QA</option>
                  <option value="PUBLISHED">Published (Live)</option>
                </select>
              </label>
              <label className="toggle-line">
                <input type="checkbox" checked={form.featured} onChange={set('featured')} /> Featured on Shelves
              </label>
              <label className="toggle-line">
                <input type="checkbox" checked={form.trending} onChange={set('trending')} /> Mark as Trending 🔥
              </label>
              <label className="toggle-line">
                <input type="checkbox" checked={form.recipeOfDay} onChange={set('recipeOfDay')} /> Recipe of the Day ⭐
              </label>
            </div>

            <button
              className="button button-dark full-button"
              type="submit"
              disabled={create.isPending || update.isPending}
              data-testid="button-save-editor"
            >
              {create.isPending || update.isPending ? 'Saving...' : form.status === 'PUBLISHED' ? 'Publish Recipe 🚀' : 'Save Recipe 💾'}
            </button>
          </aside>
        </form>
      )}

      {/* Tab 2: Live Real-Time Preview */}
      {editorTab === 'preview' && (
        <div className="editor-preview-container">
          <div className="preview-section-box">
            <span className="preview-label">1. Card View Preview (As seen in Library Grid)</span>
            <div className="preview-card-wrap">
              <article className="recipe-card">
                <div className="card-topline">
                  <span className="category-pill">{selectedCategoryName}</span>
                  {form.trending && <span className="trend-label"><Flame size={12} /> Trending</span>}
                </div>
                <h3 className="preview-card-title">{form.title || 'Untitled Recipe'}</h3>
                <p className="card-description">{form.shortDescription || 'Short description preview...'}</p>
                <div className="card-meta-chips">
                  <span className="meta-chip"><Clock3 size={12} /> {form.estimatedTime}</span>
                  <span className="meta-chip">{form.difficulty}</span>
                  <span className="meta-chip">{form.language}</span>
                </div>
                {form.tags?.length > 0 && (
                  <div className="card-tags">
                    {form.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
                  </div>
                )}
                <div className="card-footer">
                  <span className="card-stat"><Eye size={12} /> 0</span>
                  <span className="card-open-cta">Open Recipe <ArrowRight size={13} /></span>
                </div>
              </article>
            </div>
          </div>

          <div className="preview-section-box">
            <span className="preview-label">2. Full Recipe Detail Page Preview</span>
            <div className="preview-page-wrap">
              <div className="recipe-hero">
                <div className="card-topline">
                  <span className="eyebrow">{selectedCategoryName}</span>
                  {form.testedAt && (
                    <span className="verified-label"><Check size={13} /> Tested {form.testedAt}</span>
                  )}
                </div>
                <h1>{form.title || 'Untitled Recipe'}</h1>
                <p className="recipe-lede">{form.shortDescription || 'Short description preview...'}</p>
                <div className="recipe-meta">
                  <span><Clock3 size={15} /> {form.estimatedTime}</span>
                  <span><Zap size={15} /> {form.difficulty}</span>
                  <span><Tag size={15} /> {form.language}</span>
                </div>
              </div>

              <div className="recipe-body">
                <div className="recipe-main">
                  <section className="problem-section">
                    <span className="kicker">The problem</span>
                    <p className="problem-copy">{form.problem || 'Problem statement preview...'}</p>
                    <div className="tool-row">
                      {form.aiTools.map((t) => <span key={t} className="tool-chip">{t}</span>)}
                    </div>
                  </section>

                  <section>
                    <div className="content-heading">
                      <span className="step-count">01</span>
                      <div>
                        <span className="kicker">Before you start</span>
                        <h2>Gather your inputs.</h2>
                      </div>
                    </div>
                    <ul className="input-list">
                      {form.requiredInputs.map((input) => (
                        <li key={input}><Check size={16} />{input}</li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <div className="content-heading">
                      <span className="step-count">02</span>
                      <div>
                        <span className="kicker">The workflow</span>
                        <h2>Run it in three moves.</h2>
                      </div>
                    </div>
                    <div className="steps-list">
                      {form.steps.map((step, idx) => (
                        <div className="step-row" key={idx}>
                          <span>{String(idx + 1).padStart(2, '0')}</span>
                          <p>{step}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="prompt-section">
                    <div className="content-heading">
                      <span className="step-count">03</span>
                      <div>
                        <span className="kicker">Copy this prompt</span>
                        <h2>The battle-tested prompt.</h2>
                      </div>
                    </div>
                    <div className="prompt-box">
                      <div className="prompt-label">
                        <span>Prompt</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(form.prompt);
                            setCopiedPrompt(true);
                            setTimeout(() => setCopiedPrompt(false), 2000);
                          }}
                        >
                          {copiedPrompt ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy prompt</>}
                        </button>
                      </div>
                      <pre>{form.prompt || 'No prompt content written yet...'}</pre>
                    </div>
                  </section>

                  <section className="example-grid">
                    <div>
                      <span className="kicker">Example input</span>
                      <div className="example-box">{form.exampleInput || 'No example input provided.'}</div>
                    </div>
                    <div>
                      <span className="kicker">Example output</span>
                      <div className="example-box output">{form.exampleOutput || 'No example output provided.'}</div>
                    </div>
                  </section>

                  <section className="verification-box">
                    <div><Check size={19} /><span className="kicker">Verification notes</span></div>
                    <p>{form.verificationNotes || 'Verification notes preview...'}</p>
                  </section>
                </div>

                <aside className="recipe-aside">
                  <div className="aside-card">
                    <span className="kicker">At a glance</span>
                    <div><span>Audience</span><strong>{selectedAudienceName}</strong></div>
                    <div><span>Category</span><strong>{selectedCategoryName}</strong></div>
                    <div><span>Language</span><strong>{form.language}</strong></div>
                    <div><span>Tested With</span><strong>{form.testedWith.join(', ')}</strong></div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Quality Checklist */}
      {editorTab === 'checklist' && (
        <div className="editor-checklist-container">
          <div className="checklist-card">
            <div className="checklist-score-banner">
              <div className="score-circle">
                <strong>{completenessScore}%</strong>
                <span>Quality</span>
              </div>
              <div className="score-info">
                <h2>Recipe Quality & Readiness Checklist</h2>
                <p>Ensure every recipe meets the standard of practical, verifiable, outcome-focused instructions.</p>
              </div>
            </div>

            <div className="checklist-items">
              {checklist.map((item, i) => (
                <div key={i} className={`checklist-item ${item.done ? 'done' : 'missing'}`}>
                  {item.done ? (
                    <CheckCircle2 size={20} className="check-icon-done" />
                  ) : (
                    <AlertCircle size={20} className="check-icon-missing" />
                  )}
                  <span>{item.label}</span>
                  <span className={`badge-pill ${item.done ? 'passed' : 'pending'}`}>
                    {item.done ? 'Passed' : 'Needs attention'}
                  </span>
                </div>
              ))}
            </div>

            <div className="checklist-footer">
              <button
                type="button"
                className="button button-dark"
                onClick={() => setEditorTab('edit')}
              >
                Return to Editor & Fix Items <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal-backdrop" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-container delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="delete-icon-wrap"><AlertCircle size={24} /></div>
              <h2>Delete Recipe?</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to permanently delete <strong>{form.title}</strong>?</p>
              <div className="modal-actions">
                <button type="button" className="button button-outline" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  disabled={deleteMutation.isPending}
                  onClick={handleDeleteRecipe}
                  data-testid="button-confirm-delete-editor"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SmartDraftModal
        isOpen={showDraftModal}
        onClose={() => setShowDraftModal(false)}
        onSelectDraft={(draft) => setForm((prev) => ({ ...prev, ...draft }))}
        categories={categories.data}
        audiences={audiences.data}
      />
    </div>
  );
}

function AdminSubmissions() {
  const query = useListAdminSubmissions();
  const updateSubmission = useUpdateAdminSubmission();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  usePageMeta('Community Submissions — AI Recipes', 'Review, approve, and convert workflow submissions.');

  if (query.isLoading) return <LoadingState label="Loading submissions inbox..." />;
  if (query.isError || !query.data) return <ErrorState retry={() => query.refetch()} />;

  const submissions = query.data;
  const filtered = filterStatus === 'ALL'
    ? submissions
    : submissions.filter((s) => s.status.toUpperCase() === filterStatus);

  const handleUpdateStatus = (id: number, status: 'APPROVED' | 'REJECTED') => {
    updateSubmission.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminSubmissionsQueryKey() });
        },
      }
    );
  };

  const handleConvert = (submission: typeof submissions[0]) => {
    const draft: Partial<RecipeInput> = {
      title: submission.title,
      slug: submission.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
      problem: submission.problem,
      shortDescription: `A practical workflow for ${submission.title.toLowerCase()}.`,
      prompt: submission.workflow,
      exampleInput: submission.howUsed,
      exampleOutput: "Verified demonstration output...",
      steps: [
        "Gather required context and parameters.",
        "Run the submitted prompt in Claude or ChatGPT.",
        "Verify results against quality checklist."
      ],
      requiredInputs: ["[Context / Input Materials]", "[Target Output Constraints]"],
      status: "DRAFT",
    };
    setLocation(`/admin/recipes/new?draft=${encodeURIComponent(JSON.stringify(draft))}&submissionId=${submission.id}`);
  };

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <span className="kicker">Community Inbox</span>
          <h1>Workflow Submissions ({submissions.length})</h1>
          <p className="admin-subtitle">Review workflows submitted by the community and convert good submissions into recipes.</p>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-filter-pills">
          {['ALL', 'PENDING', 'APPROVED', 'CONVERTED', 'REJECTED'].map((st) => (
            <button
              key={st}
              type="button"
              className={`filter-pill ${filterStatus === st ? 'active' : ''}`}
              onClick={() => setFilterStatus(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="submission-list">
        {filtered.length === 0 ? (
          <div className="state-panel empty-state">
            <CheckCircle2 size={32} className="accent-sage" />
            <h2>No submissions in this view</h2>
            <p>Submissions will appear here when readers submit workflows from the site.</p>
          </div>
        ) : (
          filtered.map((submission) => (
            <article key={submission.id} className="submission-card-full">
              <div className="submission-top">
                <div className="submission-status-row">
                  <span className={`status-badge ${submission.status.toLowerCase()}`}>
                    {submission.status}
                  </span>
                  <time>{new Date(submission.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</time>
                </div>
                {submission.email && <span className="submitter-email">By: {submission.email}</span>}
              </div>

              <h2>{submission.title}</h2>

              <div className="submission-field-group">
                <span className="field-label">Problem Solved:</span>
                <p className="submission-problem-text">{submission.problem}</p>
              </div>

              <div className="submission-field-group">
                <span className="field-label">Submitted Workflow / Prompt:</span>
                <pre className="submission-workflow-box">{submission.workflow}</pre>
              </div>

              <div className="submission-field-group">
                <span className="field-label">How it was used:</span>
                <p className="submission-how-used">{submission.howUsed}</p>
              </div>

              <div className="submission-card-actions">
                <button
                  type="button"
                  className="button button-dark"
                  onClick={() => handleConvert(submission)}
                  data-testid={`button-convert-${submission.id}`}
                >
                  <Wand2 size={14} /> Convert to Recipe & Edit
                </button>
                {submission.status !== 'APPROVED' && submission.status !== 'CONVERTED' && (
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => handleUpdateStatus(submission.id, 'APPROVED')}
                  >
                    <Check size={14} /> Mark Approved
                  </button>
                )}
                {submission.status !== 'REJECTED' && (
                  <button
                    type="button"
                    className="button button-outline delete-btn"
                    onClick={() => handleUpdateStatus(submission.id, 'REJECTED')}
                  >
                    <X size={14} /> Dismiss / Reject
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function AdminCollections({ type }: { type: 'categories' | 'audiences' }) {
  const query = type === 'categories' ? useListCategories() : useListAudiences();
  usePageMeta(`Manage ${type} — AI Recipes`, `Manage recipe ${type}.`);
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState retry={() => query.refetch()} />;
  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <span className="kicker">Taxonomy</span>
          <h1>{type === 'categories' ? 'Categories.' : 'Audiences.'}</h1>
        </div>
      </div>
      <div className="admin-collection-grid">
        {query.data.map((item) => (
          <div className="admin-collection-card" key={item.id}>
            <span className="category-index">{String(item.id).padStart(2, '0')}</span>
            <h2>{item.name}</h2>
            <p>{item.description}</p>
            <strong>{item.recipeCount} recipes</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminAnalytics() {
  const query = useGetAdminAnalytics();
  usePageMeta('Analytics — AI Recipes', 'Understand what people need from the field guide.');
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState retry={() => query.refetch()} />;
  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <span className="kicker">Signals</span>
          <h1>What people need next.</h1>
        </div>
      </div>
      <div className="analytics-grid">
        <div className="admin-card">
          <h2>Popular searches</h2>
          {query.data.popularSearches.map((item) => (
            <div className="bar-row" key={item.query}>
              <span>{item.query}</span>
              <div><i style={{ width: `${Math.min(100, item.count * 9)}%` }} /></div>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
        <div className="admin-card">
          <h2>Search gaps</h2>
          {query.data.searchGaps.map((item) => (
            <div className="gap-row" key={item.query}>
              <span>{item.query}</span>
              <strong>{item.count} asks</strong>
              <ArrowRight size={15} />
            </div>
          ))}
        </div>
      </div>
      <div className="admin-card content-health">
        <h2>Content health flags</h2>
        {query.data.contentHealth.map((item) => (
          <div className="health-flag" key={item.recipe.id}>
            <span className="health-dot yellow" />
            <div>
              <strong>{item.recipe.title}</strong>
              <small>{item.reason}</small>
            </div>
            <Link href={`/admin/recipes/${item.recipe.id}`} data-testid={`link-analytics-recipe-${item.recipe.id}`}>
              Review <ArrowRight size={14} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function AboutPage() { usePageMeta('About AI Recipes', 'Why AI Recipes exists: practical, tested AI workflows for real work.'); return <SiteShell><div className="prose-page shell"><span className="kicker">About the field guide</span><h1>Less prompt theatre.<br /><em>More useful work.</em></h1><p className="lead">AI Recipes is an Indian-first library of practical workflows for people who have something real to do.</p><div className="prose-columns"><div><h2>Why this exists</h2><p>The internet is full of impressive prompts. We wanted the other thing: instructions you can copy on a Tuesday morning, with the context, caveats, and checks that make them actually work.</p><p>Recipes begin with the problem, not the model. Each one is tested, edited, and written to be useful whether you are running a small business in Jaipur, studying in Kochi, or making your next thing from a shared desk.</p></div><div><h2>Our standard</h2><p>A good recipe tells you what to bring, what to ask, what a decent result looks like, and how to improve it. It leaves you with a skill, not a dependency.</p><p>Have a workflow that deserves a place here? <Link href="/submit" data-testid="link-about-submit">Send it in.</Link></p></div></div></div></SiteShell>; }

function SimplePage({ type }: { type: 'privacy' | 'terms' | 'disclaimer' }) { const titles = { privacy: 'Privacy, plainly.', terms: 'The terms, without the fog.', disclaimer: 'A note on using recipes.' }; const copy = { privacy: 'We collect only what helps AI Recipes work: account details for signed-in shelves, and lightweight usage signals to understand which workflows help.', terms: 'Use the library thoughtfully. Recipes are provided as practical guidance, not as a promise of a particular business, academic, legal, or financial outcome.', disclaimer: 'AI can be confidently wrong. Check outputs, protect private information, and use your own judgment before acting on any recipe.' }; usePageMeta(`${titles[type]} — AI Recipes`, copy[type]); return <SiteShell><div className="prose-page shell legal-page"><span className="kicker">AI Recipes / {type}</span><h1>{titles[type]}</h1><p className="lead">{copy[type]}</p><hr /><h2>What to keep in mind</h2><p>Recipes are starting points. Read the verification notes, adapt the workflow to your context, and check important work with a qualified person or a trusted source.</p><h2>Questions</h2><p>If something is unclear, send us a note through the workflow submission form. We would rather make the guide clearer than hide behind small print.</p></div></SiteShell>; }

function SearchPage() { const query = new URLSearchParams(window.location.search).get('q') || ''; return <LibraryPage key={query} />; }

function SignInPage() { return <div className="auth-page"><div className="auth-aside"><Logo /><span className="kicker">A better starting point</span><h1>Keep the useful stuff close.</h1><p>Save workflows, retrace your steps, and build a shelf that knows what kind of work you do.</p><div className="auth-quote">“The right recipe is the one that gets you moving.”</div></div><div className="auth-card"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>; }
function SignUpPage() { return <div className="auth-page"><div className="auth-aside"><Logo /><span className="kicker">Start with one useful thing</span><h1>Your work, a little lighter.</h1><p>Join a growing shelf of practical AI workflows made for real people doing real work.</p><div className="auth-quote">No prompt theatre. Just recipes you can run.</div></div><div className="auth-card"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>; }

function Router() {
  const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  return <Switch>
    <Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/login" component={() => <Redirect to="/sign-in" />} /><Route path="/signup" component={() => <Redirect to="/sign-up" />} />
    <Route path="/" component={HomePage} /><Route path="/recipes" component={LibraryPage} /><Route path="/recipes/:slug" component={RecipePage} />
    <Route path="/categories" component={() => <CollectionsIndex type="category" />} /><Route path="/categories/:slug" component={() => <CollectionPage type="category" />} />
    <Route path="/audiences" component={() => <CollectionsIndex type="audience" />} /><Route path="/audiences/:slug" component={() => <CollectionPage type="audience" />} />
    <Route path="/search" component={SearchPage} /><Route path="/submit" component={SubmitPage} /><Route path="/about" component={AboutPage} />
    <Route path="/privacy" component={() => <SimplePage type="privacy" />} /><Route path="/terms" component={() => <SimplePage type="terms" />} /><Route path="/disclaimer" component={() => <SimplePage type="disclaimer" />} />
    <Route path="/profile" component={() => <Protected><ProfilePage /></Protected>} /><Route path="/saved" component={() => <Protected><SavedPage /></Protected>} /><Route path="/history" component={() => <Protected><HistoryPage /></Protected>} />
    <Route path="/admin" component={() => <AdminShell><AdminOverview /></AdminShell>} /><Route path="/admin/recipes" component={() => <AdminShell><AdminRecipes /></AdminShell>} /><Route path="/admin/recipes/new" component={() => <AdminShell><AdminRecipeEditor /></AdminShell>} /><Route path="/admin/recipes/:id" component={() => <AdminShell><AdminRecipeEditor /></AdminShell>} /><Route path="/admin/categories" component={() => <AdminShell><AdminCollections type="categories" /></AdminShell>} /><Route path="/admin/audiences" component={() => <AdminShell><AdminCollections type="audiences" /></AdminShell>} /><Route path="/admin/submissions" component={() => <AdminShell><AdminSubmissions /></AdminShell>} /><Route path="/admin/analytics" component={() => <AdminShell><AdminAnalytics /></AdminShell>} />
    <Route component={() => <SiteShell><div className="state-panel shell"><span className="kicker">404</span><h1>This recipe is not on the shelf.</h1><Link href="/recipes" className="button button-dark" data-testid="link-404-library">Back to the library <ArrowRight size={16} /></Link></div></SiteShell>} />
  </Switch>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Keep your useful workflows close.' } }, signUp: { start: { title: 'Build your shelf', subtitle: 'Start with one useful thing.' } } }} routerPush={(to) => setLocation(to.replace(basePath, '') || '/')} routerReplace={(to) => setLocation(to.replace(basePath, '') || '/')}><Router /></ClerkProvider>;
}

function App() {
  useMobileEnforcement();
  return <QueryClientProviderWrapper><WouterRouter base={basePath}><ErrorBoundary><ClerkRoutes /></ErrorBoundary></WouterRouter><Toaster /></QueryClientProviderWrapper>;
}

function QueryClientProviderWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export default App;