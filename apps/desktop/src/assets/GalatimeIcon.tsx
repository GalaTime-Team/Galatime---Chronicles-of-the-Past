import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CommonImage from '../components/common/CommonImage';

// Checked-in UI glyphs, hashed by Vite at build time (or inlined as data URIs when small).
import arrowRightUrl from './images/ui/arrow/arrow_right.svg';
import arrowUpUrl from './images/ui/arrow/arrow_up.svg';
import arrowDownUrl from './images/ui/arrow/arrow_down.svg';
import musicNoteUrl from './images/ui/misc/music_note.svg';
import folderUrl from './images/ui/misc/folder.svg';
import unknownUrl from './images/ui/misc/unknown.svg';
import addUrl from './images/ui/misc/add.svg';
import closeUrl from './images/ui/misc/close.svg';
import controlUrl from './images/ui/misc/control.svg';
import editUrl from './images/ui/misc/edit.svg';
import fitUrl from './images/ui/misc/fit.svg';
import removeUrl from './images/ui/misc/remove.svg';
import selectorUrl from './images/ui/misc/selector.svg';
import trashUrl from './images/ui/misc/trash.svg';
import defendUrl from './images/elements/extra/defend.svg';
import restUrl from './images/elements/extra/rest.svg';
import weaponUrl from './images/elements/extra/weapon.svg';
import inventoryUrl from './images/elements/extra/inventory.svg';
import changeUrl from './images/elements/extra/change.svg';
import loading0Url from './images/ui/loading/loading_0.svg';
import loading1Url from './images/ui/loading/loading_1.svg';
import loading2Url from './images/ui/loading/loading_2.svg';
import loading3Url from './images/ui/loading/loading_3.svg';

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

// --- Mask Icon (shared glyph renderer) ---
interface MaskIconProps {
  className?: string;
  /** Size box classes, so an icon can default to a size relative to the text it sits in. */
  sizeClass?: string;
}

/**
 * Renders one of the SVGs imported above as a CSS mask, filled with `currentColor` so it
 * follows the tone of whatever renders it.
 *
 * The `src` is the Vite-resolved URL of an imported `.svg`, so production builds get hashed
 * filenames (or an inlined data URI) while a dev server keeps a dev URL — either way the icon
 * cannot drift from the module graph the way a hand-typed `public/` path could.
 *
 * Like {@link ArrowRight}'s old glyph, icons are sized in `em` by default (the `em`-based size
 * classes beat a plain `text-*` font-size; pass `h-*`/`w-*` classes to force concrete sizes).
 */
const MaskIcon: React.FC<MaskIconProps & { src: string }> = ({ src, sizeClass = 'h-[1em] w-[1em]', className = '' }) => (
  <span
    aria-hidden="true"
    className={`block ${sizeClass} bg-current ${className}`}
    style={{
      maskImage: `url(${src})`,
      WebkitMaskImage: `url(${src})`,
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
    }}
  />
);

// --- Arrow Icons ---
interface ArrowIconProps {
  className?: string;
}

/**
 * One arrow from `src/assets/images/ui/arrow/`, applied as a CSS mask and filled with
 * `currentColor` so it follows the tone of whatever renders it.
 *
 * It is sized in `em`, so the font-size of the surrounding text decides how big it is — pass a
 * `text-*` class to the wrapper rather than a `h-*`/`w-*` one (an arbitrary `[0.8em]` height
 * beats a plain Tailwind size, the same trap `MaskIcon` documents).
 */
export const ArrowRight: React.FC<ArrowIconProps> = ({ className = '' }) => <MaskIcon src={arrowRightUrl} sizeClass="h-[0.8em] w-[0.8em]" className={className} />;

/** Used to mark a statistic a status effect has raised. */
export const ArrowUp: React.FC<ArrowIconProps> = ({ className = '' }) => <MaskIcon src={arrowUpUrl} sizeClass="h-[0.8em] w-[0.8em]" className={className} />;

/** Used to mark a statistic a status effect has lowered. */
export const ArrowDown: React.FC<ArrowIconProps> = ({ className = '' }) => <MaskIcon src={arrowDownUrl} sizeClass="h-[0.8em] w-[0.8em]" className={className} />;

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
 * Music note from `src/assets/images/ui/misc/music_note.svg`, used by the "now playing" card.
 *
 * The file paints its own path white, so it is applied as a CSS mask by {@link MaskIcon} and
 * filled with `currentColor` instead of being embedded with `<img>`: that keeps it following the
 * accent tone of whatever renders it.
 */
