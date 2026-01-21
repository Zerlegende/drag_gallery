"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { env } from "@/lib/env";
import { getImageVariantKey } from "@/lib/image-variants-utils";

const BASE_URL = env.client.NEXT_PUBLIC_MINIO_BASE_URL;

type VariantType = 'original' | 'grid' | 'preview' | 'fullscreen';

interface ImageVariantsProps {
  imageId: string;
  imageKey: string;
  imageName: string;
  updatedAt: string;
}

const VARIANT_INFO = {
  original: { label: 'Original', size: 'Full Size' },
  grid: { label: 'Grid (@300)', size: '300px' },
  preview: { label: 'Preview (@800)', size: '800px' },
  fullscreen: { label: 'Fullscreen (@1600)', size: '1600px' },
};

export default function ImageVariantsPage({ imageId, imageKey, imageName, updatedAt }: ImageVariantsProps) {
  const router = useRouter();
  const [rotating, setRotating] = useState<Record<VariantType, boolean>>({
    original: false,
    grid: false,
    preview: false,
    fullscreen: false,
  });
  const [imageKeys, setImageKeys] = useState<Record<VariantType, number>>({
    original: 0,
    grid: 0,
    preview: 0,
    fullscreen: 0,
  });

  const getImageUrl = (variant: VariantType) => {
    const key = variant === 'original' ? imageKey : getImageVariantKey(imageKey, variant);
    return `${BASE_URL}/${key}?t=${updatedAt}&k=${imageKeys[variant]}`;
  };

  const rotateVariant = async (variant: VariantType, degrees: number) => {
    setRotating((prev) => ({ ...prev, [variant]: true }));

    try {
      const response = await fetch(`/api/images/${imageId}/rotate-variant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ degrees, variant }),
      });

      if (!response.ok) {
        throw new Error('Rotation failed');
      }

      setImageKeys((prev) => ({ ...prev, [variant]: prev[variant] + 1 }));
      router.refresh();
    } catch (error) {
      console.error(`Failed to rotate ${variant}:`, error);
      alert(`Fehler beim Rotieren von ${VARIANT_INFO[variant].label}`);
    } finally {
      setRotating((prev) => ({ ...prev, [variant]: false }));
    }
  };

  const rotateAll = async (degrees: number) => {
    const variants: VariantType[] = ['original', 'grid', 'preview', 'fullscreen'];
    
    setRotating({
      original: true,
      grid: true,
      preview: true,
      fullscreen: true,
    });

    try {
      const response = await fetch(`/api/images/${imageId}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ degrees }),
      });

      if (!response.ok) {
        throw new Error('Bulk rotation failed');
      }

      setImageKeys((prev) => ({
        original: prev.original + 1,
        grid: prev.grid + 1,
        preview: prev.preview + 1,
        fullscreen: prev.fullscreen + 1,
      }));
      router.refresh();
    } catch (error) {
      console.error('Failed to rotate all variants:', error);
      alert('Fehler beim Rotieren aller Versionen');
    } finally {
      setRotating({
        original: false,
        grid: false,
        preview: false,
        fullscreen: false,
      });
    }
  };

  const variants: VariantType[] = ['original', 'grid', 'preview', 'fullscreen'];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Bildvarianten verwalten</h1>
        <p className="text-gray-600">{imageName}</p>
      </div>

      {/* Bulk Rotation Controls */}
      <div className="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Alle Versionen rotieren</h2>
        <div className="flex gap-3">
          <Button
            onClick={() => rotateAll(90)}
            disabled={Object.values(rotating).some(r => r)}
            className="flex items-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            Alle 90° →
          </Button>
          <Button
            onClick={() => rotateAll(180)}
            disabled={Object.values(rotating).some(r => r)}
            className="flex items-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            Alle 180°
          </Button>
          <Button
            onClick={() => rotateAll(270)}
            disabled={Object.values(rotating).some(r => r)}
            className="flex items-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            Alle 90° ←
          </Button>
        </div>
      </div>

      {/* Individual Variants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {variants.map((variant) => (
          <div
            key={variant}
            className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm"
          >
            <div className="mb-4">
              <h3 className="text-lg font-semibold">{VARIANT_INFO[variant].label}</h3>
              <p className="text-sm text-gray-500">{VARIANT_INFO[variant].size}</p>
            </div>

            <div className="mb-4 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center" style={{ minHeight: '300px' }}>
              <img
                key={imageKeys[variant]}
                src={getImageUrl(variant)}
                alt={`${imageName} - ${VARIANT_INFO[variant].label}`}
                className="max-w-full max-h-[400px] object-contain"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => rotateVariant(variant, 90)}
                disabled={rotating[variant]}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                <RotateCw className="w-3 h-3 mr-1" />
                90° →
              </Button>
              <Button
                onClick={() => rotateVariant(variant, 180)}
                disabled={rotating[variant]}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                <RotateCw className="w-3 h-3 mr-1" />
                180°
              </Button>
              <Button
                onClick={() => rotateVariant(variant, 270)}
                disabled={rotating[variant]}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                <RotateCw className="w-3 h-3 mr-1" />
                90° ←
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
