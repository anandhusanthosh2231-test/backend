import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import {
  ArrowRight, BarChart3, Bookmark, BookmarkCheck, Check, ChevronLeft, ChevronRight,
  Clock3, Copy, ExternalLink, FileText, Filter, Flame, History, LayoutDashboard,
  Menu, PenLine, Plus, Search, Send, Share2, Sparkles, Tag, Users, X, Zap,
} from 'lucide-react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import {
  getGetAudienceQueryKey, getGetCategoryQueryKey, getGetRecipeQueryKey, getGetRelatedRecipesQueryKey,
  getListAdminRecipesQueryKey, getListSavedRecipesQueryKey,
  useCreateAdminRecipe, useCreateSubmission, useDuplicateAdminRecipe, useGetAdminAnalytics,
  useGetAdminSummary, useGetAudience, useGetCategory, useGetHome, useGetMe, useGetRecipe,
  useGetRelatedRecipes, useListAdminRecipes, useListAdminSubmissions, useListAudiences,
  useListCategories, useListHistory, useListRecipes, useListSavedRecipes, useSaveRecipe,
  useSubmitFeedback, useTrackEvent, useUnsaveRecipe, useUpdateAdminRecipe,
} from '@workspace/api-client-react';
import type { Recipe, RecipeCard, RecipeInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

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
  const links = [['/recipes', 'Library'], ['/categories', 'Categories'], ['/audiences', 'Audiences'], ['/about', 'About']];
  return <header className="site-header">
    <div className="shell header-inner">
      <Logo />
      <nav className={`main-nav ${open ? 'is-open' : ''}`} aria-label="Primary navigation">
        {links.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={location.startsWith(href) ? 'active' : ''} data-testid={`link-nav-${label.toLowerCase()}`}>{label}</Link>)}
      </nav>
      <div className="header-actions">
        <Link href="/search" className="icon-button" aria-label="Search" data-testid="link-search"><Search size={18} /></Link>
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
  return <><Header /><main>{children}</main><Footer /></>;
}

function LoadingState({ label = 'Finding useful workflows' }: { label?: string }) {
  return <div className="loading-state" data-testid="status-loading"><div className="skeleton-line wide" /><div className="skeleton-line" /><p>{label}<span className="loading-ellipsis">...</span></p></div>;
}

function ErrorState({ retry }: { retry?: () => void }) {
  return <div className="state-panel error-state" data-testid="status-error"><span className="state-kicker">Something went sideways</span><h2>We could not load this page.</h2><p>Try again in a moment. If it keeps happening, the recipe shelf is still here when you return.</p>{retry && <button className="button button-dark" onClick={retry} data-testid="button-retry">Try again</button>}</div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="state-panel empty-state" data-testid="status-empty"><span className="empty-icon"><Sparkles size={20} /></span><h2>{title}</h2><p>{body}</p>{action}</div>;
}

