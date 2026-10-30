import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { ArrowDownToLine, ArrowUpRight, Copy, Film, ImagePlus, LoaderCircle, Pencil, Plus, Search, Sparkles, Star, Trash2, Upload, X } from "lucide-react";
import { ImageKitPicker, type ImageKitAsset } from "@/components/admin/ImageKitMediaLibrary";
import { uploadImageKitAsset, type ImageKitLibraryAsset } from "@/components/admin/imagekit-upload";
import "../vybe/vybe.css";
import "./vybe-studio.css";

type VybeAsset = { assetId?: string; url: string; alt: string; type: "image" | "video"; caption?: string };
type VybeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type VybeType = "image" | "video" | "art" | "design" | "3d" | "app" | "game" | "interactive" | "custom";
type VybeItem = {
  id: number;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  category: string;
  contentType: VybeType;
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
  extraData: Record<string, unknown>;
  imageUrl: string;
  imageAlt: string;
  tags: string[];
  status: VybeStatus;
  featured: boolean;
  featuredPosition: number;
  trending: boolean;
  publishedAt: string | null;
};
type FormState = Omit<VybeItem, "id" | "publishedAt"> & { parametersText: string; extraDataText: string };
type Summary = { total: number; drafts: number; published: number; archived: number; featured: number; categories: number };
type ListResponse = { items: VybeItem[]; page: number; pageSize: number; total: number; categories: string[] };
type UploadedAsset = ImageKitLibraryAsset;
type CsvField = { name: string; type: string; required: boolean; values?: string[] };
type CsvSchema = { version: string; maxBytes: number; maxRows: number; strategies: string[]; fields: CsvField[] };
type CsvValidationRow = { row: number; slug: string; valid: boolean; errors: Array<{ row: number; column: string; message: string }>; warnings: string[]; action: string };
type CsvValidation = {
  schemaVersion: string;
  strategy: string;
  publishImported: boolean;
  counts: { create: number; update: number; skipped: number; invalid: number; total: number };
  rows: CsvValidationRow[];
};
type CsvImportJob = { id: number; status: string; strategy: string; totalRows: number; importedRows: number; skippedRows: number; failedRows: number; createdAt: string };

const types: VybeType[] = ["image", "video", "art", "design", "3d", "app", "game", "interactive", "custom"];
const csvByteLimit = 5 * 1024 * 1024;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCsvSchema(value: unknown): CsvSchema {
  if (!isRecord(value) || typeof value.version !== "string"
    || typeof value.maxBytes !== "number" || typeof value.maxRows !== "number"
    || !Array.isArray(value.strategies) || !value.strategies.every((entry) => typeof entry === "string")
    || !Array.isArray(value.fields) || !value.fields.every((field) => isRecord(field)
      && typeof field.name === "string" && typeof field.type === "string" && typeof field.required === "boolean")) {
    throw new Error("The CSV schema response is invalid. Check that the local API is up to date.");
  }
  return value as CsvSchema;
}

function parseCsvJobs(value: unknown): CsvImportJob[] {
  if (!isRecord(value) || !Array.isArray(value.jobs) || !value.jobs.every((job) => isRecord(job)
    && typeof job.id === "number" && typeof job.status === "string" && typeof job.strategy === "string"
    && typeof job.totalRows === "number" && typeof job.importedRows === "number"
    && typeof job.skippedRows === "number" && typeof job.failedRows === "number"
    && typeof job.createdAt === "string")) {
    throw new Error("The import history response is invalid. Refresh the local API and try again.");
  }
  return value.jobs as CsvImportJob[];
}

function parseCsvValidation(value: unknown): CsvValidation {
  if (!isRecord(value) || typeof value.schemaVersion !== "string" || typeof value.strategy !== "string"
    || typeof value.publishImported !== "boolean" || !isRecord(value.counts)
    || !Array.isArray(value.rows) || !value.rows.every((row) => isRecord(row)
      && typeof row.row === "number" && typeof row.slug === "string" && typeof row.valid === "boolean"
      && Array.isArray(row.errors) && Array.isArray(row.warnings)
      && row.errors.every((entry) => isRecord(entry) && typeof entry.column === "string" && typeof entry.message === "string")
      && row.warnings.every((warning) => typeof warning === "string")
      && typeof row.action === "string")) {
    throw new Error("The CSV validation response is invalid. Check that the local API is up to date.");
  }
  const counts = value.counts;
  if (!["create", "update", "skipped", "invalid", "total"].every((key) => typeof counts[key] === "number")) {
    throw new Error("The CSV validation response is invalid. Check that the local API is up to date.");
  }
  return value as CsvValidation;
}

function parseCsvImportJob(value: unknown): CsvImportJob {
  const parsed = parseCsvJobs({ jobs: [value] });
  return parsed[0];
}

