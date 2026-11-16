import React, { useRef, useState } from 'react';
import {
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { GeneratedImageItem, ImageAspectRatio, UserIdentity } from '../types';
import { IMAGE_STUDIO_PRESETS } from '../data/starterPrompts';

interface ImageStudioProps {
  images: GeneratedImageItem[];
  userIdentity: UserIdentity;
  onAddImage: (item: GeneratedImageItem) => void;
  onDeleteImage: (id: string) => void;
}

const ASPECT_RATIOS: { value: ImageAspectRatio; label: string }[] = [
  { value: '1:1', label: '1:1 Square' },
  { value: '16:9', label: '16:9 Widescreen' },
  { value: '4:3', label: '4:3 Standard' },
  { value: '3:4', label: '3:4 Portrait' },
  { value: '9:16', label: '9:16 Vertical' },
];

export const ImageStudio: React.FC<ImageStudioProps> = ({
  images,
  userIdentity,
  onAddImage,
  onDeleteImage,
}) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [referenceImage, setReferenceImage] = useState<{
    name: string;
    mimeType: string;
    base64Data: string;
    previewUrl: string;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<GeneratedImageItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64Data = dataUrl.split(',')[1] || '';
      setReferenceImage({
        name: file.name,
        mimeType: file.type || 'image/png',
        base64Data,
        previewUrl: dataUrl,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspectRatio,
          userIdentity,
          referenceImage: referenceImage
            ? {
                mimeType: referenceImage.mimeType,
                base64Data: referenceImage.base64Data,
              }
            : null,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to generate image.');
      }

      const newItem: GeneratedImageItem = {
        id: `img-${Date.now()}`,
        prompt: prompt.trim(),
        aspectRatio,
        imageUrl: data.imageUrl,
        caption: data.caption,
        createdAt: new Date().toISOString(),
      };

      onAddImage(newItem);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An error occurred during image synthesis.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (item: GeneratedImageItem) => {
    const a = document.createElement('a');
    a.href = item.imageUrl;
    a.download = `manbot-studio-${item.id}.png`;
    a.click();
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0B0F19] p-6 lg:p-8">
      <div className="max-w-[1160px] mx-auto space-y-8">
        {/* Studio Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold text-white tracking-tight">
              MANBOT Image Synthesis Studio
            </h1>
            <p className="text-sm text-slate-400 mt-1.5 max-w-2xl">
              Generate high-resolution visual concepts or upload a reference image for targeted visual editing using Gemini image synthesis.
            </p>
          </div>
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            <span>Model: gemini-3.1-flash-lite-image</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>{images.length} saved renders</span>
          </div>
        </div>

        {/* Prompt Composer & Configuration */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleGenerate}
            className="lg:col-span-5 bg-[#111827] border border-white/[0.08] rounded-xl p-5 space-y-5"
          >
            <div className="space-y-2">
              <label
                htmlFor="studio-prompt"
                className="block text-xs font-medium text-slate-300"
              >
                Visual Prompt & Lighting Direction
              </label>
              <textarea
                id="studio-prompt"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe subject, material textures, lighting mood, and camera perspective..."
                className="w-full rounded-lg bg-[#0B0F19] border border-white/[0.08] focus:border-indigo-500 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none"
              />
            </div>

            {/* Aspect Ratio Selector */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">
                Aspect Ratio
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-3 gap-2">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio.value}
                    type="button"
                    onClick={() => setAspectRatio(ratio.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                      aspectRatio === ratio.value
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-[#0B0F19] border-white/[0.08] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Reference Image for Image-to-Image Editing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">
                  Reference Image (Optional for Editing)
                </span>
                {referenceImage && (
                  <button
                    type="button"
                    onClick={() => setReferenceImage(null)}
                    className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleReferenceUpload}
                className="hidden"
              />

              {referenceImage ? (
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#0B0F19] border border-white/[0.08]">
                  <img
                    src={referenceImage.previewUrl}
                    alt={referenceImage.name}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded object-cover border border-white/[0.08]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-200 truncate">
                      {referenceImage.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Prompt will edit or transform this image
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-dashed border-white/[0.14] hover:border-indigo-500/60 bg-[#0B0F19]/60 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Attach Reference Image to Edit</span>
                </button>
              )}
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-400">
                Studio Presets
              </span>
              <div className="flex flex-wrap gap-1.5">
                {IMAGE_STUDIO_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setPrompt(preset.prompt);
                      setAspectRatio(preset.aspectRatio);
                    }}
                    className="px-2.5 py-1 rounded text-xs bg-[#0B0F19] hover:bg-white/[0.06] text-slate-300 border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isGenerating || !prompt.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-sm font-medium text-white transition-colors cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Render...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Artwork</span>
                </>
              )}
            </button>
          </form>

          {/* Gallery Viewport */}
          <div className="lg:col-span-7 space-y-4">
            {isGenerating && (
              <div className="p-6 rounded-xl bg-[#111827] border border-white/[0.08] flex flex-col items-center justify-center min-h-[280px] text-center space-y-3">
                <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">
                    MANBOT is rendering your artwork...
                  </p>
                  <p className="text-xs text-slate-400 max-w-md">
                    {prompt}
                  </p>
                </div>
              </div>
            )}

            {images.length === 0 && !isGenerating ? (
              <div className="p-10 rounded-xl bg-[#111827] border border-white/[0.08] flex flex-col items-center justify-center min-h-[360px] text-center space-y-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <h2 className="font-display text-lg font-semibold text-white">
                    No Studio Renders Yet
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Enter a prompt on the left or select one of the studio presets to generate high-resolution visual concepts with MANBOT.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPrompt(IMAGE_STUDIO_PRESETS[0].prompt);
                    setAspectRatio(IMAGE_STUDIO_PRESETS[0].aspectRatio);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-white transition-colors cursor-pointer"
                >
                  Load Architectural Preset
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {images.map((item) => (
                  <div
                    key={item.id}
                    className="group rounded-xl bg-[#111827] border border-white/[0.08] overflow-hidden flex flex-col"
                  >
                    <div className="relative aspect-square bg-[#070A12] overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={item.prompt}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setLightboxImage(item)}
                            className="p-2 rounded-lg bg-black/70 text-white hover:bg-indigo-600 transition-colors cursor-pointer"
                            title="Inspect full size"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownload(item)}
                            className="p-2 rounded-lg bg-black/70 text-white hover:bg-indigo-600 transition-colors cursor-pointer"
                            title="Download PNG"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteImage(item.id)}
                          className="p-2 rounded-lg bg-black/70 text-rose-300 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                          title="Delete image"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3.5 space-y-1.5 flex-1 flex flex-col justify-between">
                      <p className="text-xs text-slate-200 line-clamp-2 leading-relaxed">
                        {item.prompt}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums pt-1">
                        <span>{item.aspectRatio}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="max-w-4xl w-full bg-[#111827] border border-white/[0.1] rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
              <div className="text-xs text-slate-300 font-mono tabular-nums">
                <span>Aspect Ratio: {lightboxImage.aspectRatio}</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <span>MANBOT Studio Render</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(lightboxImage)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto bg-[#070A12] flex items-center justify-center p-4">
              <img
                src={lightboxImage.imageUrl}
                alt={lightboxImage.prompt}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto object-contain rounded"
              />
            </div>
            <div className="p-4 border-t border-white/[0.08] text-xs text-slate-300 leading-relaxed">
              {lightboxImage.prompt}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
