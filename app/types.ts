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
}