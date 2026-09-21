import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CommonImage from '../components/common/CommonImage';

// --- App Icon (Genérico) ---
interface AppIconProps {
  src: string;
  alt?: string;
  className?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({ src, alt = '', className = '' }) => (
  <CommonImage
    src={src}
    alt={alt}
    fallbackSrc="/images/elements/unknown.png"
    className={`object-contain ${className}`}
  />
);

// --- Chevron Icons ---
interface ChevronIconProps {
  className?: string;
}

export const ChevronLeft: React.FC<ChevronIconProps> = ({ className = '' }) => (
  <svg
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 7 7"
    className={`h-[0.80em] w-auto block ${className}`}
    style={{ height: '0.80em' }}
  >
    <path d="M0,0 L2,0 L2,1 L1,1 L1,6 L2,6 L2,7 L0,7 L0,6 L-1,6 L-1,4 L-2,4 L-2,3 L-1,3 L-1,1 L0,1 Z" fill="currentColor" transform="translate(3,0)" />
  </svg>
);

export const ChevronRight: React.FC<ChevronIconProps> = ({ className = '' }) => (
  <svg
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 7 7"
    className={`h-[0.80em] w-auto block ${className}`}
    style={{ height: '0.80em' }}
  >
    <path d="M0,0 L2,0 L2,1 L3,1 L3,3 L4,3 L4,4 L3,4 L3,6 L2,6 L2,7 L0,7 L0,6 L1,6 L1,1 L0,1 Z" fill="currentColor" transform="translate(2,0)" />
  </svg>
);

// --- Arrow Icon ---
interface ArrowIconProps {
  className?: string;
}

export const ArrowRight: React.FC<ArrowIconProps> = ({ className = '' }) => (
  <span
    aria-hidden="true"
    className={`block h-[0.8em] w-[0.8em] bg-current ${className}`}
    style={{
      maskImage: 'url(/images/ui/arrow/arrow_right.svg)',
      WebkitMaskImage: 'url(/images/ui/arrow/arrow_right.svg)',
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
    }}
  />
);

// --- Switch Icon ---
interface SwitchIconProps {
  checked: boolean;
  className?: string;
}

export const SwitchIcon: React.FC<SwitchIconProps> = ({ checked, className = '' }) => (
  checked ? (
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 14 7"
      className={`h-[0.55em] w-auto block ${className}`}
    >
      <path d="M0,0 L7,0 L7,7 L0,7 L0,6 L-6,6 L-6,5 L0,5 L0,2 L-6,2 L-6,1 L0,1 Z M3,1 L3,6 L4,6 L4,1 Z" transform="translate(7,0)" fill="currentColor" />
      <path d="M0,0 L1,0 L1,3 L0,3 Z" transform="translate(0,2)" fill="currentColor" />
    </svg>
  ) : (
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 14 7"
      className={`h-[0.55em] w-auto block ${className}`}
    >
      <path d="M0,0 L5,0 L5,1 L12,1 L12,2 L5,2 L5,3 L12,3 L12,4 L5,4 L5,5 L0,5 Z M1,1 L1,4 L4,4 L4,1 Z" transform="translate(1,1)" fill="currentColor" />
      <path d="M0,0 L1,0 L1,1 L0,1 Z" transform="translate(13,3)" fill="currentColor" />
      <path d="M0,0 L1,0 L1,1 L0,1 Z" transform="translate(3,3)" fill="currentColor" />
    </svg>
  )
);

// --- Music Note Icon ---
interface MusicNoteIconProps {
  className?: string;
}

/**
 * Music note from `public/images/ui/misc/music_note.svg`, used by the "now playing" card.
 *
 * The file paints its own path white, so it is applied as a CSS mask and filled with
 * `currentColor` instead of being embedded with `<img>`: that keeps it following the accent
 * tone of whatever renders it, exactly like the inline icons above.
 */
export const MusicNote: React.FC<MusicNoteIconProps> = ({ className = '' }) => (
  <span
    aria-hidden="true"
    className={`block h-[0.9em] w-[0.9em] bg-current ${className}`}
    style={{
      maskImage: 'url(/images/ui/misc/music_note.svg)',
      WebkitMaskImage: 'url(/images/ui/misc/music_note.svg)',
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
    }}
  />
);

// --- Folder Icon ---
interface FolderIconProps {
  className?: string;
}

/**
 * Folder from `public/images/ui/misc/folder.svg`, used by the Settings header to open the
 * folder that stores `settings.json`.
 *
 * Like {@link MusicNote}, the file paints its own path white, so it is applied as a CSS mask
 * and filled with `currentColor` instead of being embedded with `<img>`: that keeps it
 * following the accent tone of whatever renders it.
 *
 * The default size is deliberately small and relative (`em`), so the icon scales with the text
 * it sits next to while staying a quiet accent rather than a second focal point. Pass a
 * `h-*`/`w-*` class to resize it for other uses.
 */
export const FolderIcon: React.FC<FolderIconProps> = ({ className = '' }) => (
  <span
    aria-hidden="true"
    className={`block h-[0.4em] w-[0.4em] bg-current ${className}`}
    style={{
      maskImage: 'url(/images/ui/misc/folder.svg)',
      WebkitMaskImage: 'url(/images/ui/misc/folder.svg)',
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
    }}
  />
);

// --- Save-slot action icons ---
interface SaveActionIconProps {
  className?: string;
}

const SaveActionIcon: React.FC<SaveActionIconProps & { file: string }> = ({ file, className = '' }) => (
  <span
    aria-hidden="true"
    className={`block h-[1em] w-[1em] bg-current ${className}`}
    style={{
      maskImage: `url(/images/ui/misc/${file}.svg)`,
      WebkitMaskImage: `url(/images/ui/misc/${file}.svg)`,
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
    }}
  />
);

export const AddIcon: React.FC<SaveActionIconProps> = ({ className = '' }) => <SaveActionIcon file="add" className={className} />;
export const EditIcon: React.FC<SaveActionIconProps> = ({ className = '' }) => <SaveActionIcon file="edit" className={className} />;
export const RemoveIcon: React.FC<SaveActionIconProps> = ({ className = '' }) => <SaveActionIcon file="remove" className={className} />;
export const TrashIcon: React.FC<SaveActionIconProps> = ({ className = '' }) => <SaveActionIcon file="trash" className={className} />;
export const CloseIcon: React.FC<SaveActionIconProps> = ({ className = '' }) => <SaveActionIcon file="close" className={className} />;

// --- Element Icon ---
interface ElementIconProps {
  id: string;
  className?: string;
}

export const ElementIcon: React.FC<ElementIconProps> = ({ id, className = '' }) => (
  <CommonImage
    src={`/images/elements/${id}.png`}
    alt={id}
    fallbackSrc="/images/elements/unknown.png"
    className={`object-contain ${className}`}
  />
);

// --- Loading Component ---
interface LoadingProps {
  images?: [string, string, string, string];
  interval?: number;
  loadingText?: string;
  subtext?: string;
  containerClassName?: string;
  textClassName?: string;
  imageClassName?: string;
  subtextClassName?: string;
}

export const Loading: React.FC<LoadingProps> = ({
  images = [
    '/images/ui/loading/loading_0.svg',
    '/images/ui/loading/loading_1.svg',
    '/images/ui/loading/loading_2.svg',
    '/images/ui/loading/loading_3.svg',
  ],
  interval = 500,
  loadingText,
  subtext,
  containerClassName = '',
  textClassName = '',
  imageClassName = '',
  subtextClassName = '',
}) => {
  const { t } = useTranslation('common');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, interval);

    return () => clearInterval(timer);
  }, [images.length, interval]);

  const displayText = loadingText ? t(loadingText) : null;
  const altText = t('loading.alt');

  return (
    <div
      className={`flex flex-col items-center justify-center select-none ${containerClassName}`}
    >
      <div className="flex items-center justify-center">
        <CommonImage
          src={images[currentIndex]}
          alt={altText}
          className={`h-12 w-auto transition-all duration-75 ${imageClassName}`}
        />
      </div>

      {displayText && (
        <h1 className={`font-pixel text-xl animate-pulse ${textClassName}`}>
          {displayText}
        </h1>
      )}

      {subtext && (
        <div className={`mt-4 text-lg text-center max-w-md px-4 ${subtextClassName}`}>
          {subtext}
        </div>
      )}
    </div>
  );
};
