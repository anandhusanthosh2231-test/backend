import type { RecipeLayoutBlock, RecipeLayoutConfig } from '@workspace/api-client-react';

export const blockKinds: RecipeLayoutBlock['type'][] = [
  'hero', 'overview', 'inputs', 'outcome', 'workflow', 'prompt', 'example', 'refinements',
  'verification', 'troubleshooting', 'diagram', 'images', 'related', 'richText', 'field',
  'output', 'image', 'callout', 'tools', 'useCases', 'mistakes',
];

export const blockLabels: Record<RecipeLayoutBlock['type'], string> = {
  hero: 'Hero / outcome', overview: 'Quick overview', richText: 'Rich text', field: 'Recipe field', inputs: 'Tools and inputs',
  workflow: 'Numbered workflow', prompt: 'Copyable prompt', example: 'Example input/output', output: 'Output structure',
  outcome: 'Expected outcome', refinements: 'Refinement prompts', troubleshooting: 'Troubleshooting',
  diagram: 'Workflow diagram', images: 'Screenshots / images', image: 'Image',
  callout: 'Callout', tools: 'Tools and models', useCases: 'Use cases',
  mistakes: 'Mistakes and best practices', verification: 'Verification and safety', related: 'Related recipes',
};

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createDefaultRecipeLayout(): RecipeLayoutConfig {
  const types: RecipeLayoutBlock['type'][] = [
    'hero', 'prompt', 'workflow', 'overview', 'inputs', 'outcome', 'example',
    'refinements', 'verification', 'troubleshooting', 'diagram', 'images', 'related',
  ];
  return { version: 1, blocks: types.map((type) => ({ id: newId(), type, visible: true, align: 'left', width: 'standard', background: 'plain' })) };
}

export function prioritizePromptWorkflow(blocks: RecipeLayoutBlock[]): RecipeLayoutBlock[] {
  const prompt = blocks.find((block) => block.type === 'prompt');
  const workflow = blocks.find((block) => block.type === 'workflow');
  if (!prompt && !workflow) return blocks;

  const primaryIds = new Set([prompt?.id, workflow?.id]);
  const remaining = blocks.filter((block) => !primaryIds.has(block.id));
  const heroIndex = remaining.findIndex((block) => block.type === 'hero');
  remaining.splice(heroIndex < 0 ? 0 : heroIndex + 1, 0, ...[prompt, workflow].filter(
    (block): block is RecipeLayoutBlock => block !== undefined,
  ));
  return remaining;
}

export function isValidRecipeLayout(value: unknown): value is RecipeLayoutConfig {
  if (!value || typeof value !== 'object') return false;
  const layout = value as { version?: unknown; blocks?: unknown };
  if (layout.version !== 1 || !Array.isArray(layout.blocks) || layout.blocks.length > 50) return false;
  if (Object.keys(layout).some((key) => key !== 'version' && key !== 'blocks')) return false;
  const ids = new Set<string>();
  return layout.blocks.every((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const block = candidate as Record<string, unknown>;
    if (typeof block.id !== 'string' || !block.id || block.id.length > 100 || ids.has(block.id) || !blockKinds.includes(block.type as RecipeLayoutBlock['type']) || typeof block.visible !== 'boolean') return false;
    const allowedKeys = ['id', 'type', 'visible', 'heading', 'subtitle', 'align', 'width', 'background', 'title', 'description', 'content', 'imageUrl', 'alt', 'caption', 'variant', 'fieldRef'];
    if (Object.keys(block).some((key) => !allowedKeys.includes(key))) return false;
    ids.add(block.id);
    if (block.heading !== undefined && (typeof block.heading !== 'string' || block.heading.length > 200)) return false;
    if (block.subtitle !== undefined && (typeof block.subtitle !== 'string' || block.subtitle.length > 500)) return false;
    if (block.title !== undefined && (typeof block.title !== 'string' || block.title.length > 300)) return false;
    if (block.description !== undefined && (typeof block.description !== 'string' || block.description.length > 4000)) return false;
    if (block.content !== undefined && (typeof block.content !== 'string' || block.content.length > 20000)) return false;
    if (block.alt !== undefined && (typeof block.alt !== 'string' || block.alt.length > 500)) return false;
    if (block.caption !== undefined && (typeof block.caption !== 'string' || block.caption.length > 500)) return false;
    if (block.fieldRef !== undefined && !['title', 'shortDescription', 'problem', 'requiredInputs', 'steps', 'prompt', 'exampleInput', 'exampleOutput', 'verificationNotes', 'aiTools', 'tags', 'guide.expectedOutput.description', 'guide.proTips', 'guide.safetyNotes'].includes(String(block.fieldRef))) return false;
    if (block.type === 'field' && typeof block.fieldRef !== 'string') return false;
    if (block.type !== 'field' && block.fieldRef !== undefined) return false;
    if (block.align !== undefined && block.align !== 'left' && block.align !== 'center') return false;
    if (block.width !== undefined && block.width !== 'standard' && block.width !== 'wide') return false;
    if (block.background !== undefined && !['plain', 'tint', 'dark'].includes(block.background as string)) return false;
    if (block.variant !== undefined && !['tip', 'warning', 'info'].includes(block.variant as string)) return false;
    if (typeof block.imageUrl === 'string' && block.imageUrl) {
      try {
        const protocol = new URL(block.imageUrl).protocol;
        if (protocol !== 'https:' && protocol !== 'http:') return false;
      } catch { return false; }
    }
    return true;
  });
}
