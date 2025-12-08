export interface ExifData {
  manufacturer?: string;
  model?: string;
  fNumber?: string;
  shutterSpeed?: string;
  focalLength?: string;
  focalLengthIn35mm?: string;
  iso?: string;
  dateTime?: string;
  copyright?: string;
  isHDR?: boolean; // HDR indicator
}

export interface EditableMetadata {
  manufacturer: string;
  model: string;
  fNumber: string;
  shutterSpeed: string;
  focalLength: string;
  iso: string;
  dateTime: string;
}

// HDR Gain Map Metadata
export interface GainMapMetadata {
  gainMapMin: [number, number, number];
  gainMapMax: [number, number, number];
  gamma: [number, number, number];
  offsetSdr: [number, number, number];
  offsetHdr: [number, number, number];
  hdrCapacityMin: number;
  hdrCapacityMax: number;
}

// HDR Data extracted from image
export interface HDRData {
  hasGainMap: boolean;
  metadata?: GainMapMetadata;
  gainMapData?: Uint8Array;
  sdrImageData?: Uint8Array; // Original SDR image data from gain map extraction
  iccProfile?: Uint8Array; // ICC color profile
  width?: number;
  height?: number;
}

export interface AppConfig {
  showManufacturer: boolean;
  showModel: boolean;
  showFNumber: boolean;
  showShutterSpeed: boolean;
  showFocalLength: boolean;
  showISO: boolean;
  showDateTime: boolean;
  showCopyright: boolean;
  watermarkType: "normal" | "compact";
  randomization: "randomize" | "static";
  alterBrightness: "dim" | "brighten";
  location: string;
  customCopyright: string;
  exportFormat: "jpeg" | "png" | "webp";
  font: string;
  fontWeight: string;
  useCustomCopyright: boolean; // Track if using custom or EXIF copyright
  useCustomLocation: boolean; // Track if using custom or EXIF GPS location
  enableHDR: boolean; // Experimental HDR support toggle
  colorSpace: "srgb" | "display-p3"; // Experimental Color Space support
}