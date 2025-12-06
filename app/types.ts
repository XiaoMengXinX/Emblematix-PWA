export interface ExifData {
  manufacturer?: string;
  model?: string;
  fNumber?: string;
  shutterSpeed?: string;
  focalLength?: string;
  iso?: string;
  dateTime?: string;
  copyright?: string;
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
}