function RecipeCardView({ recipe, saved = false, onSave }: { recipe: RecipeCard; saved?: boolean; onSave?: (recipe: RecipeCard) => void }) {
  return <article className="recipe-card" data-testid={`card-recipe-${recipe.id}`}>
    <div className="card-topline"><span className="eyebrow">{recipe.category}</span>{recipe.trending && <span className="trend-label"><Flame size={13} /> Trending</span>}</div>
    <Link href={`/recipes/${recipe.slug}`} className="card-title-link" data-testid={`link-recipe-${recipe.id}`}><h3>{recipe.title}</h3></Link>
    <p>{recipe.shortDescription}</p>
    <div className="card-meta"><span><Clock3 size={14} /> {recipe.estimatedTime}</span><span>{recipe.difficulty}</span><span>{recipe.language}</span></div>
    <div className="card-footer"><span className="tag-line">{recipe.tags?.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}</span><button className={`save-button ${saved ? 'saved' : ''}`} onClick={() => onSave?.(recipe)} aria-label={saved ? 'Remove saved recipe' : 'Save recipe'} data-testid={`button-save-${recipe.id}`}>{saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</button></div>
  </article>;
}

function RecipeGrid({ recipes, savedIds, onSave }: { recipes: RecipeCard[]; savedIds?: Set<number>; onSave?: (r: RecipeCard) => void }) {
  if (!recipes.length) return <EmptyState title="No recipes found yet" body="Try a broader search, or tell us what workflow you need next." action={<Link href="/submit" className="button button-dark" data-testid="link-submit-empty">Suggest a workflow <ArrowRight size={16} /></Link>} />;
  return <div className="recipe-grid">{recipes.map((recipe) => <RecipeCardView key={recipe.id} recipe={recipe} saved={savedIds?.has(recipe.id)} onSave={onSave} />)}</div>;
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
  usePageMeta('AI Recipes — Practical AI workflows for real work', 'A trusted, Indian-first field guide to practical AI workflows you can copy, run, and make your own.');
  if (isLoading) return <SiteShell><LoadingState /></SiteShell>;
  if (isError || !data) return <SiteShell><ErrorState retry={() => refetch()} /></SiteShell>;
  return <SiteShell><div className="home-hero"><div className="shell hero-grid"><div className="hero-copy"><span className="kicker"><span className="kicker-mark" />A field guide for the AI age</span><h1>Useful AI, for the work in front of you.</h1><p>Practical, tested workflows for writing, studying, running a business, making things, and getting through the everyday.</p><form className="hero-search" onSubmit={(e) => { e.preventDefault(); if (search.trim()) setLocation(`/search?q=${encodeURIComponent(search.trim())}`); }}><Search size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="What are you trying to do?" aria-label="Search workflows" data-testid="input-home-search" /><button type="submit" data-testid="button-home-search">Find a recipe <ArrowRight size={16} /></button></form><div className="hero-proof"><span className="proof-avatars"><i>AS</i><i>RK</i><i>MP</i></span><span>Made for real work, not prompt theatre.</span></div></div><div className="hero-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-note note-one"><span>01</span><strong>Start with the problem</strong><small>Not the tool.</small></div><div className="art-note note-two"><span>02</span><strong>Run the workflow</strong><small>Then make it yours.</small></div><div className="art-center"><Sparkles size={24} /><span>AI<br />RECIPES</span></div><div className="art-caption">The useful stuff, filed.</div></div></div></div>
    <section className="shell home-section feature-section">{data.recipeOfDay && <div className="feature-card"><div className="feature-side"><span className="kicker">Recipe of the day</span><span className="feature-number">01</span><p>One thoughtful workflow, picked for the way people actually work today.</p></div><div className="feature-main"><div className="card-topline"><span className="eyebrow">{data.recipeOfDay.category}</span><span className="verified-label"><Check size={13} /> Tested workflow</span></div><Link href={`/recipes/${data.recipeOfDay.slug}`} data-testid="link-recipe-of-day"><h2>{data.recipeOfDay.title}</h2></Link><p>{data.recipeOfDay.shortDescription}</p><div className="feature-bottom"><span><Clock3 size={14} /> {data.recipeOfDay.estimatedTime}</span><Link href={`/recipes/${data.recipeOfDay.slug}`} className="arrow-link" data-testid="link-recipe-of-day-read">Read the recipe <ArrowRight size={16} /></Link></div></div></div>}</section>
    <section className="shell home-section"><div className="section-heading"><div><span className="kicker">The shelf, refreshed</span><h2>For the thing you need to do next.</h2></div><Link href="/recipes" className="arrow-link" data-testid="link-all-recipes">Browse all recipes <ArrowRight size={16} /></Link></div><RecipeGrid recipes={data.trending || []} /></section>
    <section className="categories-band"><div className="shell home-section"><div className="section-heading"><div><span className="kicker">Browse by context</span><h2>Start where the work lives.</h2></div></div><div className="category-list">{data.categories.map((category) => <Link href={`/categories/${category.slug}`} className="category-row" key={category.id} data-testid={`link-category-${category.id}`}><span className="category-index">{String(category.id).padStart(2, '0')}</span><span className="category-name">{category.name}</span><span className="category-count">{category.recipeCount} recipes</span><ArrowRight size={18} /></Link>)}</div></div></section>
    <section className="shell home-section audience-section"><div><span className="kicker">Made for</span><h2>Different desks.<br /><em>Same clarity.</em></h2></div><div className="audience-pills">{data.audiences.map((audience) => <Link href={`/audiences/${audience.slug}`} key={audience.id} className="audience-pill" data-testid={`link-audience-${audience.id}`}>{audience.name}<span>{audience.recipeCount}</span></Link>)}</div></section>
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
  const params = useMemo(() => ({ q: q || undefined, category: category || undefined, audience: audience || undefined, difficulty: difficulty || undefined, page, pageSize: 9, sort }), [q, category, audience, difficulty, page, sort]);
  const query = useListRecipes(params);
  const { data: categories } = useListCategories();
  const { data: audiences } = useListAudiences();
  const [savedIds] = useState(() => new Set<number>());
  const [, setLocation] = useLocation();
  usePageMeta(q ? `Search results for ${q} — AI Recipes` : 'Recipe library — AI Recipes', 'Browse practical, tested AI workflows for work, study, business, creativity, and everyday life.');
  const submit = (e: FormEvent) => { e.preventDefault(); setPage(1); setLocation(`/recipes${q ? `?q=${encodeURIComponent(q)}` : ''}`); };
  const onSave = (recipe: RecipeCard) => { if (!savedIds.has(recipe.id)) savedIds.add(recipe.id); else savedIds.delete(recipe.id); setLocation(`/sign-in?redirect_url=${encodeURIComponent(`/recipes/${recipe.slug}`)}`); };
  return <SiteShell><div className="page-intro shell"><span className="kicker">The library</span><h1>Recipes for real work.</h1><p>Copy a workflow, try it with your own context, and keep the parts that make your work lighter.</p></div><section className="shell library-layout"><aside className="filters"><div className="filter-header"><span>Refine</span><Filter size={16} /></div><label>Category<select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} data-testid="select-category"><option value="">All categories</option>{categories?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label><label>Audience<select value={audience} onChange={(e) => { setAudience(e.target.value); setPage(1); }} data-testid="select-audience"><option value="">Everyone</option>{audiences?.map((a) => <option key={a.id} value={a.slug}>{a.name}</option>)}</select></label><label>Difficulty<select value={difficulty} onChange={(e) => { setDifficulty(e.target.value); setPage(1); }} data-testid="select-difficulty"><option value="">Any difficulty</option><option value="Beginner">Beginner</option><option value="Intermediate">Intermediate</option><option value="Advanced">Advanced</option></select></label><div className="filter-note"><Sparkles size={15} /><p>Every recipe has a problem, a process, and a way to check the result.</p></div></aside><div className="library-results"><form className="library-search" onSubmit={submit}><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by task, outcome, or tool" aria-label="Search recipes" data-testid="input-library-search" /><button type="submit" data-testid="button-library-search">Search</button></form><div className="results-toolbar"><span>{query.data?.total ?? 0} workflows</span><select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} aria-label="Sort recipes" data-testid="select-sort"><option value="relevance">Most relevant</option><option value="popular">Most copied</option><option value="newest">Newest tested</option></select></div>{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : <RecipeGrid recipes={query.data?.items || []} savedIds={savedIds} onSave={onSave} />}<div className="pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page" data-testid="button-page-prev"><ChevronLeft size={17} /></button><span>Page {page} of {Math.max(1, Math.ceil((query.data?.total || 0) / 9))}</span><button disabled={!query.data || page >= Math.ceil(query.data.total / 9)} onClick={() => setPage(page + 1)} aria-label="Next page" data-testid="button-page-next"><ChevronRight size={17} /></button></div></div></section></SiteShell>;
}

function RecipePage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const query = useGetRecipe(slug, { query: { queryKey: getGetRecipeQueryKey(slug) } });
  const related = useGetRelatedRecipes(slug, { limit: 3 }, { query: { queryKey: getGetRelatedRecipesQueryKey(slug, { limit: 3 }) } });
  const track = useTrackEvent();
  const feedback = useSubmitFeedback();
  const [copied, setCopied] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  useEffect(() => { if (query.data) track.mutate({ data: { type: 'recipe_view', recipeId: query.data.id } }); }, [query.data]);
  usePageMeta(query.data ? `${query.data.title} — AI Recipes` : 'Recipe — AI Recipes', query.data?.seoDescription || 'A tested, practical AI workflow from AI Recipes.', query.data ? { '@context': 'https://schema.org', '@type': 'HowTo', name: query.data.title, description: query.data.shortDescription, step: query.data.steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })) } : undefined);
  if (query.isLoading) return <SiteShell><LoadingState label="Opening the recipe" /></SiteShell>;
  if (query.isError || !query.data) return <SiteShell><ErrorState retry={() => query.refetch()} /></SiteShell>;
  const recipe = query.data;
  const copyPrompt = async () => { await navigator.clipboard?.writeText(recipe.prompt); setCopied(true); track.mutate({ data: { type: 'recipe_copy', recipeId: recipe.id } }); setTimeout(() => setCopied(false), 1800); };
  const share = async () => { if (navigator.share) await navigator.share({ title: recipe.title, text: recipe.shortDescription, url: window.location.href }); else await navigator.clipboard?.writeText(window.location.href); track.mutate({ data: { type: 'recipe_share', recipeId: recipe.id } }); };
  return <SiteShell><div className="recipe-hero shell"><div className="breadcrumbs"><Link href="/recipes" data-testid="link-breadcrumb-library">Library</Link><ChevronRight size={14} /><Link href={`/categories/${recipe.categorySlug}`} data-testid="link-breadcrumb-category">{recipe.category}</Link><ChevronRight size={14} /><span>{recipe.title}</span></div><div className="recipe-hero-grid"><div><div className="card-topline"><span className="eyebrow">{recipe.category}</span>{recipe.testedAt && <span className="verified-label"><Check size={13} /> Tested {new Date(recipe.testedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>}</div><h1>{recipe.title}</h1><p className="recipe-lede">{recipe.shortDescription}</p><div className="recipe-meta"><span><Clock3 size={15} /> {recipe.estimatedTime}</span><span><Zap size={15} /> {recipe.difficulty}</span><span><Tag size={15} /> {recipe.language}</span></div><div className="recipe-actions"><SaveAction recipe={recipe} /><button className="button button-outline" onClick={share} data-testid="button-share-recipe"><Share2 size={16} /> Share</button></div></div><div className="recipe-stamp"><div className="stamp-ring"><span>FIELD<br />TESTED</span><Check size={26} /></div><small>v{recipe.version} · {recipe.testedWith?.join(', ')}</small></div></div></div><article className="shell recipe-body"><div className="recipe-main"><section className="problem-section"><span className="kicker">The problem</span><p className="problem-copy">{recipe.problem}</p><div className="tool-row">{recipe.aiTools.map((tool) => <span key={tool} className="tool-chip">{tool}</span>)}</div></section><section><div className="content-heading"><span className="step-count">01</span><div><span className="kicker">Before you start</span><h2>Gather your inputs.</h2></div></div><ul className="input-list">{recipe.requiredInputs.map((input) => <li key={input}><Check size={16} />{input}</li>)}</ul></section><section><div className="content-heading"><span className="step-count">02</span><div><span className="kicker">The workflow</span><h2>Run it in three moves.</h2></div></div><div className="steps-list">{recipe.steps.map((step, index) => <div className="step-row" key={`${step}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p></div>)}</div></section><section className="prompt-section"><div className="content-heading"><span className="step-count">03</span><div><span className="kicker">Copy this prompt</span><h2>Start with the whole thing.</h2></div></div><div className="prompt-box"><div className="prompt-label"><span>Prompt</span><button onClick={copyPrompt} data-testid="button-copy-prompt">{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy prompt</>}</button></div><pre>{recipe.prompt}</pre></div></section><section className="example-grid"><div><span className="kicker">Example input</span><div className="example-box">{recipe.exampleInput}</div></div><div><span className="kicker">Example output</span><div className="example-box output">{recipe.exampleOutput}</div></div></section><section><div className="content-heading"><span className="step-count">04</span><div><span className="kicker">Make it better</span><h2>Refinement prompts.</h2></div></div><div className="refinement-list">{recipe.refinementPrompts.map((prompt) => <div key={prompt}><span>+</span>{prompt}</div>)}</div></section><section className="verification-box"><div><Check size={19} /><span className="kicker">Verification notes</span></div><p>{recipe.verificationNotes}</p></section><section className="feedback-box"><span>Was this useful?</span><button onClick={() => { feedback.mutate({ data: { recipeId: recipe.id, helpful: true } }); setFeedbackSent(true); }} data-testid="button-feedback-yes"><Check size={15} /> Yes</button><button onClick={() => { feedback.mutate({ data: { recipeId: recipe.id, helpful: false } }); setFeedbackSent(true); }} data-testid="button-feedback-no"><X size={15} /> Not yet</button>{feedbackSent && <small>Thanks — your note helps us test better.</small>}</section></div><aside className="recipe-aside"><div className="aside-card"><span className="kicker">At a glance</span><div><span>Audience</span><Link href={`/audiences/${recipe.audienceSlug}`} data-testid="link-recipe-audience">{recipe.audience}</Link></div><div><span>Category</span><Link href={`/categories/${recipe.categorySlug}`} data-testid="link-recipe-category">{recipe.category}</Link></div><div><span>Language</span><strong>{recipe.language}</strong></div><div><span>Last tested</span><strong>{recipe.testedAt ? new Date(recipe.testedAt).toLocaleDateString('en-IN') : 'Recently'}</strong></div></div></aside></article><section className="shell related-section"><div className="section-heading"><div><span className="kicker">Keep going</span><h2>More like this.</h2></div></div><RecipeGrid recipes={related.data || []} /></section></SiteShell>;
}

function CollectionPage({ type }: { type: 'category' | 'audience' }) {
  const { slug = '' } = useParams<{ slug: string }>();
  const query = type === 'category' ? useGetCategory(slug, { query: { queryKey: getGetCategoryQueryKey(slug) } }) : useGetAudience(slug, { query: { queryKey: getGetAudienceQueryKey(slug) } });
  usePageMeta(query.data ? `${query.data.name} workflows — AI Recipes` : 'Collection — AI Recipes', query.data?.description || 'Browse practical AI workflows in this collection.');
  if (query.isLoading) return <SiteShell><LoadingState /></SiteShell>;
  if (query.isError || !query.data) return <SiteShell><ErrorState retry={() => query.refetch()} /></SiteShell>;
  return <SiteShell><div className="collection-hero shell"><span className="kicker">{type === 'category' ? 'Category' : 'Audience'}</span><h1>{query.data.name}</h1><p>{query.data.description}</p><span className="collection-count">{query.data.recipes.length} recipes in this shelf</span></div><section className="shell collection-body"><RecipeGrid recipes={query.data.recipes} /></section></SiteShell>;
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

function AdminShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();
  const items = [['/admin', 'Overview', LayoutDashboard], ['/admin/recipes', 'Recipes', FileText], ['/admin/submissions', 'Submissions', InboxIcon], ['/admin/categories', 'Categories', Tag], ['/admin/audiences', 'Audiences', Users], ['/admin/analytics', 'Analytics', BarChart3]] as const;
  if (!isLoaded) return <LoadingState />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <div className="admin-shell"><aside className="admin-sidebar"><Logo /><span className="admin-label">Workspace</span>{items.map(([href, label, Icon]) => <Link key={href} href={href} className={location === href ? 'active' : ''} data-testid={`link-admin-${label.toLowerCase()}`}><Icon size={17} />{label}</Link>)}<div className="admin-side-bottom"><Link href="/" data-testid="link-admin-view-site"><ExternalLink size={16} />View site</Link></div></aside><div className="admin-content"><header className="admin-topbar"><span>AI Recipes / Admin</span><Link href="/profile" className="avatar-chip" data-testid="link-admin-profile">AR</Link></header>{children}</div></div>;
}

function InboxIcon(props: { size?: number }) { return <FileText {...props} />; }

function AdminOverview() {
  const query = useGetAdminSummary();
  usePageMeta('Admin overview — AI Recipes', 'Manage the AI Recipes field guide.');
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState retry={() => query.refetch()} />;
  const s = query.data;
  const stats = [['Published recipes', s.publishedRecipes, 'of ' + s.totalRecipes + ' total'], ['Total views', s.views, 'across the library'], ['Prompt copies', s.copies, 'people took the next step'], ['Pending submissions', s.pendingSubmissions, 'need a thoughtful review']];
  return <div className="admin-page"><div className="admin-page-heading"><div><span className="kicker">Good morning, editor</span><h1>The field guide, at a glance.</h1></div><Link href="/admin/recipes/new" className="button button-dark" data-testid="link-admin-new-recipe"><Plus size={16} /> New recipe</Link></div><div className="stat-grid">{stats.map(([label, value, note]) => <div className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div><div className="admin-two-col"><div className="admin-card"><div className="admin-card-heading"><h2>Content health</h2><Link href="/admin/recipes">Open library <ArrowRight size={15} /></Link></div><div className="health-row"><span className="health-dot green" />{s.publishedRecipes} published and ready to use</div><div className="health-row"><span className="health-dot yellow" />{s.testingRecipes} workflows in testing</div><div className="health-row"><span className="health-dot plum" />{s.draftRecipes} drafts waiting for a pass</div></div><div className="admin-card accent-card"><span className="kicker">The north star</span><h2>Useful beats impressive.</h2><p>Keep the problem clear, the instructions concrete, and the verification honest.</p></div></div></div>;
}

function AdminRecipes() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const query = useListAdminRecipes({ q: q || undefined, status: status || undefined, page: 1 });
  const duplicate = useDuplicateAdminRecipe();
  const queryClient = useQueryClient();
  usePageMeta('Manage recipes — AI Recipes', 'Edit and test recipes.');
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState retry={() => query.refetch()} />;
  return <div className="admin-page"><div className="admin-page-heading"><div><span className="kicker">Content</span><h1>Recipes.</h1></div><Link href="/admin/recipes/new" className="button button-dark" data-testid="link-admin-add-recipe"><Plus size={16} /> Add recipe</Link></div><div className="admin-toolbar"><div className="inline-search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a recipe" data-testid="input-admin-recipes-search" /></div><select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-admin-status"><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="testing">Testing</option></select></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Recipe</th><th>Category</th><th>Status</th><th>Reach</th><th></th></tr></thead><tbody>{query.data.items.map((recipe) => <tr key={recipe.id}><td><Link href={`/admin/recipes/${recipe.id}`} className="table-title" data-testid={`link-admin-recipe-${recipe.id}`}>{recipe.title}</Link><small>{recipe.language} · {recipe.estimatedTime}</small></td><td>{recipe.category}</td><td><span className={`status-badge ${recipe.featured ? 'published' : 'draft'}`}>{recipe.featured ? 'Featured' : 'Live'}</span></td><td>{recipe.viewCount.toLocaleString()}</td><td><button className="table-action" onClick={() => duplicate.mutate({ id: recipe.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAdminRecipesQueryKey({ q: q || undefined, status: status || undefined, page: 1 }) }) })} data-testid={`button-duplicate-recipe-${recipe.id}`}><Copy size={15} /> Duplicate</button></td></tr>)}</tbody></table></div></div>;
}

const emptyRecipe: RecipeInput = { title: '', slug: '', shortDescription: '', problem: '', categoryId: 1, audienceId: 1, subcategory: '', difficulty: 'Beginner', estimatedTime: '15 min', language: 'English', aiTools: [], requiredInputs: [], steps: ['', '', ''], prompt: '', exampleInput: '', exampleOutput: '', refinementPrompts: [], verificationNotes: '', tags: [], status: 'draft', featured: false, trending: false, recipeOfDay: false, version: '1.0', testedAt: null, testedWith: [], seoTitle: '', seoDescription: '' };

function AdminRecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const list = useListAdminRecipes({ page: 1 });
  const existing = list.data?.items.find((item) => item.id === Number(id));
  const create = useCreateAdminRecipe();
  const update = useUpdateAdminRecipe();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<RecipeInput>(emptyRecipe);
  useEffect(() => { if (existing && !isNew) setForm((old) => ({ ...old, title: existing.title, slug: existing.slug, shortDescription: existing.shortDescription, categoryId: 1, audienceId: 1, difficulty: existing.difficulty, estimatedTime: existing.estimatedTime, language: existing.language, tags: existing.tags })); }, [existing, isNew]);
  const set = (key: keyof RecipeInput) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  const submit = (e: FormEvent) => { e.preventDefault(); const mutation = isNew ? create : update; const body = { data: form, ...(isNew ? {} : { id: Number(id) }) } as never; mutation.mutate(body, { onSuccess: () => setLocation('/admin/recipes') }); };
  usePageMeta(isNew ? 'New recipe — AI Recipes' : 'Edit recipe — AI Recipes', 'Edit a practical AI workflow.');
  return <div className="admin-page editor-page"><div className="admin-page-heading"><div><Link href="/admin/recipes" className="back-link" data-testid="link-back-admin-recipes"><ChevronLeft size={15} /> Recipes</Link><h1>{isNew ? 'Add a recipe.' : 'Edit recipe.'}</h1></div><span className="editor-status">{isNew ? 'Draft' : 'Editing'}</span></div><form className="editor-form" onSubmit={submit}><div className="editor-main"><label>Title<input required value={form.title} onChange={set('title')} placeholder="A clear, useful title" data-testid="input-editor-title" /></label><label>Short description<textarea required value={form.shortDescription} onChange={set('shortDescription')} placeholder="What will this help someone do?" data-testid="input-editor-description" /></label><label>The problem<textarea required value={form.problem} onChange={set('problem')} placeholder="Name the real moment this solves." data-testid="input-editor-problem" /></label><label>Prompt<textarea required className="tall-input" value={form.prompt} onChange={set('prompt')} placeholder="The prompt someone will copy." data-testid="input-editor-prompt" /></label><div className="editor-split"><label>Difficulty<select value={form.difficulty} onChange={set('difficulty')}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Estimated time<input value={form.estimatedTime} onChange={set('estimatedTime')} data-testid="input-editor-time" /></label></div><label>Verification notes<textarea value={form.verificationNotes} onChange={set('verificationNotes')} placeholder="How did you test the result?" data-testid="input-editor-verification" /></label></div><aside className="editor-aside"><div className="aside-card"><span className="kicker">Publish checklist</span><div className="checkline"><Check size={15} /> Clear problem</div><div className="checkline"><Check size={15} /> Copyable prompt</div><div className="checkline"><Check size={15} /> Honest verification</div></div><button className="button button-dark full-button" type="submit" disabled={create.isPending || update.isPending} data-testid="button-save-editor">{create.isPending || update.isPending ? 'Saving...' : 'Save draft'} <ArrowRight size={16} /></button></aside></form></div>;
}

function AdminSubmissions() {
  const query = useListAdminSubmissions();
  usePageMeta('Submissions — AI Recipes', 'Review workflow submissions.');
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState retry={() => query.refetch()} />;
  return <div className="admin-page"><div className="admin-page-heading"><div><span className="kicker">Inbox</span><h1>Community workflows.</h1></div></div><div className="submission-list">{query.data.map((submission) => <article key={submission.id} className="submission-card"><div className="submission-top"><span className="status-badge pending">{submission.status}</span><time>{new Date(submission.createdAt).toLocaleDateString('en-IN')}</time></div><h2>{submission.title}</h2><p>{submission.problem}</p><details><summary>Read workflow</summary><p>{submission.workflow}</p><p className="muted">{submission.howUsed}</p></details></article>)}</div></div>;
}

function AdminCollections({ type }: { type: 'categories' | 'audiences' }) {
  const query = type === 'categories' ? useListCategories() : useListAudiences();
  usePageMeta(`Manage ${type} — AI Recipes`, `Manage recipe ${type}.`);
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState retry={() => query.refetch()} />;
  return <div className="admin-page"><div className="admin-page-heading"><div><span className="kicker">Taxonomy</span><h1>{type === 'categories' ? 'Categories.' : 'Audiences.'}</h1></div></div><div className="admin-collection-grid">{query.data.map((item) => <div className="admin-collection-card" key={item.id}><span className="category-index">{String(item.id).padStart(2, '0')}</span><h2>{item.name}</h2><p>{item.description}</p><strong>{item.recipeCount} recipes</strong></div>)}</div></div>;
}

function AdminAnalytics() {
  const query = useGetAdminAnalytics();
  usePageMeta('Analytics — AI Recipes', 'Understand what people need from the field guide.');
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState retry={() => query.refetch()} />;
  return <div className="admin-page"><div className="admin-page-heading"><div><span className="kicker">Signals</span><h1>What people need next.</h1></div></div><div className="analytics-grid"><div className="admin-card"><h2>Popular searches</h2>{query.data.popularSearches.map((item) => <div className="bar-row" key={item.query}><span>{item.query}</span><div><i style={{ width: `${Math.min(100, item.count * 9)}%` }} /></div><strong>{item.count}</strong></div>)}</div><div className="admin-card"><h2>Search gaps</h2>{query.data.searchGaps.map((item) => <div className="gap-row" key={item.query}><span>{item.query}</span><strong>{item.count} asks</strong><ArrowRight size={15} /></div>)}</div></div><div className="admin-card content-health"><h2>Content health flags</h2>{query.data.contentHealth.map((item) => <div className="health-flag" key={item.recipe.id}><span className="health-dot yellow" /><div><strong>{item.recipe.title}</strong><small>{item.reason}</small></div><Link href={`/admin/recipes/${item.recipe.id}`} data-testid={`link-analytics-recipe-${item.recipe.id}`}>Review <ArrowRight size={14} /></Link></div>)}</div></div>;
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
  return <QueryClientProviderWrapper><WouterRouter base={basePath}><ErrorBoundary><ClerkRoutes /></ErrorBoundary></WouterRouter><Toaster /></QueryClientProviderWrapper>;
}

function QueryClientProviderWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export default App;