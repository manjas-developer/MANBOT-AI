export type ReasoningLevel = 'LOW' | 'HIGH' | 'XHIGH';

export type ModelOptionId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  base64Data: string;
  previewUrl: string;
  sizeBytes: number;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  attachments?: Attachment[];
  groundingSources?: GroundingSource[];
  searchQueries?: string[];
  thinkingLevel?: ReasoningLevel;
  modelId?: ModelOptionId;
  timestamp: string;
  isError?: boolean;
  isQuotaError?: boolean;
  fallbackNotice?: string;
  linkedCanvasId?: string;
}

export type CanvasLanguage =
  | 'markdown'
  | 'typescript'
  | 'javascript'
  | 'html'
  | 'python'
  | 'json'
  | 'css';

export interface CanvasArtifact {
  id: string;
  title: string;
  language: CanvasLanguage;
  content: string;
  updatedAt: string;
  history: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  pinned?: boolean;
  systemInstruction?: string;
  messages: ChatMessage[];
  activeCanvasId?: string;
}

export type ImageAspectRatio = '1:1' | '16:9' | '4:3' | '3:4' | '9:16';

export interface GeneratedImageItem {
  id: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  imageUrl: string;
  caption?: string;
  createdAt: string;
}

export type WorkspaceTab = 'workspace' | 'image-studio' | 'canvases' | 'prompts';

export interface PromptTemplate {
  id: string;
  title: string;
  category: 'Coding & Architecture' | 'Research & Grounding' | 'Writing & Strategy' | 'Multimodal Analysis';
  description: string;
  prompt: string;
  useGoogleSearch?: boolean;
  thinkingLevel?: ReasoningLevel;
  opensCanvas?: boolean;
}

export interface UserIdentity {
  id: string;
  name: string;
  deviceLabel: string;
}

export interface ApiUsageRecord {
  userId: string;
  userName: string;
  deviceLabel: string;
  totalRequests: number;
  chatRequests: number;
  canvasRequests: number;
  imageRequests: number;
  lastModel: string;
  lastActiveAt: string;
}

