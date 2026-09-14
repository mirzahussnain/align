'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2 } from 'lucide-react';

interface AvatarUploaderProps {
  name: string;
  image?: string | null;
}

/**
 * Profile picture control: shows the current avatar (or a monogram fallback)
 * and lets the user replace it. Uploads to /api/user/avatar, which stores the
 * bytes in R2 and writes the public URL to User.image, then refreshes the
 * server component tree so the new picture propagates everywhere.
 */
export default function AvatarUploader({ name, image }: AvatarUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(image ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    // Optimistic local preview while the upload is in flight.
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/user/avatar', { method: 'POST', body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }
      const { image: url } = await res.json();
      setPreview(url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setPreview(image ?? null);
    } finally {
      URL.revokeObjectURL(localUrl);
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-neutral-100 pb-4">
      <div className="relative">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="Change profile picture"
          className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-sm font-bold text-white"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            name.charAt(0).toUpperCase()
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Camera className="h-4 w-4 text-white" />
            )}
          </span>
        </button>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-neutral-900">{name}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-[11px] font-medium text-accent-cyan hover:underline disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Change photo'}
        </button>
        {error && <p className="truncate text-[11px] text-red-500">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
