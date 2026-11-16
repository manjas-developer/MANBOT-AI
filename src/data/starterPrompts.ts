import { PromptTemplate } from '../types';

export const STARTER_PROMPTS: PromptTemplate[] = [
  {
    id: 'canvas-react-dashboard',
    title: 'Interactive SaaS Metrics Widget in Canvas',
    category: 'Coding & Architecture',
    description: 'Draft a self-contained interactive HTML/CSS/JS analytics card and preview it live in the side-by-side Canvas.',
    prompt:
      'Create a self-contained, single-file HTML/CSS/JS interactive revenue & retention telemetry widget with a dark studio theme, interactive time-range buttons, and an animated SVG area chart. Wrap the complete code in an ```html code block so I can preview and edit it in the Canvas.',
    thinkingLevel: 'HIGH',
    opensCanvas: true,
  },
  {
    id: 'grounding-tech-brief',
    title: 'Live Web Research & Citation Brief',
    category: 'Research & Grounding',
    description: 'Search the live web with Google Search grounding and synthesize verified findings with clickable sources.',
    prompt:
      'Use Google Search to research the latest breakthroughs in solid-state battery commercialization and grid-scale storage over the past 6 months. Summarize key milestones, leading companies, and quantitative metrics with cited sources.',
    useGoogleSearch: true,
    thinkingLevel: 'HIGH',
  },
  {
    id: 'canvas-system-architecture',
    title: 'Distributed System Architecture RFC',
    category: 'Writing & Strategy',
    description: 'Co-author a structured technical specification document in Markdown inside the split-screen Canvas.',
    prompt:
      'Write a comprehensive Engineering RFC in Markdown for a low-latency multi-region event streaming pipeline. Include architecture ASCII diagrams, SLA targets, failure recovery modes, and schema evolution rules. Output the full document in a ```markdown block for Canvas editing.',
    thinkingLevel: 'XHIGH',
    opensCanvas: true,
  },
  {
    id: 'multimodal-code-audit',
    title: 'Deep Algorithm & Security Audit',
    category: 'Coding & Architecture',
    description: 'Run maximum reasoning depth (XHIGH) to design a lock-free rate limiter in TypeScript.',
    prompt:
      'Design a production-grade token bucket and sliding window hybrid rate limiter in TypeScript with zero external dependencies, full type safety, and unit test cases. Provide the implementation inside a ```typescript block.',
    thinkingLevel: 'XHIGH',
    opensCanvas: true,
  },
  {
    id: 'grounding-market-landscape',
    title: 'Competitive Market & Pricing Matrix',
    category: 'Research & Grounding',
    description: 'Compare current developer cloud GPU providers and pricing tiers using live search grounding.',
    prompt:
      'Search the web for current cloud GPU instance pricing and availability across major providers for AI inference workloads. Present a clean Markdown comparison table with concrete hourly pricing and memory specs.',
    useGoogleSearch: true,
    thinkingLevel: 'HIGH',
  },
  {
    id: 'writing-product-launch',
    title: 'Product Launch Keynote & Press Narrative',
    category: 'Writing & Strategy',
    description: 'Draft a high-impact launch announcement and executive FAQ ready for iterative refinement in Canvas.',
    prompt:
      'Draft a crisp, high-conviction product launch announcement and technical FAQ for an enterprise developer platform. Avoid buzzwords and focus on concrete engineering outcomes. Output inside a ```markdown block so we can refine it in Canvas.',
    thinkingLevel: 'HIGH',
    opensCanvas: true,
  },
];

export const IMAGE_STUDIO_PRESETS = [
  {
    label: 'Architectural Brutalism',
    aspectRatio: '16:9' as const,
    prompt:
      'Cinematic wide-angle architectural photograph of a minimalist concrete and glass research pavilion cantilevered over a misty Nordic fjord at twilight, warm interior tungsten glow contrasting with cool slate blue atmosphere, 35mm editorial photography.',
  },
  {
    label: 'Precision Horology Macro',
    aspectRatio: '1:1' as const,
    prompt:
      'Extreme macro studio photograph of a skeletonized mechanical chronograph movement in brushed titanium and rose gold bridges, shallow depth of field, crisp studio rim lighting on dark obsidian slate surface.',
  },
  {
    label: 'Isometric Hardware Core',
    aspectRatio: '4:3' as const,
    prompt:
      'Clean technical isometric rendering of a next-generation quantum optical processor module, anodized matte black aluminum housing, subtle indigo fiber-optic light paths, precision machined cooling fins, studio lighting.',
  },
  {
    label: 'Editorial Botanical Study',
    aspectRatio: '3:4' as const,
    prompt:
      'High-contrast fine art botanical portrait of rare bioluminescent deep-forest flora in a hand-blown smoked glass vessel, dramatic natural window shadows, rich organic textures, muted editorial color grading.',
  },
];