const initialForm = (): FormState => ({
  title: "", slug: "", shortDescription: "", description: "", category: "Images", contentType: "image",
  model: "", models: [], prompt: "", negativePrompt: "", style: "", aspectRatio: "", parameters: {},
  parametersText: "{}", scene: "", motion: "", cameraInstructions: "", durationSeconds: null,
  videoUrl: "", posterUrl: "", visualReferences: [], exampleOutputs: [], refinementInstructions: "",
  builderInstructions: "", tools: [], demoUrl: "", verificationDetails: "", experienceUrl: "",
  experienceControls: [], mediaAssets: [], extraData: {}, extraDataText: "{}", imageUrl: "", imageAlt: "",
  tags: [], status: "DRAFT", featured: false, featuredPosition: 0, trending: false,
});

async function requestJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    if (contentType.includes("text/html")) {
      throw new Error("The local API returned an HTML page instead of JSON. Restart the API server so it loads the current VYBE routes.");
    }
    throw new Error(`The API returned an unexpected response type${contentType ? ` (${contentType})` : ""}.`);
  }
  const body = await response.json() as { error?: string; details?: string };
  if (!response.ok) throw new Error([body.error, body.details].filter(Boolean).join(" ") || "The request could not be completed.");
  return body as T;
}

function arrayField(value: string) {
  return [...new Set(value.split(",").map((part) => part.trim()).filter(Boolean))];
}

function itemToForm(item: VybeItem): FormState {
  return {
    ...item,
    parametersText: JSON.stringify(item.parameters ?? {}, null, 2),
    extraDataText: JSON.stringify(item.extraData ?? {}, null, 2),
    models: item.models ?? [],
    visualReferences: item.visualReferences ?? [],
    exampleOutputs: item.exampleOutputs ?? [],
    mediaAssets: item.mediaAssets ?? [],
    tools: item.tools ?? [],
    experienceControls: item.experienceControls ?? [],
  };
}

function assetFromPicker(asset: ImageKitAsset): VybeAsset {
  return { assetId: asset.fileId, url: asset.url, alt: asset.alt, type: asset.fileType === "image" ? "image" : "video" };
}

function assetFromUpload(asset: UploadedAsset): VybeAsset {
  return { assetId: asset.fileId, url: asset.url, alt: asset.alt, type: asset.fileType === "image" ? "image" : "video" };
}

