import { ArrowUpRight, Copy, Image as ImageIcon, Sparkles } from 'lucide-react';
import type { RecipeGuidePromptType, RecipePromptStudio, RecipeVisualImage } from '@workspace/api-client-react';
import './recipe-prompt-showcase.css';

const promptTypeLabels: Record<Exclude<RecipeGuidePromptType, 'text'>, string> = {
  image: 'Image prompt',
  game: 'Game concept',
  website: 'Website concept',
};

function isHttpUrl(value?: string) {
  if (!value) return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function RecipePromptShowcase({
  promptType,
  title,
  description,
  images,
  details,
  onCopy,
  copyDisabled,
  copied,
}: {
  promptType: Exclude<RecipeGuidePromptType, 'text'>;
  title: string;
  description: string;
  images: RecipeVisualImage[];
  details?: RecipePromptStudio;
  onCopy: () => void;
  copyDisabled: boolean;
  copied: boolean;
}) {
  const metadata = promptType === 'image'
    ? [
        ['Style', details?.style],
        ['Model', details?.model],
        ['Aspect ratio', details?.aspectRatio],
      ]
    : promptType === 'game'
      ? [
          ['Genre', details?.gameGenre],
          ['Platform', details?.gamePlatform],
          ['Engine', details?.gameEngine],
        ]
      : [
          ['Framework', details?.websiteFramework],
          ['Visual style', details?.websiteStyle],
        ];

  return (
    <section
      className={`prompt-showcase prompt-showcase--${promptType}`}
      aria-label={`${promptTypeLabels[promptType]} showcase`}
      data-testid={`prompt-showcase-${promptType}`}
    >
      <div className="prompt-showcase__heading">
        <div>
          <span className="prompt-showcase__eyebrow"><Sparkles size={14} /> Visual prompt</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="prompt-showcase__type">{promptTypeLabels[promptType]}</span>
      </div>

      <div className="prompt-showcase__gallery">
        {images.filter((image) => isHttpUrl(image.url)).length > 0 ? (
          images.filter((image) => isHttpUrl(image.url)).map((image, index) => (
            <figure className={index === 0 ? 'prompt-showcase__image prompt-showcase__image--feature' : 'prompt-showcase__image'} key={`${image.url}-${index}`}>
              <img src={image.url} alt={image.alt} loading="lazy" decoding="async" />
              {image.caption && <figcaption>{image.caption}</figcaption>}
            </figure>
          ))
        ) : (
          <div className="prompt-showcase__empty">
            <ImageIcon size={28} />
            <span>Visual references will appear here.</span>
          </div>
        )}
      </div>

      <div className="prompt-showcase__footer">
        <dl className="prompt-showcase__metadata">
          {metadata.filter(([, value]) => Boolean(value?.trim())).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="prompt-showcase__actions">
          {promptType === 'website' && isHttpUrl(details?.previewUrl) && (
            <a href={details?.previewUrl} target="_blank" rel="noopener noreferrer" className="button button-outline">
              View preview <ArrowUpRight size={15} />
            </a>
          )}
          <button type="button" className="button button-dark" onClick={onCopy} disabled={copyDisabled} data-testid="button-showcase-copy">
            <Copy size={15} /> {copied ? 'Copied' : 'Copy prompt'}
          </button>
        </div>
      </div>
    </section>
  );
}