export const MusicNote: React.FC<MusicNoteIconProps> = ({ className = '' }) => (
  <MaskIcon src={musicNoteUrl} sizeClass="h-[0.9em] w-[0.9em]" className={className} />
);

// --- Folder Icon ---
interface FolderIconProps {
  className?: string;
}

/**
 * Folder from `src/assets/images/ui/misc/folder.svg`, used by the Settings header to open the
 * folder that stores `settings.json`.
 *
 * Like {@link MusicNote}, the file paints its own path white, so {@link MaskIcon} applies it as
 * a CSS mask filled with `currentColor` instead of embedding it with `<img>`: that keeps it
 * following the accent tone of whatever renders it.
 *
 * The default size is deliberately small and relative (`em`), so the icon scales with the text
 * it sits next to while staying a quiet accent rather than a second focal point. Pass a
 * `h-*`/`w-*` class to resize it for other uses.
 */
export const FolderIcon: React.FC<FolderIconProps> = ({ className = '' }) => (
  <MaskIcon src={folderUrl} sizeClass="h-[0.4em] w-[0.4em]" className={className} />
);

// --- Unknown Icon ---
interface UnknownIconProps {
  className?: string;
}

/**
 * Question mark from `src/assets/images/ui/misc/unknown.svg`, shown wherever an entity has no
 * sprite of its own.
 *
 * Like {@link MusicNote}, the file paints its own path white, so {@link MaskIcon} applies it as
 * a CSS mask filled with `currentColor` instead of embedding it with `<img>`: that keeps it
 * following the tone of whatever renders it. Pass a `h-*`/`w-*` class to size it.
 */
export const UnknownIcon: React.FC<UnknownIconProps> = ({ className = '' }) => (
  <MaskIcon src={unknownUrl} className={className} />
);

// --- Misc UI icons (imported from src/assets/images/ui/misc) ---
interface MiscIconProps {
  className?: string;
}

export const AddIcon: React.FC<MiscIconProps> = ({ className = '' }) => <MaskIcon src={addUrl} className={className} />;
export const ControlIcon: React.FC<MiscIconProps> = ({ className = '' }) => <MaskIcon src={controlUrl} className={className} />;
export const EditIcon: React.FC<MiscIconProps> = ({ className = '' }) => <MaskIcon src={editUrl} className={className} />;
export const RemoveIcon: React.FC<MiscIconProps> = ({ className = '' }) => <MaskIcon src={removeUrl} className={className} />;
export const TrashIcon: React.FC<MiscIconProps> = ({ className = '' }) => <MaskIcon src={trashUrl} className={className} />;
export const CloseIcon: React.FC<MiscIconProps> = ({ className = '' }) => <MaskIcon src={closeUrl} className={className} />;
export const FitIcon: React.FC<MiscIconProps> = ({ className = '' }) => <MaskIcon src={fitUrl} className={className} />;
export const SelectorIcon: React.FC<MiscIconProps> = ({ className = '' }) => <MaskIcon src={selectorUrl} className={className} />;

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

// --- Combat Extra Movement Icons ---
interface CombatIconProps {
  className?: string;
}

export const DefendIcon: React.FC<CombatIconProps> = ({ className = '' }) => <MaskIcon src={defendUrl} className={className} />;
export const RestIcon: React.FC<CombatIconProps> = ({ className = '' }) => <MaskIcon src={restUrl} className={className} />;
export const WeaponIcon: React.FC<CombatIconProps> = ({ className = '' }) => <MaskIcon src={weaponUrl} className={className} />;
export const InventoryIcon: React.FC<CombatIconProps> = ({ className = '' }) => <MaskIcon src={inventoryUrl} className={className} />;
export const ChangeIcon: React.FC<CombatIconProps> = ({ className = '' }) => <MaskIcon src={changeUrl} className={className} />;

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

const DEFAULT_LOADING_IMAGES: [string, string, string, string] = [
  loading0Url,
  loading1Url,
  loading2Url,
  loading3Url,
];

export const Loading: React.FC<LoadingProps> = ({
  images = DEFAULT_LOADING_IMAGES,
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