function csvHeaders(csv: string): string[] {
  const headers: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      headers.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      headers.push(cell);
      return headers;
    } else {
      cell += character;
    }
  }
  headers.push(cell);
  return headers;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function VybeStudio() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [baseline, setBaseline] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [items, setItems] = useState<VybeItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, drafts: 0, published: 0, archived: 0, featured: 0, categories: 0 });
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [featuredFilter, setFeaturedFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvHeaderList, setCsvHeaderList] = useState<string[]>([]);
  const [csvSchema, setCsvSchema] = useState<CsvSchema | null>(null);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvStrategy, setCsvStrategy] = useState("create-only");
  const [publishImported, setPublishImported] = useState(false);
  const [csvValidation, setCsvValidation] = useState<CsvValidation | null>(null);
  const [csvJobs, setCsvJobs] = useState<CsvImportJob[]>([]);
  const [csvHistoryError, setCsvHistoryError] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const csvFileInput = useRef<HTMLInputElement>(null);
  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);

  const loadSummary = useCallback(async () => {
    const data = await requestJson<Summary>(await fetch("/api/admin/vybe/summary", { credentials: "include" }));
    setSummary(data);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "12" });
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (typeFilter) params.set("contentType", typeFilter);
      if (featuredFilter) params.set("featured", featuredFilter);
      const response = await requestJson<ListResponse>(await fetch(`/api/admin/vybe?${params}`, { credentials: "include" }));
      setItems(response.items);
      setTotal(response.total);
      setCategories(response.categories);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load VYBE records.");
    } finally {
      setLoading(false);
    }
  }, [page, query, statusFilter, categoryFilter, typeFilter, featuredFilter]);

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadItems(), loadSummary()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The VYBE dashboard could not be refreshed.");
    }
  }, [loadItems, loadSummary]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!isDirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [isDirty]);

  const loadCsvJobs = async () => {
    try {
      const response = await requestJson<unknown>(
        await fetch("/api/admin/vybe/import/jobs?limit=10", { credentials: "include" }),
      );
      setCsvJobs(parseCsvJobs(response));
      setCsvHistoryError("");
    } catch (reason) {
      setCsvHistoryError(reason instanceof Error ? reason.message : "Import history could not be loaded.");
    }
  };

  const openCsvImporter = async () => {
    setError("");
    setCsvBusy(true);
    try {
      const schema = parseCsvSchema(await requestJson<unknown>(
        await fetch("/api/admin/vybe/schema", { credentials: "include" }),
      ));
      setCsvSchema(schema);
      setCsvOpen(true);
      await loadCsvJobs();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The VYBE CSV tools could not be opened.");
    } finally {
      setCsvBusy(false);
    }
  };

  const selectCsvFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setCsvValidation(null);
    if (file.size > csvByteLimit) {
      setError(`CSV files must be no larger than ${Math.floor(csvByteLimit / 1024 / 1024)} MB.`);
      return;
    }
    try {
      const text = await file.text();
      const headers = csvHeaders(text);
      if (headers.length < 2 || headers.some((header) => !header.trim())) {
        throw new Error("The CSV needs a header row with non-empty column names.");
      }
      setCsvText(text);
      setCsvFileName(file.name);
      setCsvHeaderList(headers.map((header, index) => index === 0 ? header.replace(/^\uFEFF/, "") : header));
      setCsvMapping({});
      setCsvValidation(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The selected CSV could not be read.");
    } finally {
      if (csvFileInput.current) csvFileInput.current.value = "";
    }
  };

  const validateCsv = async () => {
    setCsvBusy(true);
    setError("");
    try {
      const response = parseCsvValidation(await requestJson<unknown>(await fetch("/api/admin/vybe/import/validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, mapping: csvMapping, strategy: csvStrategy, publishImported }),
      })));
      setCsvValidation(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV validation failed.");
    } finally {
      setCsvBusy(false);
    }
  };

  const commitCsv = async () => {
    if (!csvValidation) return;
    const importable = csvValidation.counts.create + csvValidation.counts.update;
    if (!importable || !window.confirm(`Import ${importable} VYBE record(s)? ${publishImported ? "Published status will be preserved as requested." : "All imported records will remain drafts."}`)) return;
    setCsvBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/vybe/import/commit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: csvText,
          mapping: csvMapping,
          strategy: csvStrategy,
          publishImported,
          idempotencyKey: window.crypto.randomUUID(),
        }),
      });
      const body = await response.json() as { error?: string; job?: unknown; alreadyProcessed?: boolean };
      if (!response.ok) throw new Error(body.error || "The VYBE CSV import could not be completed.");
      if (body.job) {
        const job = parseCsvImportJob(body.job);
        setNotice(`VYBE import ${job.status.toLowerCase().replaceAll("_", " ")}: ${job.importedRows} imported, ${job.skippedRows} skipped, ${job.failedRows} failed.`);
        await loadCsvJobs();
        await refresh();
      }
      setCsvValidation(null);
      setCsvText("");
      setCsvFileName("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The VYBE CSV import could not be completed.");
    } finally {
      setCsvBusy(false);
    }
  };

  const downloadCsvTemplate = async () => {
    setCsvBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/vybe/import/template", { credentials: "include" });
      if (!response.ok) await requestJson(response);
      downloadBlob(await response.blob(), "vybe-creations-template-v1.csv");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not download the VYBE CSV template.");
    } finally {
      setCsvBusy(false);
    }
  };

  const exportCsv = async () => {
    setCsvBusy(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (typeFilter) params.set("contentType", typeFilter);
      if (featuredFilter) params.set("featured", featuredFilter);
      const response = await fetch(`/api/admin/vybe/export?${params}`, { credentials: "include" });
      if (!response.ok) await requestJson(response);
      downloadBlob(await response.blob(), "vybe-creations.csv");
      setNotice("Filtered VYBE catalogue exported.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not export VYBE records.");
    } finally {
      setCsvBusy(false);
    }
  };

  const downloadCsvErrorReport = async (jobId: number) => {
    try {
      const response = await fetch(`/api/admin/vybe/import/jobs/${jobId}/report`, { credentials: "include" });
      if (!response.ok) await requestJson(response);
      downloadBlob(await response.blob(), `vybe-import-${jobId}-errors.csv`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not download the import error report.");
    }
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const startNew = () => {
    if (isDirty && !window.confirm("Discard your unsaved VYBE changes?")) return;
    const fresh = initialForm();
    setForm(fresh);
    setBaseline(fresh);
    setEditingId(null);
    setError("");
    setNotice("");
  };

  const edit = (item: VybeItem) => {
    if (isDirty && !window.confirm("Discard your unsaved VYBE changes?")) return;
    const next = itemToForm(item);
    setForm(next);
    setBaseline(next);
    setEditingId(item.id);
    setError("");
    setNotice("");
    document.getElementById("vybe-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const duplicate = async (item: VybeItem) => {
    if (isDirty && !window.confirm("Discard your unsaved VYBE changes and duplicate this creation?")) return;
    setError("");
    try {
      const copy = await requestJson<VybeItem>(await fetch(`/api/admin/vybe/${item.id}/duplicate`, { method: "POST", credentials: "include" }));
      const next = itemToForm(copy);
      setForm(next);
      setBaseline(next);
      setEditingId(copy.id);
      setNotice("Draft copy created. Update it before publishing.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not duplicate this creation.");
    }
  };

  const save = async (event: FormEvent, status: VybeStatus) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const parameters = JSON.parse(form.parametersText || "{}") as Record<string, unknown>;
      const extraData = JSON.parse(form.extraDataText || "{}") as Record<string, unknown>;
      const payload = {
        ...form,
        parameters,
        extraData,
        status,
        models: form.models,
        tags: form.tags,
        parametersText: undefined,
        extraDataText: undefined,
        durationSeconds: form.durationSeconds ? Number(form.durationSeconds) : null,
      };
      const response = await fetch(editingId ? `/api/admin/vybe/${editingId}` : "/api/admin/vybe", {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saved = await requestJson<VybeItem>(response);
      const next = itemToForm(saved);
      setForm(next);
      setBaseline(next);
      setEditingId(saved.id);
      setNotice(status === "PUBLISHED" ? "Creation published." : status === "ARCHIVED" ? "Creation archived." : "Draft saved.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "VYBE could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: VybeItem) => {
    if (!window.confirm(`Permanently delete "${item.title}" from VYBE?`)) return;
    setError("");
    try {
      await requestJson<{ deleted: boolean }>(await fetch(`/api/admin/vybe/${item.id}`, {
        method: "DELETE", credentials: "include",
      }));
      if (editingId === item.id) {
        const fresh = initialForm();
        setForm(fresh);
        setBaseline(fresh);
        setEditingId(null);
      }
      setNotice("VYBE record deleted. Its ImageKit assets were left untouched.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete the VYBE record.");
    }
  };

  const attachAsset = (asset: VybeAsset, as: "output" | "reference" = "output") => {
    setForm((current) => {
      const existing = current.mediaAssets.filter((entry) => entry.assetId !== asset.assetId && entry.url !== asset.url);
      const mediaAssets = [...existing, asset];
      const outputs = as === "output" && !current.exampleOutputs.some((entry) => entry.url === asset.url)
        ? [...current.exampleOutputs, asset] : current.exampleOutputs;
      const references = as === "reference" && !current.visualReferences.some((entry) => entry.url === asset.url)
        ? [...current.visualReferences, asset] : current.visualReferences;
      return {
        ...current,
        mediaAssets,
        exampleOutputs: outputs,
        visualReferences: references,
        imageUrl: asset.type === "image" && !current.imageUrl ? asset.url : current.imageUrl,
        imageAlt: asset.type === "image" && !current.imageAlt ? asset.alt : current.imageAlt,
        videoUrl: asset.type === "video" && !current.videoUrl ? asset.url : current.videoUrl,
      };
    });
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    setNotice("");
    setUploadProgress(0);
    try {
      const uploaded = await uploadImageKitAsset(file, "/vybe", setUploadProgress);
      attachAsset(assetFromUpload(uploaded));
      setNotice(`${uploaded.fileName} uploaded to ImageKit and attached to this draft.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed. Retry the upload.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const addPickerAsset = (asset: ImageKitAsset) => attachAsset(assetFromPicker(asset));
  const pageCount = Math.max(1, Math.ceil(total / 12));
  const mainPreview = form.imageUrl || form.posterUrl || form.videoUrl;

  return <section className="vybe-studio" aria-labelledby="vybe-studio-title">
    <header className="vybe-studio__header">
      <div><span className="vybe-label">ADMIN / CREATIVE SYSTEM</span><h1 id="vybe-studio-title">VYBE Studio</h1><p>Manage a separate creative catalogue. Public discovery remains disabled until its server feature flag is enabled.</p></div>
      <div className="vybe-studio__header-actions">
        <button type="button" className="vybe-studio__tool" disabled={csvBusy} onClick={() => void downloadCsvTemplate()}><ArrowDownToLine size={14} /> Template</button>
        <button type="button" className="vybe-studio__tool" disabled={csvBusy} onClick={() => void exportCsv()}><ArrowDownToLine size={14} /> Export filtered</button>
        <button type="button" className="vybe-studio__tool" disabled={csvBusy} onClick={() => void openCsvImporter()}><Upload size={14} /> CSV tools</button>
        <button type="button" className="vybe-studio__new" onClick={startNew}><Plus size={16} /> New creation</button>
      </div>
    </header>

    <div className="vybe-stats">
      <Stat label="All creations" value={summary.total} /><Stat label="Drafts" value={summary.drafts} /><Stat label="Published" value={summary.published} /><Stat label="Featured" value={summary.featured} /><Stat label="Categories" value={summary.categories} />
    </div>

    {error && <div className="vybe-studio__message is-error" role="alert">{error}</div>}
    {notice && <div className="vybe-studio__message is-notice" role="status">{notice}</div>}

    <div className="vybe-studio__layout">
      <section className="vybe-studio__records" aria-labelledby="vybe-records-title">
        <div className="vybe-studio__section-title"><div><span className="vybe-label">CONTENT INDEX</span><h2 id="vybe-records-title">Creations <small>{total}</small></h2></div><button type="button" title="Refresh list" onClick={() => void refresh()}><ArrowDownToLine size={15} /></button></div>
        <div className="vybe-studio__filters">
          <label className="vybe-studio__search"><Search size={15} /><input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Search title, prompt, tag…" aria-label="Search VYBE records" /></label>
          <label><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}><option value="">All statuses</option><option value="DRAFT">Drafts</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></label>
          <label><span className="sr-only">Filter by category</span><select value={categoryFilter} onChange={(event) => { setPage(1); setCategoryFilter(event.target.value); }}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span className="sr-only">Filter by type</span><select value={typeFilter} onChange={(event) => { setPage(1); setTypeFilter(event.target.value); }}><option value="">All types</option>{types.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span className="sr-only">Filter by featured placement</span><select value={featuredFilter} onChange={(event) => { setPage(1); setFeaturedFilter(event.target.value); }}><option value="">All placements</option><option value="true">Featured only</option><option value="false">Not featured</option></select></label>
        </div>
        {loading && <div className="vybe-studio__loading"><LoaderCircle size={18} /> Loading records…</div>}
        {!loading && items.length === 0 && <div className="vybe-studio__empty"><Sparkles size={20} /><strong>No VYBE creations yet</strong><span>Start with a draft. It will stay private until published and launched.</span></div>}
        <div className="vybe-studio__list">{items.map((item) => <article className="vybe-record" key={item.id}>
          <div className="vybe-record__thumb">{item.imageUrl || item.posterUrl ? <img src={item.imageUrl || item.posterUrl} alt="" loading="lazy" /> : <Sparkles size={17} />}</div>
          <div className="vybe-record__body"><div className="vybe-record__title"><strong>{item.title}</strong><span className={`vybe-status vybe-status--${item.status.toLowerCase()}`}>{item.status}</span></div><span>{item.category} / {item.contentType} {item.featured && <Star size={12} />}</span><div className="vybe-record__actions"><button type="button" onClick={() => edit(item)}><Pencil size={13} /> Edit</button><button type="button" onClick={() => void duplicate(item)}><Copy size={13} /> Duplicate</button>{item.status === "PUBLISHED" && <a href={`/vybe/${item.slug}`} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={13} /> Preview</a>}<button type="button" className="danger" onClick={() => void remove(item)}><Trash2 size={13} /> Delete</button></div></div>
        </article>)}</div>
        {pageCount > 1 && <div className="vybe-studio__pagination"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} / {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
      </section>

      <section className="vybe-studio__editor" id="vybe-editor" aria-labelledby="vybe-editor-title">
        <div className="vybe-studio__section-title"><div><span className="vybe-label">{editingId ? `EDITING / ${form.status}` : "NEW RECORD / PRIVATE DRAFT"}</span><h2 id="vybe-editor-title">{editingId ? "Creation editor" : "Create a signal"}</h2></div>{isDirty && <span className="vybe-studio__unsaved">Unsaved</span>}</div>
        <form onSubmit={(event) => {
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const requested = submitter instanceof HTMLButtonElement ? submitter.dataset.saveStatus : undefined;
          const nextStatus: VybeStatus = requested === "DRAFT" || requested === "PUBLISHED" || requested === "ARCHIVED"
            ? requested
            : form.status;
          void save(event, nextStatus);
        }}>
          <fieldset disabled={saving} className="vybe-studio__fieldset">
            <div className="vybe-studio__form-grid">
              <Field label="Title"><input required maxLength={160} value={form.title} onChange={(event) => update("title", event.target.value)} /></Field>
              <Field label="Slug"><input required maxLength={180} value={form.slug} onChange={(event) => update("slug", event.target.value)} placeholder="A URL-friendly title" /></Field>
            </div>
            <Field label="Short description"><textarea required maxLength={280} rows={2} value={form.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} /></Field>
            <Field label="Description"><textarea required maxLength={12000} rows={4} value={form.description} onChange={(event) => update("description", event.target.value)} /></Field>
            <div className="vybe-studio__form-grid">
              <Field label="Category"><input required maxLength={80} list="vybe-categories" value={form.category} onChange={(event) => update("category", event.target.value)} /><datalist id="vybe-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist></Field>
              <Field label="Creation type"><select value={form.contentType} onChange={(event) => update("contentType", event.target.value as VybeType)}>{types.map((item) => <option key={item} value={item}>{item === "3d" ? "3D" : item}</option>)}</select></Field>
              <Field label="Primary model/tool"><input maxLength={160} value={form.model} onChange={(event) => update("model", event.target.value)} placeholder="e.g. Flux, Runway, Lovable" /></Field>
              <Field label="Models / tools"><input value={form.models.join(", ")} onChange={(event) => update("models", arrayField(event.target.value))} placeholder="Comma-separated" /></Field>
              <Field label="Tags"><input value={form.tags.join(", ")} onChange={(event) => update("tags", arrayField(event.target.value))} placeholder="Comma-separated tags" /></Field>
            </div>

            <div className="vybe-studio__type-fields">
              <span className="vybe-label">{form.contentType.toUpperCase()} CONFIGURATION</span>
              {form.contentType === "video" && <div className="vybe-studio__form-grid">
                <Field label="Scene"><textarea required rows={3} value={form.scene} onChange={(event) => update("scene", event.target.value)} /></Field>
                <Field label="Motion"><textarea required rows={3} value={form.motion} onChange={(event) => update("motion", event.target.value)} /></Field>
                <Field label="Camera instructions"><textarea rows={3} value={form.cameraInstructions} onChange={(event) => update("cameraInstructions", event.target.value)} /></Field>
                <Field label="Duration in seconds"><input type="number" min={1} max={3600} value={form.durationSeconds ?? ""} onChange={(event) => update("durationSeconds", event.target.value ? Number(event.target.value) : null)} /></Field>
              </div>}
              {(form.contentType === "image" || form.contentType === "art" || form.contentType === "design" || form.contentType === "3d") && <div className="vybe-studio__form-grid">
                <Field label="Visual style"><input value={form.style} onChange={(event) => update("style", event.target.value)} placeholder="e.g. bioluminescent brutalism" /></Field>
                <Field label="Aspect ratio"><input value={form.aspectRatio} onChange={(event) => update("aspectRatio", event.target.value)} placeholder="e.g. 3:2, 16:9" /></Field>
                <Field label="Generation parameters (JSON)"><textarea rows={3} value={form.parametersText} onChange={(event) => update("parametersText", event.target.value)} /></Field>
              </div>}
              {(form.contentType === "app" || form.contentType === "game") && <div className="vybe-studio__form-grid">
                <Field label="Builder instructions"><textarea rows={5} value={form.builderInstructions} onChange={(event) => update("builderInstructions", event.target.value)} placeholder="The build prompt and constraints" /></Field>
                <Field label="Demo / code preview URL"><input type="url" value={form.demoUrl} onChange={(event) => update("demoUrl", event.target.value)} placeholder="https://" /></Field>
                <Field label="Verification details"><textarea rows={3} value={form.verificationDetails} onChange={(event) => update("verificationDetails", event.target.value)} placeholder="What was tested and how?" /></Field>
                <Field label="Tools"><input value={form.tools.join(", ")} onChange={(event) => update("tools", arrayField(event.target.value))} placeholder="e.g. Cursor, React, Three.js" /></Field>
              </div>}
              {form.contentType === "interactive" && <div className="vybe-studio__form-grid">
                <Field label="Playable HTTPS URL"><input required type="url" value={form.experienceUrl} onChange={(event) => update("experienceUrl", event.target.value)} placeholder="A real, implemented experience" /></Field>
                <Field label="Controls"><input value={form.experienceControls.join(", ")} onChange={(event) => update("experienceControls", arrayField(event.target.value))} placeholder="e.g. WASD, click, touch" /></Field>
                <Field label="Verification details"><textarea required rows={3} value={form.verificationDetails} onChange={(event) => update("verificationDetails", event.target.value)} placeholder="How was playability verified?" /></Field>
              </div>}
              {form.contentType === "custom" && <Field label="Custom type data (JSON)"><textarea rows={4} value={form.extraDataText} onChange={(event) => update("extraDataText", event.target.value)} /></Field>}
            </div>

            <Field label="Prompt content"><textarea rows={7} value={form.prompt} onChange={(event) => update("prompt", event.target.value)} placeholder="The prompt as used in the named model/tool" /></Field>
            {form.contentType === "image" && <Field label="Negative prompt"><textarea rows={3} value={form.negativePrompt} onChange={(event) => update("negativePrompt", event.target.value)} /></Field>}
            <Field label="Refinement instructions"><textarea rows={3} value={form.refinementInstructions} onChange={(event) => update("refinementInstructions", event.target.value)} placeholder="How to adjust, remix, or iterate on the output" /></Field>

            <div className="vybe-studio__media">
              <div className="vybe-studio__media-head"><div><span className="vybe-label">IMAGEKIT MEDIA</span><h3>Outputs & previews</h3><p>Upload directly to ImageKit or choose a library asset. Files remain on ImageKit; the record stores CDN metadata only.</p></div><button type="button" disabled={uploading} onClick={() => fileInput.current?.click()}><Upload size={15} /> Upload media</button></div>
              <input ref={fileInput} className="vybe-studio__hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
              {uploading && <div className="vybe-studio__upload-progress"><span>Uploading {uploadProgress}%</span><progress max={100} value={uploadProgress || undefined} /></div>}
              <ImageKitPicker value={form.imageUrl} onSelect={addPickerAsset} />
              <div className="vybe-studio__form-grid">
                <Field label="Cover image URL"><input type="url" value={form.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} placeholder="https://…" /></Field>
                <Field label="Image alt text"><input maxLength={500} value={form.imageAlt} onChange={(event) => update("imageAlt", event.target.value)} /></Field>
                <Field label="Video URL"><input type="url" value={form.videoUrl} onChange={(event) => update("videoUrl", event.target.value)} placeholder="https://…" /></Field>
                <Field label="Video poster URL"><input type="url" value={form.posterUrl} onChange={(event) => update("posterUrl", event.target.value)} placeholder="https://…" /></Field>
              </div>
              {mainPreview && <div className="vybe-studio__preview">{form.videoUrl ? <video src={form.videoUrl} poster={form.posterUrl || undefined} controls playsInline /> : <img src={mainPreview} alt={form.imageAlt || form.title} />}</div>}
              {form.mediaAssets.length > 0 && <div className="vybe-studio__assets">{form.mediaAssets.map((asset, index) => <article key={`${asset.assetId ?? asset.url}-${index}`}><div>{asset.type === "video" ? <Film size={15} /> : <ImagePlus size={15} />}<a href={asset.url} target="_blank" rel="noopener noreferrer">{asset.url.split("/").at(-1)}</a></div><span>{asset.type} · {asset.assetId ? `ID ${asset.assetId}` : "external URL"}</span><button type="button" onClick={() => { update("imageUrl", asset.type === "image" ? asset.url : form.imageUrl); update("videoUrl", asset.type === "video" ? asset.url : form.videoUrl); }} title="Use as preview">Set preview</button><button type="button" onClick={() => setForm((current) => ({ ...current, mediaAssets: current.mediaAssets.filter((entry) => entry.url !== asset.url), exampleOutputs: current.exampleOutputs.filter((entry) => entry.url !== asset.url), visualReferences: current.visualReferences.filter((entry) => entry.url !== asset.url) }))} title="Remove from this draft"><X size={14} /></button></article>)}</div>}
            </div>

            <div className="vybe-studio__form-grid">
              <Field label="Visual reference URLs (comma-separated)"><input value={form.visualReferences.map((asset) => asset.url).join(", ")} onChange={(event) => update("visualReferences", arrayField(event.target.value).map((url) => ({ url, type: "image", alt: "" })))} /></Field>
              <Field label="Example output URLs (comma-separated)"><input value={form.exampleOutputs.map((asset) => asset.url).join(", ")} onChange={(event) => update("exampleOutputs", arrayField(event.target.value).map((url) => ({ url, type: "image", alt: "" })))} /></Field>
            </div>
            <div className="vybe-studio__form-grid">
              <Field label="Status"><select value={form.status} onChange={(event) => update("status", event.target.value as VybeStatus)}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></Field>
              <Field label="Featured placement"><input type="number" min={0} value={form.featuredPosition} onChange={(event) => update("featuredPosition", Number(event.target.value))} /></Field>
            </div>
            <div className="vybe-studio__checks"><label><input type="checkbox" checked={form.featured} onChange={(event) => update("featured", event.target.checked)} /><Star size={14} /> Featured</label><label><input type="checkbox" checked={form.trending} onChange={(event) => update("trending", event.target.checked)} /> Trending</label></div>
          </fieldset>
          <div className="vybe-studio__save-actions">
            <button type="button" className="is-secondary" disabled={saving} onClick={startNew}><X size={15} /> Clear</button>
            <button type="submit" data-save-status="DRAFT" disabled={saving}>{form.status === "PUBLISHED" ? "Unpublish to draft" : "Save draft"}</button>
            <button type="submit" data-save-status="PUBLISHED" disabled={saving} className="is-publish">{form.status === "PUBLISHED" ? "Save published" : "Publish / republish"}</button>
            {form.status === "ARCHIVED" && <button type="submit" data-save-status="ARCHIVED" disabled={saving}>Save archived</button>}
          </div>
          <span className="vybe-studio__status-hint">Use the status selector above; the save action applies that lifecycle state.</span>
        </form>

        <div className="vybe-studio__live-preview">
          <span className="vybe-label">LIVE PREVIEW / {form.contentType.toUpperCase()}</span>
          <div className="vybe-card vybe-card--featured">
            <div className="vybe-card__art">{mainPreview ? form.videoUrl ? <video src={form.videoUrl} poster={form.posterUrl || undefined} muted playsInline /> : <img src={mainPreview} alt={form.imageAlt || form.title} /> : <div className="vybe-card__placeholder"><Sparkles size={26} /><span>YOUR ARTWORK HERE</span></div>}<div className="vybe-card__art-shade" /><div className="vybe-card__top"><span>{form.category || "CATEGORY"}</span><span>{form.contentType.toUpperCase()}</span></div></div>
            <div className="vybe-card__body"><div className="vybe-card__title-row"><h3>{form.title || "A new creation"}</h3>{form.featured && <Star size={14} />}</div><p>{form.shortDescription || "Your short description appears here."}</p><div className="vybe-card__meta"><span>{form.model || "Model"}</span>{form.tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
          </div>
        </div>
      </section>
    </div>
    {csvOpen && <div className="vybe-csv__scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !csvBusy) setCsvOpen(false); }}>
      <section className="vybe-csv" role="dialog" aria-modal="true" aria-labelledby="vybe-csv-title">
        <header className="vybe-csv__header">
          <div><span className="vybe-label">VYBE / SAFE DATA TRANSFER</span><h2 id="vybe-csv-title">CSV import & export</h2><p>Validate before writing. Imports are draft-only unless publishing is explicitly enabled.</p></div>
          <button type="button" disabled={csvBusy} onClick={() => setCsvOpen(false)} aria-label="Close CSV tools">Close</button>
        </header>
        {csvSchema && <p className="vybe-csv__schema">Schema v{csvSchema.version} · {Math.floor(csvSchema.maxBytes / 1024 / 1024)} MB max · {csvSchema.maxRows} rows max · columns are derived from the VYBE editor schema.</p>}
        <div className="vybe-csv__file">
          <input ref={csvFileInput} className="vybe-studio__hidden" type="file" accept=".csv,text/csv" onChange={(event) => { void selectCsvFile(event.target.files?.[0]); }} />
          <button type="button" disabled={csvBusy} onClick={() => csvFileInput.current?.click()}><Upload size={15} /> Choose CSV</button>
          <span>{csvFileName || "No file selected"}</span>
          {csvText && <span>{csvHeaderList.length} columns · {new Blob([csvText]).size.toLocaleString()} bytes</span>}
        </div>
        {csvText && csvSchema && <div className="vybe-csv__config">
          <label>Conflict strategy
            <select value={csvStrategy} disabled={csvBusy} onChange={(event) => { setCsvStrategy(event.target.value); setCsvValidation(null); }}>
              <option value="create-only">Create only — skip existing slugs</option>
              <option value="update-existing">Update only — skip new slugs</option>
              <option value="upsert">Upsert — create or update</option>
            </select>
          </label>
          <label className="vybe-csv__publish"><input type="checkbox" checked={publishImported} disabled={csvBusy} onChange={(event) => { setPublishImported(event.target.checked); setCsvValidation(null); }} /> Preserve published status from CSV</label>
          <details className="vybe-csv__mapping">
            <summary>Map columns · required: title and slug</summary>
            <div className="vybe-csv__mapping-grid">{csvSchema.fields.map((field) => <label key={field.name}>
              <span>{field.name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}{field.required && <b> required</b>}</span>
              <select value={csvMapping[field.name] ?? ""} disabled={csvBusy} onChange={(event) => {
                const next = { ...csvMapping };
                if (event.target.value) next[field.name] = event.target.value;
                else delete next[field.name];
                setCsvMapping(next);
                setCsvValidation(null);
              }}>
                <option value="">Auto-match / ignore</option>
                {csvHeaderList.map((header, index) => <option value={header} key={`${header}-${index}`}>{header}</option>)}
              </select>
            </label>)}</div>
          </details>
          <button type="button" disabled={csvBusy} className="vybe-csv__primary" onClick={() => void validateCsv()}>{csvBusy ? <LoaderCircle size={15} /> : <Sparkles size={15} />} Validate CSV</button>
          {csvValidation && <div className="vybe-csv__results" aria-live="polite">
            <div className="vybe-csv__counts">
              <span><b>{csvValidation.counts.create}</b> create</span><span><b>{csvValidation.counts.update}</b> update</span><span><b>{csvValidation.counts.skipped}</b> skip</span><span><b>{csvValidation.counts.invalid}</b> invalid</span>
            </div>
            <div className="vybe-csv__row-list">{csvValidation.rows.slice(0, 25).map((row) => <article key={row.row} className={row.valid ? "" : "is-invalid"}>
              <strong>Row {row.row} · {row.slug || "no slug"}</strong><span>{row.action}</span>
              {[...row.errors.map((entry) => `${entry.column}: ${entry.message}`), ...row.warnings].map((message, index) => <small key={`${row.row}-${index}`}>{message}</small>)}
            </article>)}</div>
            {csvValidation.rows.length > 25 && <small>Showing 25 of {csvValidation.rows.length} rows. Download the report for the full error list after import.</small>}
            <button type="button" disabled={csvBusy || !csvValidation.counts.create && !csvValidation.counts.update} className="vybe-csv__primary" onClick={() => void commitCsv()}>
              {csvBusy ? <LoaderCircle size={15} /> : <Upload size={15} />} Import {csvValidation.counts.create + csvValidation.counts.update} records
            </button>
          </div>}
        </div>}
        <section className="vybe-csv__history" aria-label="Recent CSV imports">
          <h3>Recent imports</h3>
          {csvHistoryError && <p className="vybe-csv__history-error" role="status">Import history is unavailable: {csvHistoryError} If the API reports a missing table, apply <code>lib/db/migrations/0008_vybe_csv_import_jobs.sql</code> to the local database.</p>}
          {csvJobs.length === 0 && <p>No import jobs yet.</p>}
          {csvJobs.map((job) => <article key={job.id}>
            <span><b>#{job.id}</b> {job.status.replaceAll("_", " ")} · {new Date(job.createdAt).toLocaleString()}</span>
            <small>{job.importedRows} imported · {job.skippedRows} skipped · {job.failedRows} failed</small>
            {job.failedRows > 0 && <button type="button" onClick={() => void downloadCsvErrorReport(job.id)}>Download errors</button>}
          </article>)}
        </section>
      </section>
    </div>}
    <footer className="vybe-footer"><span>VYBE STUDIO / PRIVATE BY DEFAULT</span><Sparkles size={17} /><span>CHANGES ARE SAVED TO THE SEPARATE VYBE CATALOGUE</span></footer>
  </section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="vybe-studio__field"><span>{label}</span>{children}</label>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="vybe-stat"><span>{label}</span><strong>{value}</strong></div>;
}
