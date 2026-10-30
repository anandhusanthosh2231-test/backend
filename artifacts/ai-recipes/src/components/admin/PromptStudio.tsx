import type { RecipeGuide, RecipeGuidePromptType, RecipePromptStudio, RecipeVisualImage } from '@workspace/api-client-react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { MediaPicker } from '@/components/admin/MediaPicker';
import { ImageKitPicker } from '@/components/admin/ImageKitMediaLibrary';
import './prompt-studio.css';

const promptTypes: Array<{ value: RecipeGuidePromptType; label: string; help: string }> = [
  { value: 'text', label: 'Text', help: 'Keep the standard text recipe experience.' },
  { value: 'image', label: 'Image', help: 'Show image references and generation settings.' },
  { value: 'game', label: 'Game', help: 'Show game concept art, genre, platform, and engine.' },
  { value: 'website', label: 'Website', help: 'Show website visuals, framework, style, and preview link.' },
];

type PromptStudioGuide = Pick<RecipeGuide, 'promptType' | 'imagesJson' | 'promptStudio'>;

function isHttpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function PromptStudio({
  value,
  onChange,
  recipeId,
}: {
  value: PromptStudioGuide;
  onChange: (patch: Partial<PromptStudioGuide>) => void;
  recipeId?: number;
}) {
  const promptType = value.promptType ?? 'text';
  const images = value.imagesJson ?? [];
  const details = value.promptStudio ?? {};
  const updateDetails = (patch: Partial<RecipePromptStudio>) => onChange({ promptStudio: { ...details, ...patch } });
  const updateImage = (index: number, patch: Partial<RecipeVisualImage>) => {
    onChange({ imagesJson: images.map((image, imageIndex) => imageIndex === index ? { ...image, ...patch } : image) });
  };

  return (
    <section className="prompt-studio" aria-labelledby="prompt-studio-title" data-testid="prompt-studio">
      <div className="prompt-studio__heading">
        <div>
          <span className="kicker">Prompt presentation</span>
          <h2 id="prompt-studio-title">Prompt Studio</h2>
          <p>Choose a visual prompt type. Text recipes keep the existing page design.</p>
        </div>
        <label>
          Prompt type
          <select
            value={promptType}
            onChange={(event) => onChange({ promptType: event.target.value as RecipeGuidePromptType })}
            aria-label="Prompt type"
            data-testid="select-prompt-type"
          >
            {promptTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
      </div>
      <p className="prompt-studio__help">{promptTypes.find((type) => type.value === promptType)?.help}</p>

      {promptType !== 'text' && (
        <>
          {promptType === 'image' && (
            <div className="prompt-studio__fields">
              <label>Visual style<input value={details.style ?? ''} onChange={(event) => updateDetails({ style: event.target.value })} placeholder="e.g. Editorial, cinematic, low-poly" /></label>
              <label>Image model<input value={details.model ?? ''} onChange={(event) => updateDetails({ model: event.target.value })} placeholder="e.g. Midjourney, Imagen" /></label>
              <label>Aspect ratio<input value={details.aspectRatio ?? ''} onChange={(event) => updateDetails({ aspectRatio: event.target.value })} placeholder="e.g. 3:2, 16:9" /></label>
            </div>
          )}
          {promptType === 'game' && (
            <div className="prompt-studio__fields">
              <label>Genre<input value={details.gameGenre ?? ''} onChange={(event) => updateDetails({ gameGenre: event.target.value })} placeholder="e.g. Cozy puzzle adventure" /></label>
              <label>Platform<input value={details.gamePlatform ?? ''} onChange={(event) => updateDetails({ gamePlatform: event.target.value })} placeholder="e.g. PC, console, mobile" /></label>
              <label>Game engine<input value={details.gameEngine ?? ''} onChange={(event) => updateDetails({ gameEngine: event.target.value })} placeholder="e.g. Unity, Godot, Unreal" /></label>
            </div>
          )}
          {promptType === 'website' && (
            <div className="prompt-studio__fields">
              <label>Framework<input value={details.websiteFramework ?? ''} onChange={(event) => updateDetails({ websiteFramework: event.target.value })} placeholder="e.g. React, Astro, plain HTML" /></label>
              <label>Visual style<input value={details.websiteStyle ?? ''} onChange={(event) => updateDetails({ websiteStyle: event.target.value })} placeholder="e.g. Editorial, minimal, playful" /></label>
              <label>Live preview URL<input type="url" value={details.previewUrl ?? ''} onChange={(event) => updateDetails({ previewUrl: event.target.value })} placeholder="https://example.com" /></label>
            </div>
          )}

          <div className="prompt-studio__images-heading">
            <div><h3><ImagePlus size={17} /> Visual references</h3><p>Choose an ImageKit asset, upload to Cloudflare storage, or use a public image URL.</p></div>
            <button type="button" className="button button-outline" disabled={images.length >= 20} onClick={() => onChange({ imagesJson: [...images, { url: '', alt: '', caption: '' }] })} data-testid="button-prompt-add-image">
              <Plus size={15} /> Add image
            </button>
          </div>

          {images.length === 0 && <p className="prompt-studio__empty">Add one or more reference images to preview this visual recipe.</p>}
          <div className="prompt-studio__image-list">
            {images.map((image, index) => (
              <fieldset className="prompt-studio__image" key={`${index}-${image.url}`}>
                <legend>Image {index + 1}</legend>
                <label>Image URL
                  <input
                    type="url"
                    value={image.url}
                    onChange={(event) => updateImage(index, { url: event.target.value, fileId: undefined, filePath: undefined })}
                    placeholder="https://your-image-cdn.example/image.webp"
                    data-testid={`input-prompt-image-url-${index}`}
                  />
                </label>
                <MediaPicker
                  recipeId={recipeId}
                  purpose="sections"
                  value={image.url}
                  onSelect={(url) => updateImage(index, { url, fileId: undefined, filePath: undefined })}
                />
                <ImageKitPicker
                  value={image.url}
                  onSelect={(asset) => updateImage(index, {
                    url: asset.url,
                    fileId: asset.fileId,
                    filePath: asset.filePath,
                    alt: asset.alt || image.alt,
                  })}
                />
                <div className="prompt-studio__image-fields">
                  <label>Alt text
                    <input value={image.alt} onChange={(event) => updateImage(index, { alt: event.target.value })} placeholder="Describe what the image shows" />
                  </label>
                  <label>Caption
                    <input value={image.caption ?? ''} onChange={(event) => updateImage(index, { caption: event.target.value })} placeholder="Optional image caption" />
                  </label>
                </div>
                {image.url && isHttpUrl(image.url) && (
                  <div className="prompt-studio__preview" data-testid={`prompt-image-preview-${index}`}>
                    <img src={image.url} alt={image.alt} loading="lazy" decoding="async" />
                    {image.caption && <span>{image.caption}</span>}
                  </div>
                )}
                {image.url && !isHttpUrl(image.url) && <p className="form-error" role="alert">Enter a valid HTTP or HTTPS image URL to preview and save it.</p>}
                {image.url && isHttpUrl(image.url) && !image.alt.trim() && <p className="form-error" role="alert">Add alt text before saving this image.</p>}
                <button type="button" className="prompt-studio__remove" onClick={() => onChange({ imagesJson: images.filter((_, imageIndex) => imageIndex !== index) })} aria-label={`Remove image ${index + 1}`}>
                  <Trash2 size={15} /> Remove image
                </button>
              </fieldset>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
