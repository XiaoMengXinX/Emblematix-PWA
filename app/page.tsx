"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload,
  Download,
  Settings,
  Image as ImageIcon,
  Check,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import ExifReader from "exifreader";
import { ExifData, AppConfig, EditableMetadata } from "./types";
import { saveFont, getFonts, deleteFont } from "./db";
import clsx from "clsx";
import { Inter, Roboto, Playfair_Display, Space_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });
const roboto = Roboto({ weight: ['400', '700'], subsets: ['latin'] });
const playfair = Playfair_Display({ subsets: ['latin'] });
const spaceMono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'] });

const fonts = {
  inter: { name: 'Inter', className: inter.className, style: inter.style.fontFamily },
  roboto: { name: 'Roboto', className: roboto.className, style: roboto.style.fontFamily },
  googleSans: { name: 'Google Sans', className: '', style: '"Google Sans", "Product Sans", sans-serif' },
  playfair: { name: 'Playfair Display', className: playfair.className, style: playfair.style.fontFamily },
  spaceMono: { name: 'Space Mono', className: spaceMono.className, style: spaceMono.style.fontFamily },

};

const defaultConfig: AppConfig = {
  showManufacturer: true,
  showModel: true,
  showFNumber: true,
  showShutterSpeed: true,
  showFocalLength: true,
  showISO: true,
  showDateTime: true,
  showCopyright: true,
  watermarkType: "normal",
  randomization: "randomize",
  alterBrightness: "brighten",
  location: "",
  customCopyright: "",
  exportFormat: "jpeg",
  font: "inter",
  fontWeight: "400",
  useCustomCopyright: false, // Default to using EXIF copyright
  useCustomLocation: false, // Default to using EXIF GPS location
  enableHDR: false, // Experimental HDR support (disabled by default)
  colorSpace: "srgb", // Experimental Color Space support (default: srgb)
};

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [exifData, setExifData] = useState<ExifData>({});
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [mounted, setMounted] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [localLocation, setLocalLocation] = useState(config.location);
  const [localCustomCopyright, setLocalCustomCopyright] = useState(
    config.customCopyright
  );
  const [isProcessing, setIsProcessing] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [customFonts, setCustomFonts] = useState<{ name: string, style: string }[]>([]);
  const [isFontSettingsOpen, setIsFontSettingsOpen] = useState(false);
  const [isMetadataSettingsOpen, setIsMetadataSettingsOpen] = useState(false);
  const [isExperimentalSettingsOpen, setIsExperimentalSettingsOpen] = useState(false);

  // Editable metadata state (session-only, not persisted)
  const [editableMetadata, setEditableMetadata] = useState<EditableMetadata>({
    manufacturer: "",
    model: "",
    fNumber: "",
    shutterSpeed: "",
    focalLength: "",
    iso: "",
    dateTime: "",
  });

  // Local metadata state for apply mechanism (similar to localLocation/localCustomCopyright)
  const [localEditableMetadata, setLocalEditableMetadata] = useState<EditableMetadata>({
    manufacturer: "",
    model: "",
    fNumber: "",
    shutterSpeed: "",
    focalLength: "",
    iso: "",
    dateTime: "",
  });

  // Track EXIF copyright separately (not persisted to localStorage)
  const [exifCopyright, setExifCopyright] = useState<string>("");

  // Track EXIF GPS location separately (not persisted to localStorage)
  const [exifLocation, setExifLocation] = useState<string>("");

  // Track previous EXIF manufacturer/model for smart persistence
  const [prevManufacturerModel, setPrevManufacturerModel] = useState<{ manufacturer?: string, model?: string }>({});

  // HDR state management
  const [hdrData, setHDRData] = useState<import('@/app/types').HDRData>({ hasGainMap: false });
  const [imgFile, setImgFile] = useState<File | null>(null);

  const handleReset = () => {
    setConfig(defaultConfig);
    localStorage.removeItem("emblematix_config");

    // If we have EXIF data from current image, restore metadata from it
    // Otherwise, clear to empty
    if (exifData && Object.values(exifData).some(v => v)) {
      setEditableMetadata({
        manufacturer: exifData.manufacturer || "",
        model: exifData.model || "",
        fNumber: exifData.fNumber || "",
        shutterSpeed: exifData.shutterSpeed || "",
        focalLength: exifData.focalLength || "",
        iso: exifData.iso || "",
        dateTime: exifData.dateTime || "",
      });
      setLocalEditableMetadata({
        manufacturer: exifData.manufacturer || "",
        model: exifData.model || "",
        fNumber: exifData.fNumber || "",
        shutterSpeed: exifData.shutterSpeed || "",
        focalLength: exifData.focalLength || "",
        iso: exifData.iso || "",
        dateTime: exifData.dateTime || "",
      });
    } else {
      // No EXIF data, clear to empty
      const emptyMetadata: EditableMetadata = {
        manufacturer: "",
        model: "",
        fNumber: "",
        shutterSpeed: "",
        focalLength: "",
        iso: "",
        dateTime: "",
      };
      setEditableMetadata(emptyMetadata);
      setLocalEditableMetadata(emptyMetadata);
    }

    // Reset to EXIF mode for Copyright and Location
    setLocalCustomCopyright(exifCopyright);
    setLocalLocation(exifLocation);

    // Show success toast
    toast.success("Configuration reset to default");
  };

  // Helper function to convert GPS coordinates to DMS format
  const convertToDMS = (lat: number, lon: number): string => {
    const formatCoordinate = (value: number, isLatitude: boolean): string => {
      const absolute = Math.abs(value);
      const degrees = Math.floor(absolute);
      const minutesDecimal = (absolute - degrees) * 60;
      const minutes = Math.floor(minutesDecimal);
      const seconds = Math.round((minutesDecimal - minutes) * 60);

      let direction: string;
      if (isLatitude) {
        direction = value >= 0 ? 'N' : 'S';
      } else {
        direction = value >= 0 ? 'E' : 'W';
      }

      return `${degrees}°${minutes}'${seconds}"${direction}`;
    };

    return `${formatCoordinate(lat, true)} ${formatCoordinate(lon, false)}`;
  };

  useEffect(() => {
    if (localLocation !== config.location) {
      setLocalLocation(config.location);
    }
    if (localCustomCopyright !== config.customCopyright) {
      setLocalCustomCopyright(config.customCopyright);
    }
  }, [config.location, config.customCopyright]);

  // Sync localEditableMetadata with editableMetadata when it changes
  useEffect(() => {
    setLocalEditableMetadata(editableMetadata);
  }, [editableMetadata]);

  useEffect(() => {
    setMounted(true);

    // Check for Safari browser
    const userAgent = navigator.userAgent;
    const isSafariBrowser =
      userAgent.includes("Safari") &&
      !userAgent.includes("Chrome") &&
      !userAgent.includes("Chromium");
    setIsSafari(isSafariBrowser);

    const savedConfig = localStorage.getItem("emblematix_config");
    if (savedConfig) {
      try {
        const parsedConfig = JSON.parse(savedConfig);
        // If on Safari and saved format is webp, reset to jpeg
        if (isSafariBrowser && parsedConfig.exportFormat === "webp") {
          parsedConfig.exportFormat = "jpeg";
        }
        // If on Safari and saved color space is display-p3, reset to srgb
        if (isSafariBrowser && parsedConfig.colorSpace === "display-p3") {
          parsedConfig.colorSpace = "srgb";
        }
        setConfig((prev) => ({ ...prev, ...parsedConfig }));
      } catch (e) {
        console.error("Failed to parse saved config", e);
      }
    }
  }, []);

  // Save config to localStorage whenever it changes
  useEffect(() => {
    if (mounted) {
      // Only save customCopyright if user is using custom mode
      // Only save location if user is using custom mode
      const configToSave = { ...config };
      if (!config.useCustomCopyright) {
        // Don't persist EXIF copyright to localStorage
        configToSave.customCopyright = "";
      }
      if (!config.useCustomLocation) {
        // Don't persist EXIF GPS location to localStorage
        configToSave.location = "";
      }
      localStorage.setItem("emblematix_config", JSON.stringify(configToSave));
    }
  }, [config, mounted]);

  useEffect(() => {
    // Load persisted fonts
    const loadFonts = async () => {
      try {
        const storedFonts = await getFonts();
        for (const fontData of storedFonts) {
          const fontFace = new FontFace(fontData.name, fontData.buffer);
          await fontFace.load();
          document.fonts.add(fontFace);
          setCustomFonts(prev => {
            if (prev.some(f => f.name === fontData.name)) return prev;
            return [...prev, { name: fontData.name, style: fontData.name }];
          });
        }
      } catch (error) {
        console.error("Failed to load persisted fonts:", error);
      }
    };
    loadFonts();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;

    let isCancelled = false;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true, colorSpace: config.colorSpace });
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = image;
    img.onload = () => {
      if (isCancelled) return;
      setIsProcessing(true);
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Prepare text
      // Use editable metadata (which may contain user edits or EXIF data)
      const deviceText = [
        config.showManufacturer && editableMetadata.manufacturer,
        config.showModel && editableMetadata.model,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const photoInfoText = [
        config.showFNumber && editableMetadata.fNumber && (editableMetadata.fNumber.toLowerCase().startsWith('f') ? editableMetadata.fNumber : `f/${editableMetadata.fNumber}`),
        config.showShutterSpeed && editableMetadata.shutterSpeed && `${editableMetadata.shutterSpeed}`,
        config.showFocalLength && editableMetadata.focalLength && (editableMetadata.focalLength.endsWith('mm') ? editableMetadata.focalLength : `${editableMetadata.focalLength}mm`),
        config.showISO && editableMetadata.iso && `ISO${editableMetadata.iso}`,
      ]
        .filter(Boolean)
        .join(" • ");

      // Logic from Android getCopyRight()
      let copyrightString = "";
      let timeString = "";

      if (editableMetadata.dateTime) {
        // Android format: yyyy|MM/dd HH:mm:ss
        // ExifReader usually returns "yyyy:MM:dd HH:mm:ss"
        const parts = editableMetadata.dateTime.split(" ");
        if (parts.length >= 2) {
          const dateParts = parts[0].split(":");
          const timePart = parts[1];

          if (dateParts.length === 3) {
            const year = dateParts[0];
            const month = dateParts[1];
            const day = dateParts[2];

            if (config.showDateTime) {
              // Android: MM/dd HH:mm:ss
              timeString = `${month}/${day} ${timePart}  `;
            }

            if (config.showCopyright) {
              // Use custom copyright if in Custom mode, otherwise use EXIF
              // In Custom mode, even empty string should be used (not fall back to EXIF)
              const author = config.useCustomCopyright
                ? config.customCopyright
                : (config.customCopyright || exifData.copyright || "");
              if (author !== "") {
                // Android: Image © yyyy Author.
                copyrightString = `Image © ${year} ${author}.`;
              }
            }
          }
        }
      } else if (config.showCopyright) {
        // Use custom copyright if in Custom mode, otherwise use EXIF
        const author = config.useCustomCopyright
          ? config.customCopyright
          : (config.customCopyright || exifData.copyright || "");
        if (author !== "") {
          copyrightString = `Image © ${author}.`;
        }
      }

      const copyRightText = `${timeString}${copyrightString}`.trim();

      const lines =
        config.watermarkType === "normal"
          ? [`${deviceText}  ${photoInfoText}`.trim(), `${config.location}  ${copyRightText}`.trim()]
          : [config.location, `${deviceText}  ${photoInfoText}  ${copyRightText}`.trim()];

      // Configure font
      const fontSize = Math.min(canvas.width, canvas.height) * (config.watermarkType === "normal" ? 0.03 : 0.02);
      // Use selected font
      let selectedFont = fonts[config.font as keyof typeof fonts];
      if (!selectedFont) {
        // Check custom fonts
        const custom = customFonts.find(f => f.name === config.font);
        if (custom) {
          selectedFont = { ...custom, className: "" };
        } else {
          selectedFont = fonts.inter;
        }
      }
      ctx.font = `${config.fontWeight} ${fontSize}px ${selectedFont.style}`;

      // Calculate positions
      // Android:
      // Normal: startHeight = bitmap.height * 0.9f
      // Compact: startHeight = bitmap.height - (paint.descent() - paint.ascent()) * 2

      // Estimate ascent/descent ratio for standard fonts
      // ascent is usually around 0.8 * fontSize, descent around 0.2 * fontSize
      // line height (descent - ascent) is roughly fontSize * 1.2 (since ascent is negative in Android paint, but here we just use fontSize)
      // We'll use fontSize * 1.2 as the line height approximation
      const lineHeight = fontSize * 1.2;

      let startY = 0;
      if (config.watermarkType === "normal") {
        startY = canvas.height * 0.9;
      } else {
        startY = canvas.height - (lineHeight * 2);
      }

      const drawText = (context: CanvasRenderingContext2D, color?: string) => {
        if (color) context.fillStyle = color;

        let currentY = startY;

        if (config.watermarkType === "normal") {
          context.textAlign = "center";
          const startX = canvas.width / 2;
          lines.forEach((line) => {
            context.fillText(line, startX, currentY);
            currentY += lineHeight;
          });
        } else {
          context.textAlign = "left";
          const startX = canvas.width * 0.01; // Android uses 0.01f
          lines.forEach((line) => {
            context.fillText(line, startX, currentY);
            currentY += lineHeight;
          });
        }
      };

      if (config.randomization === "static") {
        // Android: Dim = Color.argb(80, 0, 0, 0), Brighten = Color.argb(80, 255, 255, 255)
        // 80/255 ~= 0.31
        const color = config.alterBrightness === "dim" ? "rgba(0, 0, 0, 0.31)" : "rgba(255, 255, 255, 0.31)";
        drawText(ctx, color);
      } else {
        // Randomize logic (Pixel manipulation)
        // First draw text on a temporary canvas to get the mask
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true, colorSpace: config.colorSpace });
        if (!tempCtx) return;

        let selectedFont = fonts[config.font as keyof typeof fonts];
        if (!selectedFont) {
          const custom = customFonts.find(f => f.name === config.font);
          if (custom) {
            selectedFont = { ...custom, className: "" };
          } else {
            selectedFont = fonts.inter;
          }
        }
        tempCtx.font = `${config.fontWeight} ${fontSize}px ${selectedFont.style}`;

        // Draw black text for mask

        tempCtx.fillStyle = "black";
        let currentY = startY;
        if (config.watermarkType === "normal") {
          tempCtx.textAlign = "center";
          const startX = canvas.width / 2;
          lines.forEach((line) => {
            tempCtx.fillText(line, startX, currentY);
            currentY += lineHeight;
          });
        } else {
          tempCtx.textAlign = "left";
          const startX = canvas.width * 0.01;
          lines.forEach((line) => {
            tempCtx.fillText(line, startX, currentY);
            currentY += lineHeight;
          });
        }

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const maskData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const mask = maskData.data;

        // Apply randomization
        for (let i = 0; i < data.length; i += 4) {
          // Check if mask has pixel (alpha > 0)
          if (mask[i + 3] > 0) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Calculate relative luminance using sRGB to linear RGB conversion
            // This matches Android's Color.luminance implementation
            const toLinear = (c: number) => {
              const normalized = c / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : Math.pow((normalized + 0.055) / 1.055, 2.4);
            };

            const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

            let gain = 0;
            if (luminance > 0.5) {
              // Darken: limit gain to avoid going below 0
              const maxDarken = Math.min(r, g, b, 100);
              gain = -Math.floor(Math.random() * (maxDarken + 1));
            } else {
              // Brighten: limit gain to avoid going above 255
              const maxBrighten = Math.min(255 - r, 255 - g, 255 - b, 100);
              gain = Math.floor(Math.random() * (maxBrighten + 1));
            }

            data[i] = r + gain;
            data[i + 1] = g + gain;
            data[i + 2] = b + gain;
          }
        }

        ctx.putImageData(imageData, 0, 0);
      }

      // Generate preview
      // If HDR is enabled and we have gain map, generate HDR preview using WASM
      // Otherwise generate standard SDR preview
      const generatePreview = async () => {
        if (config.enableHDR && hdrData.hasGainMap && hdrData.gainMapData && hdrData.metadata && hdrData.sdrImageData) {
          try {
            const { encodeHDRJPEG, insertICCProfile } = await import('@/lib/hdr-utils');

            // Get watermarked SDR data
            const sdrBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
            if (!sdrBlob) throw new Error("Failed to generate SDR blob");

            const sdrBuffer = await sdrBlob.arrayBuffer() as ArrayBuffer;
            let sdrData: Uint8Array = new Uint8Array(sdrBuffer);

            // Inject ICC profile if P3
            if (config.colorSpace === 'display-p3' && hdrData.iccProfile) {
              sdrData = insertICCProfile(sdrData, hdrData.iccProfile);
            }

            // Encode HDR
            const hdrJpeg = await encodeHDRJPEG(
              sdrData,
              hdrData.gainMapData,
              hdrData.metadata,
              config.colorSpace === 'display-p3' ? hdrData.iccProfile : undefined,
              true
            );

            if (hdrJpeg && !isCancelled) {
              const blob = new Blob([hdrJpeg as BlobPart], { type: 'image/jpeg' });
              const url = URL.createObjectURL(blob);
              setProcessedImage((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return url;
              });
              setIsProcessing(false);
              return;
            }
          } catch (e) {
            console.error("HDR Preview generation failed:", e);
            // Fallback to SDR
          }
        }

        // Standard SDR Preview
        canvas.toBlob((blob) => {
          if (isCancelled) return;
          if (blob) {
            const url = URL.createObjectURL(blob);
            setProcessedImage((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return url;
            });
            setIsProcessing(false);
          } else {
            setIsProcessing(false);
          }
        }, "image/jpeg", 0.5);
      };

      generatePreview();
    };

    return () => {
      isCancelled = true;
    };
  }, [image, exifData, config, customFonts, editableMetadata, hdrData]);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setImgFile(file);
    let imageUrl = "";

    // Check if file is HEIC/HEIF
    const isHeic = file.type === "image/heic" ||
      file.type === "image/heif" ||
      file.name.toLowerCase().endsWith(".heic") ||
      file.name.toLowerCase().endsWith(".heif") ||
      file.name.toLowerCase().endsWith(".hif");

    if (isHeic) {
      setIsProcessing(true);
      try {
        // Try native support first. If this succeeds, the browser (e.g. Safari) supports HEIC natively.
        const bitmap = await createImageBitmap(file);
        bitmap.close();
        imageUrl = URL.createObjectURL(file);
      } catch (e) {
        console.error("Native HEIC support check failed:", e);
        toast.error("This browser does not support HEIC/HIF images natively.");
        setIsProcessing(false);
        return;
      }
    } else {
      imageUrl = URL.createObjectURL(file);
    }

    setImage((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return imageUrl;
    });
    setIsProcessing(false);

    try {
      const tags = await ExifReader.load(file);

      // Process Focal Length
      let focalLength = tags["FocalLengthIn35mmFilm"]?.description;
      if (!focalLength) {
        const fl = tags["FocalLength"]?.description;
        if (fl) {
          const parts = fl.split('/');
          if (parts.length === 2) {
            const val = parseFloat(parts[0]) / parseFloat(parts[1]);
            const s = val.toString();
            const dotIndex = s.indexOf('.');
            if (dotIndex !== -1) {
              focalLength = s.substring(0, Math.min(s.length, dotIndex + 3));
              if (focalLength.endsWith('.')) {
                focalLength = focalLength.slice(0, -1);
              }
            } else {
              focalLength = s;
            }
          } else {
            focalLength = fl;
          }
        }
      }

      // Process Shutter Speed
      let shutterSpeed = tags["ExposureTime"]?.description;
      if (shutterSpeed) {
        const val = parseFloat(shutterSpeed);
        if (val < 1 && val > 0) {
          shutterSpeed = `1/${Math.round(1 / val)}`;
        }
      }

      const newExifData: ExifData = {
        manufacturer: tags["Make"]?.description,
        model: tags["Model"]?.description,
        fNumber: tags["FNumber"]?.description,
        shutterSpeed: shutterSpeed,
        focalLength: focalLength,
        iso: tags["ISOSpeedRatings"]?.description?.toString(), // Ensure string
        dateTime: tags["DateTimeOriginal"]?.description,
        copyright: tags["Copyright"]?.description,
      };

      // Check if we have enough data
      const hasData = Object.values(newExifData).some(val => val !== undefined && val !== "" && val !== null);
      if (!hasData) {
        toast.error("No EXIF data found in this image. Watermark info will be empty.");
      }

      setExifData(newExifData);

      // Populate editable metadata from EXIF data
      // Smart persistence: keep custom manufacturer/model if EXIF matches previous image
      const shouldKeepManufacturer =
        prevManufacturerModel.manufacturer === newExifData.manufacturer &&
        editableMetadata.manufacturer !== "";
      const shouldKeepModel =
        prevManufacturerModel.model === newExifData.model &&
        editableMetadata.model !== "";

      setEditableMetadata({
        manufacturer: shouldKeepManufacturer ? editableMetadata.manufacturer : (newExifData.manufacturer || ""),
        model: shouldKeepModel ? editableMetadata.model : (newExifData.model || ""),
        fNumber: newExifData.fNumber || "",
        shutterSpeed: shutterSpeed || "",
        focalLength: focalLength || "",
        iso: newExifData.iso || "",
        dateTime: newExifData.dateTime || "",
      });

      // Update previous manufacturer/model for next comparison
      setPrevManufacturerModel({
        manufacturer: newExifData.manufacturer,
        model: newExifData.model,
      });

      // Handle EXIF copyright
      const copyrightFromExif = newExifData.copyright || "";
      setExifCopyright(copyrightFromExif);

      // If not using custom copyright, populate with EXIF copyright
      if (!config.useCustomCopyright) {
        setConfig(prev => ({ ...prev, customCopyright: copyrightFromExif }));
        setLocalCustomCopyright(copyrightFromExif);
      }

      // Handle EXIF GPS location
      let locationFromExif = "";
      const gpsLat = tags["GPSLatitude"]?.description;
      const gpsLon = tags["GPSLongitude"]?.description;

      if (gpsLat && gpsLon) {
        try {
          // Parse GPS coordinates (they might be in different formats)
          const latValue = parseFloat(gpsLat);
          const lonValue = parseFloat(gpsLon);

          if (!isNaN(latValue) && !isNaN(lonValue)) {
            locationFromExif = convertToDMS(latValue, lonValue);
          }
        } catch (e) {
          console.error("Failed to parse GPS coordinates:", e);
        }
      }

      setExifLocation(locationFromExif);

      // If not using custom location, always update with EXIF GPS location (even if empty)
      // This ensures new images without GPS don't inherit previous image's GPS data
      if (!config.useCustomLocation) {
        setConfig(prev => ({ ...prev, location: locationFromExif }));
        setLocalLocation(locationFromExif);
      }
    } catch (error) {
      console.error("Error reading EXIF data:", error);
      toast.error("Failed to read EXIF data from image.");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      await processFile(file);
    }
  };

  // Effect to re-process HDR data when HDR toggle changes
  useEffect(() => {
    const reprocessHDR = async () => {
      // Only proceed if we have a file loaded
      if (!imgFile) return;

      if (config.enableHDR) {
        try {
          const { extractHDRData } = await import('@/lib/hdr-utils');
          const hdrResult = await extractHDRData(imgFile, true);
          setHDRData(hdrResult);

          if (hdrResult.hasGainMap) {
            toast.success('HDR image detected');
          }
        } catch (error) {
          console.error('HDR detection failed:', error);
          setHDRData({ hasGainMap: false });
        }
      } else {
        // Reset HDR data if HDR is disabled
        setHDRData({ hasGainMap: false });
      }
    };

    reprocessHDR();
  }, [config.enableHDR, imgFile]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Only set isDragging to false if we're actually leaving the drop zone
    // Check if the relatedTarget is not a child of the current target
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    // If mouse is outside the drop zone bounds, set isDragging to false
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const fontName = file.name.split('.')[0];
      const fontFace = new FontFace(fontName, buffer);

      await fontFace.load();
      document.fonts.add(fontFace);


      // Persist font
      await saveFont(fontName, buffer);

      setCustomFonts(prev => [...prev, { name: fontName, style: fontName }]);
      setConfig(prev => ({ ...prev, font: fontName }));
    } catch (error) {
      console.error("Failed to load font:", error);
      alert("Failed to load font file.");
    }
  };

  const handleDeleteFont = async (fontName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteFont(fontName);
      setCustomFonts(prev => prev.filter(f => f.name !== fontName));
      if (config.font === fontName) {
        setConfig(prev => ({ ...prev, font: "inter" }));
      }
    } catch (error) {
      console.error("Failed to delete font:", error);
    }
  };

  const handleDownload = async () => {
    if (!canvasRef.current) return;

    const format = config.exportFormat;

    // Check if we should export as HDR JPEG
    if (config.enableHDR && hdrData.hasGainMap && format === 'jpeg' && hdrData.metadata && hdrData.gainMapData && hdrData.sdrImageData) {
      try {
        const { encodeHDRJPEG } = await import('@/lib/hdr-utils');

        // Encode as HDR JPEG using original SDR image + gain map
        // NOTE: This exports WITHOUT watermark to preserve HDR information
        // Get the processed image data from canvas (Watermarked SDR)
        const watermarkedSdrBlob = await new Promise<Blob | null>((resolve) => {
          canvasRef.current?.toBlob((blob) => resolve(blob), 'image/jpeg', 0.99);
        });

        if (!watermarkedSdrBlob) throw new Error('Failed to generate watermarked image');

        const watermarkedSdrBuffer = await watermarkedSdrBlob.arrayBuffer();
        let watermarkedSdrData: Uint8Array = new Uint8Array(watermarkedSdrBuffer);

        // Inject original ICC profile if available AND we are in P3 mode
        // If sRGB, we do NOT inject to avoid applying P3 profile to sRGB data (fixing color issues)
        if (hdrData.iccProfile && config.colorSpace === 'display-p3') {
          const { insertICCProfile } = await import('@/lib/hdr-utils');
          watermarkedSdrData = insertICCProfile(watermarkedSdrData, hdrData.iccProfile);
        } else {
        }

        // Encode as HDR JPEG using the watermarked SDR
        const hdrJpeg = await encodeHDRJPEG(
          watermarkedSdrData,
          hdrData.gainMapData,
          hdrData.metadata,
          config.colorSpace === 'display-p3' ? hdrData.iccProfile : undefined, // Only pass ICC to encode HDR if P3
          config.enableHDR
        );

        if (hdrJpeg) {
          // Download HDR JPEG
          const blob = new Blob([hdrJpeg.buffer as ArrayBuffer], { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `Emblematix_HDR_${Date.now()}.jpeg`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          toast.success('HDR image exported');
          return;
        }
      } catch (error) {
        console.error('HDR export failed:', error);
        toast.error('HDR export failed, falling back to standard export');
        // Fall through to standard export
      }
    }

    // Standard export (non-HDR or fallback)
    const mimeType = `image/${format}`;
    const quality = format === "jpeg" ? 0.99 : undefined;

    // Generate high quality image for download
    canvasRef.current.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = `Emblematix_${Date.now()}.${format}`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          toast.success('Image exported');
        }
      },
      mimeType,
      quality
    );
  };

  if (!mounted) {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center md:p-4 md:pt-12 md:px-8 lg:px-12 xl:px-24 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50">
      {/* Header - Fixed on mobile, static on desktop */}
      <div className="fixed md:static top-0 left-0 right-0 z-50 bg-neutral-50 dark:bg-neutral-900 px-4 py-4 md:p-0 border-b md:border-b-0 border-neutral-200 dark:border-neutral-700 md:z-10 md:max-w-6xl md:w-full md:mb-6 lg:mb-8">
        <div className="max-w-6xl mx-auto w-full items-center justify-between font-mono text-sm flex">
          <p className="text-xl font-bold">
            Emblematix
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={!processedImage}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm shadow-sm hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
            >
              <Download className="w-4 h-4" />
              Save Image
            </button>
            <a
              className="flex place-items-center gap-2 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              href="https://github.com/XiaoMengXinX/Emblematix-PWA"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6 fill-current"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Spacer for fixed header on mobile */}
      <div className="h-20 md:hidden" />

      <div className="flex flex-col lg:flex-row w-full max-w-6xl gap-6 lg:gap-8 flex-grow items-start px-4 md:px-0">
        {/* Image Preview Area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={clsx(
            "flex-1 flex flex-col items-center justify-center min-h-[300px] md:min-h-[500px] lg:h-[calc(100vh-12rem)] bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border-2 p-4 relative overflow-hidden w-full transition-colors",
            isDragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10"
              : "border-neutral-200 dark:border-neutral-700"
          )}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm">
              <Upload className="w-16 h-16 text-blue-500 mb-4 animate-bounce" />
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">Drop image here</p>
            </div>
          )}
          {isProcessing && (
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-200 dark:bg-blue-900/50 overflow-hidden rounded-t-2xl">
              <div className="progress-bar-indeterminate"></div>
            </div>
          )}
          <canvas key={config.colorSpace} ref={canvasRef} className="hidden" />
          {/* HDR Badge */}
          {config.enableHDR && hdrData.hasGainMap && (
            <div className="absolute top-4 right-4 px-3 py-1.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-full text-xs font-bold shadow-lg z-10">
              HDR
            </div>
          )}
          {processedImage ? (
            <img
              src={processedImage}
              alt="Preview"
              className="max-w-full max-h-[60vh] md:max-h-[75vh] lg:max-h-[80vh] object-contain shadow-sm cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <div className="text-center p-8">
              <ImageIcon className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-neutral-400" />
              <p className="text-base md:text-lg font-medium text-neutral-500">No image selected</p>
              <p className="text-sm text-neutral-400 mt-2">or drag and drop here</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium transition-colors flex items-center gap-2 mx-auto text-sm md:text-base"
              >
                <Upload className="w-4 h-4" />
                Select Image
              </button>
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onClick={(e) => {
              // Allow selecting the same file again
              (e.target as HTMLInputElement).value = "";
            }}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
        </div>

        {/* Configuration Panel */}
        <div className="w-full lg:w-96 flex flex-col gap-4 pb-8 lg:pb-0">

          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 py-6 pl-6 pr-3 md:min-h-[500px] lg:h-[calc(100vh-12rem)] lg:overflow-y-auto [scrollbar-gutter:stable] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Configuration
              </h2>
              <button
                onClick={handleReset}
                className="p-1.5 rounded-full text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                aria-label="Reset Configuration"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Display Options</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "showManufacturer", label: "Manufacturer" },
                    { key: "showModel", label: "Model" },
                    { key: "showFNumber", label: "F Number" },
                    { key: "showShutterSpeed", label: "Shutter Speed" },
                    { key: "showFocalLength", label: "Focal Length" },
                    { key: "showISO", label: "ISO" },
                    { key: "showDateTime", label: "Date & Time" },
                    { key: "showCopyright", label: "Copyright" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setConfig({ ...config, [key]: !config[key as keyof AppConfig] })}
                      className={clsx(
                        "py-1 px-3 rounded-full text-xs font-medium border transition-colors",
                        config[key as keyof AppConfig]
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-600"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Watermark Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfig({ ...config, watermarkType: "normal" })}
                    className={clsx(
                      "flex-1 py-2 px-4 rounded-lg font-medium text-sm border transition-colors",
                      config.watermarkType === "normal"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-600"
                    )}
                  >
                    Normal
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, watermarkType: "compact" })}
                    className={clsx(
                      "flex-1 py-2 px-4 rounded-lg font-medium text-sm border transition-colors",
                      config.watermarkType === "compact"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-600"
                    )}
                  >
                    Compact
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Style</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfig({ ...config, randomization: "randomize" })}
                    className={clsx(
                      "flex-1 py-2 px-4 rounded-lg font-medium text-sm border transition-colors",
                      config.randomization === "randomize"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-600"
                    )}
                  >
                    Randomize
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, randomization: "static" })}
                    className={clsx(
                      "flex-1 py-2 px-4 rounded-lg font-medium text-sm border transition-colors",
                      config.randomization === "static"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-600"
                    )}
                  >
                    Static
                  </button>
                </div>
              </div>

              {config.randomization === "static" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Brightness</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfig({ ...config, alterBrightness: "brighten" })}
                      className={clsx(
                        "flex-1 py-2 px-4 rounded-lg font-medium text-sm border transition-colors",
                        config.alterBrightness === "brighten"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-600"
                      )}
                    >
                      Brighten
                    </button>
                    <button
                      onClick={() => setConfig({ ...config, alterBrightness: "dim" })}
                      className={clsx(
                        "flex-1 py-2 px-4 rounded-lg font-medium text-sm border transition-colors",
                        config.alterBrightness === "dim"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-600"
                      )}
                    >
                      Dim
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Export Format</label>
                <div className="flex gap-2">
                  {(isSafari
                    ? (["jpeg", "png"] as const)
                    : (["jpeg", "png", "webp"] as const)
                  ).map((format) => (
                    <button
                      key={format}
                      onClick={() => setConfig({ ...config, exportFormat: format })}
                      disabled={config.enableHDR && format !== "jpeg"}
                      className={clsx(
                        "flex-1 py-2 px-4 rounded-lg font-medium text-sm border transition-colors",
                        config.exportFormat === format
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-600",
                        config.enableHDR && format !== "jpeg" && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    setIsMetadataSettingsOpen(!isMetadataSettingsOpen);
                    if (!isMetadataSettingsOpen) {
                      setIsFontSettingsOpen(false);
                    }
                  }}
                  className="w-full flex items-center justify-between p-3 bg-neutral-100 dark:bg-neutral-700/50 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Metadata Settings</span>
                    <span className="text-xs text-neutral-400">
                      {Object.values(editableMetadata).filter(v => v !== "").length} field{Object.values(editableMetadata).filter(v => v !== "").length !== 1 ? 's' : ''} filled
                    </span>
                  </div>
                  <ChevronDown
                    className={clsx(
                      "w-5 h-5 text-neutral-500 transition-transform duration-300",
                      isMetadataSettingsOpen ? "rotate-180" : "rotate-0"
                    )}
                  />
                </button>

                <div
                  className={clsx(
                    "grid transition-[grid-template-rows] duration-300 ease-in-out",
                    isMetadataSettingsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-4 mt-2">
                      {[
                        { key: 'manufacturer', label: 'Manufacturer', placeholder: 'e.g. Canon' },
                        { key: 'model', label: 'Model', placeholder: 'e.g. EOS R5' },
                        { key: 'fNumber', label: 'F Number', placeholder: 'e.g. f/2.8 or 2.8' },
                        { key: 'shutterSpeed', label: 'Shutter Speed', placeholder: 'e.g. 1/250' },
                        { key: 'focalLength', label: 'Focal Length', placeholder: 'e.g. 50mm or 50' },
                        { key: 'iso', label: 'ISO', placeholder: 'e.g. 100' },
                        { key: 'dateTime', label: 'Date & Time', placeholder: 'e.g. 2024:12:08 12:30:00' },
                      ].map(({ key, label, placeholder }) => (
                        <div key={key} className="space-y-2">
                          <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{label}</label>
                          <div className="relative w-full">
                            <input
                              type="text"
                              value={localEditableMetadata[key as keyof EditableMetadata]}
                              onChange={(e) => setLocalEditableMetadata({
                                ...localEditableMetadata,
                                [key]: e.target.value,
                              })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setEditableMetadata({
                                    ...editableMetadata,
                                    [key]: localEditableMetadata[key as keyof EditableMetadata],
                                  });
                                }
                              }}
                              onBlur={() => setEditableMetadata({
                                ...editableMetadata,
                                [key]: localEditableMetadata[key as keyof EditableMetadata],
                              })}
                              className="w-full px-3 pr-10 py-2 rounded-lg text-sm border transition-all outline-none bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                              placeholder={placeholder}
                            />
                            {localEditableMetadata[key as keyof EditableMetadata] !== editableMetadata[key as keyof EditableMetadata] && (
                              <button
                                onClick={() => setEditableMetadata({
                                  ...editableMetadata,
                                  [key]: localEditableMetadata[key as keyof EditableMetadata],
                                })}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg border border-transparent transition-colors text-neutral-500 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-200 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 dark:hover:border-blue-800"
                                aria-label={`Apply ${label} `}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    setIsFontSettingsOpen(!isFontSettingsOpen);
                    if (!isFontSettingsOpen) {
                      setIsMetadataSettingsOpen(false);
                    }
                  }}
                  className="w-full flex items-center justify-between p-3 bg-neutral-100 dark:bg-neutral-700/50 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Font Settings</span>
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-200">
                      {(fonts[config.font as keyof typeof fonts]?.name || customFonts.find(f => f.name === config.font)?.name || config.font)}
                      &nbsp;•&nbsp;
                      {config.fontWeight === "300" ? "Light" : config.fontWeight === "500" ? "Medium" : "Normal"}
                    </span>
                  </div>
                  <ChevronDown
                    className={clsx(
                      "w-5 h-5 text-neutral-500 transition-transform duration-300",
                      isFontSettingsOpen ? "rotate-180" : "rotate-0"
                    )}
                  />
                </button>

                <div
                  className={clsx(
                    "grid transition-[grid-template-rows] duration-300 ease-in-out",
                    isFontSettingsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-6 mt-2">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Font Family</label>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(fonts).map(([key, { name, className }]) => (
                            <button
                              key={key}
                              onClick={() => setConfig({ ...config, font: key })}
                              className={clsx(
                                "py-2 px-3 rounded-lg text-sm transition-colors text-left truncate",
                                className,
                                config.font === key
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-2 border-blue-200 dark:border-blue-800"
                                  : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-2 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-700"
                              )}
                            >
                              {name}
                            </button>
                          ))}
                          {customFonts.map((font) => (
                            <div key={font.name} className="relative group">
                              <button
                                onClick={() => setConfig({ ...config, font: font.name })}
                                className={clsx(
                                  "w-full py-2 px-3 pr-8 rounded-lg text-sm transition-colors text-left truncate",
                                  config.font === font.name
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-2 border-blue-200 dark:border-blue-800"
                                    : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-2 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-700"
                                )}
                                style={{ fontFamily: font.style }}
                              >
                                {font.name}
                              </button>
                              <button
                                onClick={(e) => handleDeleteFont(font.name, e)}
                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                                title="Delete font"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => fontInputRef.current?.click()}
                            className="py-2 px-3 rounded-lg text-sm transition-colors text-center border-2 border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 bg-transparent"
                          >
                            + Upload Font
                          </button>
                        </div>
                        <input
                          type="file"
                          ref={fontInputRef}
                          onChange={handleFontUpload}
                          accept=".ttf,.otf,.woff,.woff2"
                          className="hidden"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Weight</label>
                        <div className="flex gap-2">
                          {[
                            { value: "300", label: "Light" },
                            { value: "400", label: "Normal" },
                            { value: "500", label: "Medium" },
                          ].map((weight) => (
                            <button
                              key={weight.value}
                              onClick={() => setConfig({ ...config, fontWeight: weight.value })}
                              className={clsx(
                                "flex-1 py-2 px-4 rounded-lg font-medium text-sm border transition-colors",
                                config.fontWeight === weight.value
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                                  : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-700"
                              )}
                            >
                              {weight.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Location</label>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setConfig({ ...config, useCustomLocation: false, location: exifLocation });
                          setLocalLocation(exifLocation);
                        }}
                        className={clsx(
                          "px-2 py-1 rounded text-xs font-medium transition-colors",
                          !config.useCustomLocation
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                        )}
                      >
                        EXIF
                      </button>
                      <button
                        onClick={() => {
                          setConfig({ ...config, useCustomLocation: true, location: "" });
                          setLocalLocation("");
                        }}
                        className={clsx(
                          "px-2 py-1 rounded text-xs font-medium transition-colors",
                          config.useCustomLocation
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                        )}
                      >
                        Custom
                      </button>
                    </div>
                  </div>
                  <div className="relative w-full">
                    <input
                      type="text"
                      value={localLocation}
                      onChange={(e) => setLocalLocation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setConfig({ ...config, location: localLocation });
                        }
                      }}
                      onBlur={() => setConfig({ ...config, location: localLocation })}
                      disabled={!config.useCustomLocation}
                      className={clsx(
                        "w-full px-4 pr-12 py-2 rounded-lg border transition-all outline-none",
                        config.useCustomLocation
                          ? "bg-neutral-100 dark:bg-neutral-700 border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          : "bg-neutral-100 dark:bg-neutral-700/50 border-transparent text-neutral-400 cursor-not-allowed"
                      )}
                      placeholder={config.useCustomLocation ? "e.g. Shanghai, China" : (exifLocation || "No GPS data")}
                    />
                    {localLocation !== config.location && config.useCustomLocation && (
                      <button
                        onClick={() => setConfig({ ...config, location: localLocation })}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg border border-transparent transition-colors text-neutral-500 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-200 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 dark:hover:border-blue-800"
                        aria-label="Apply Location"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Copyright</label>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setConfig({ ...config, useCustomCopyright: false, customCopyright: exifCopyright });
                          setLocalCustomCopyright(exifCopyright);
                        }}
                        className={clsx(
                          "px-2 py-1 rounded text-xs font-medium transition-colors",
                          !config.useCustomCopyright
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                        )}
                      >
                        EXIF
                      </button>
                      <button
                        onClick={() => setConfig({ ...config, useCustomCopyright: true })}
                        className={clsx(
                          "px-2 py-1 rounded text-xs font-medium transition-colors",
                          config.useCustomCopyright
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                        )}
                      >
                        Custom
                      </button>
                    </div>
                  </div>
                  <div className="relative w-full">
                    <input
                      type="text"
                      value={localCustomCopyright}
                      onChange={(e) => setLocalCustomCopyright(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setConfig({ ...config, customCopyright: localCustomCopyright });
                        }
                      }}
                      onBlur={() =>
                        setConfig({ ...config, customCopyright: localCustomCopyright })
                      }
                      disabled={!config.useCustomCopyright}
                      className={clsx(
                        "w-full px-4 pr-12 py-2 rounded-lg border transition-all outline-none",
                        config.useCustomCopyright
                          ? "bg-neutral-100 dark:bg-neutral-700 border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          : "bg-neutral-100 dark:bg-neutral-700/50 border-transparent text-neutral-400 cursor-not-allowed"
                      )}
                      placeholder={config.useCustomCopyright ? "e.g. John Doe" : (exifCopyright || "No EXIF copyright")}
                    />
                    {localCustomCopyright !== config.customCopyright && config.useCustomCopyright && (
                      <button
                        onClick={() =>
                          setConfig({ ...config, customCopyright: localCustomCopyright })
                        }
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg border border-transparent transition-colors text-neutral-500 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-200 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 dark:hover:border-blue-800"
                        aria-label="Apply Copyright"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Experimental Features (Collapsed) */}
              <div className="space-y-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  onClick={() => setIsExperimentalSettingsOpen(!isExperimentalSettingsOpen)}
                  className="w-full flex items-center justify-between p-3 bg-neutral-100 dark:bg-neutral-700/50 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Experimental Features</span>
                  </div>
                  <ChevronDown
                    className={clsx(
                      "w-5 h-5 text-neutral-500 transition-transform duration-300",
                      isExperimentalSettingsOpen ? "rotate-180" : "rotate-0"
                    )}
                  />
                </button>

                <div
                  className={clsx(
                    "grid transition-[grid-template-rows] duration-300 ease-in-out",
                    isExperimentalSettingsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-2 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700 mt-2">
                      {/* HDR Support Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">HDR Support</span>
                          <span className="text-xs text-neutral-500">
                            Preserve gain map in HDR images
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const newEnableHDR = !config.enableHDR;
                            setConfig({
                              ...config,
                              enableHDR: newEnableHDR,
                              exportFormat: newEnableHDR ? "jpeg" : config.exportFormat
                            });
                          }}
                          className={clsx(
                            "relative w-12 h-6 rounded-full transition-colors",
                            config.enableHDR
                              ? "bg-blue-600"
                              : "bg-neutral-300 dark:bg-neutral-600"
                          )}
                          aria-label="Toggle HDR Support"
                        >
                          <div
                            className={clsx(
                              "absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                              config.enableHDR ? "right-0.5" : "left-0.5"
                            )}
                          />
                        </button>
                      </div>

                      {/* Color Space Selector */}
                      <div className="flex items-center justify-between border-t border-neutral-200 dark:border-neutral-700/50 pt-2 mt-1">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">Color Space</span>
                          <span className="text-xs text-neutral-500">
                            Select export color space
                          </span>
                        </div>
                        <div className="flex gap-1 bg-white dark:bg-neutral-800 rounded-lg p-1 border border-neutral-200 dark:border-neutral-600">
                          <button
                            onClick={() => setConfig({ ...config, colorSpace: "srgb" })}
                            className={clsx(
                              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                              config.colorSpace === "srgb"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                            )}
                          >
                            sRGB
                          </button>
                          <button
                            onClick={() => !isSafari && setConfig({ ...config, colorSpace: "display-p3" })}
                            disabled={isSafari}
                            className={clsx(
                              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                              isSafari
                                ? "text-neutral-400 dark:text-neutral-600 cursor-not-allowed opacity-50"
                                : config.colorSpace === "display-p3"
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                            )}
                            title={isSafari ? "Display P3 is not supported on Safari" : ""}
                          >
                            Display P3
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
