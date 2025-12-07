"use client";

import { useState, useRef, useEffect } from "react";
import {
  Upload,
  Download,
  Settings,
  Image as ImageIcon,
  Check,
  RotateCcw,
} from "lucide-react";
import ExifReader from "exifreader";
import { ExifData, AppConfig } from "./types";
import clsx from "clsx";

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

  const handleReset = () => {
    setConfig(defaultConfig);
    localStorage.removeItem("emblematix_config");
  };

  // Sync local state when global config changes (e.g., from localStorage)
  useEffect(() => {
    setLocalLocation(config.location);
    setLocalCustomCopyright(config.customCopyright);
  }, [config.location, config.customCopyright]);

  // Load config from localStorage and detect browser on mount
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
        setConfig((prev) => ({ ...prev, ...parsedConfig }));
      } catch (e) {
        console.error("Failed to parse saved config", e);
      }
    }
  }, []);

  // Save config to localStorage whenever it changes
  useEffect(() => {
    if (mounted) {
      localStorage.setItem("emblematix_config", JSON.stringify(config));
    }
  }, [config, mounted]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = image;
    img.onload = () => {
      setIsProcessing(true);
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Prepare text
      const deviceText = [
        config.showManufacturer && exifData.manufacturer,
        config.showModel && exifData.model,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const photoInfoText = [
        config.showFNumber && exifData.fNumber && (exifData.fNumber.toLowerCase().startsWith('f') ? exifData.fNumber : `f/${exifData.fNumber}`),
        config.showShutterSpeed && exifData.shutterSpeed && `${exifData.shutterSpeed}`,
        config.showFocalLength && exifData.focalLength && (exifData.focalLength.endsWith('mm') ? exifData.focalLength : `${exifData.focalLength}mm`),
        config.showISO && exifData.iso && `ISO${exifData.iso}`,
      ]
        .filter(Boolean)
        .join(" • ");

      // Logic from Android getCopyRight()
      let copyrightString = "";
      let timeString = "";
      
      if (exifData.dateTime) {
        // Android format: yyyy|MM/dd HH:mm:ss
        // ExifReader usually returns "yyyy:MM:dd HH:mm:ss"
        const parts = exifData.dateTime.split(" ");
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
               const author = config.customCopyright || exifData.copyright || "";
               if (author !== "") {
                 // Android: Image © yyyy Author.
                 copyrightString = `Image © ${year} ${author}.`;
               }
             }
          }
        }
      } else if (config.showCopyright) {
         const author = config.customCopyright || exifData.copyright || "";
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
      // Use a font that mimics Google Sans if possible, or fallback to sans-serif
      ctx.font = `${fontSize}px sans-serif`;
      
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
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;

        tempCtx.font = `${fontSize}px sans-serif`;
        
        // Draw black text for mask
        // We need to pass the context and let the helper function draw
        // But helper uses closure variables. We can just copy the logic or pass context.
        // Let's refactor drawText to take context.
        
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
            
            // Calculate luminance
            const luminance = 0.3 * r + 0.59 * g + 0.11 * b;
            
            let gain = 0;
            if (luminance > 160) {
              // Darken
               gain = -Math.floor(Math.random() * 100);
            } else {
               // Brighten
               gain = Math.floor(Math.random() * 100);
            }

            data[i] = Math.min(255, Math.max(0, r + gain));
            data[i + 1] = Math.min(255, Math.max(0, g + gain));
            data[i + 2] = Math.min(255, Math.max(0, b + gain));
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
      }

      // Generate preview with lower quality for performance
      canvas.toBlob((blob) => {
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
  }, [image, exifData, config]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    setImage(imageUrl);

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
           shutterSpeed = `1/${Math.round(1/val)}`;
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
      setExifData(newExifData);
    } catch (error) {
      console.error("Error reading EXIF data:", error);
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;

    const format = config.exportFormat;
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
    <main className="flex min-h-screen flex-col items-center p-4 md:pt-12 md:px-24 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50">
      <div className="z-10 max-w-6xl w-full items-center justify-between font-mono text-sm flex mb-6 md:mb-8">
        <p className="text-xl font-bold">
          Emblematix
        </p>
        <a
          className="flex place-items-center gap-2 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          href="https://github.com/XiaoMengXinX/Emblematix-PWA"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
        >
          <svg
            viewBox="0 0 1024 1024"
            className="w-6 h-6 fill-current"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M511.6 76.3C264.3 76.2 64 276.4 64 523.5 64 718.9 189.3 885 363.8 946c23.5 5.9 19.9-10.8 19.9-22.2v-77.5c-135.7 15.9-141.2-73.9-150.3-88.9C215 726 171.5 718 184.5 703c30.9-15.9 62.4 4 98.9 57.9 26.4 39.1 77.9 32.5 104 26 5.7-23.5 17.9-44.5 34.7-60.8-140.6-25.2-199.2-111-199.2-213 0-49.5 16.3-95 48.3-131.7-20.4-60.5 1.9-112.3 4.9-120 58.1-5.2 118.5 41.6 123.2 45.3 33-8.9 70.7-13.6 112.9-13.6 42.4 0 80.2 4.9 113.5 13.9 11.3-8.6 67.3-48.8 121.3-43.9 2.9 7.7 24.7 58.3 5.5 118 32.4 36.8 48.9 82.7 48.9 132.3 0 102.2-59 188.1-200 212.9a127.5 127.5 0 0 1 38.1 91v112.5c.8 9 0 17.9 15 17.9 177.1-59.7 304.6-227 304.6-424.1 0-247.2-200.4-447.3-447.5-447.3z" />
          </svg>
        </a>
      </div>

      <div className="flex flex-col lg:flex-row w-full max-w-6xl gap-6 lg:gap-8 flex-grow items-start">
        {/* Image Preview Area */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] md:min-h-[640px] bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 p-4 relative overflow-hidden w-full">
          {isProcessing && (
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-200 dark:bg-blue-900/50 overflow-hidden rounded-t-2xl">
              <div className="progress-bar-indeterminate"></div>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
          {processedImage ? (
            <img
              src={processedImage}
              alt="Preview"
              className="max-w-full max-h-[60vh] lg:max-h-[80vh] object-contain shadow-sm cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <div className="text-center p-8">
              <ImageIcon className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-neutral-400" />
              <p className="text-base md:text-lg font-medium text-neutral-500">No image selected</p>
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
          <button
            onClick={handleDownload}
            disabled={!processedImage}
            className="w-full py-4 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-2xl font-bold text-lg shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed lg:hidden"
          >
            <Download className="w-5 h-5" />
            Save Image
          </button>

          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 p-6">
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
                      className={clsx(
                        "flex-1 py-2 px-4 rounded-lg font-medium text-sm border transition-colors",
                        config.exportFormat === format
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-600"
                      )}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Location</label>
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
                      className="w-full px-4 pr-12 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-700 border border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                      placeholder="e.g. Shanghai, China"
                    />
                    {localLocation !== config.location && (
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
                  <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Copyright</label>
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
                      className="w-full px-4 pr-12 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-700 border border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                      placeholder="e.g. John Doe"
                    />
                    {localCustomCopyright !== config.customCopyright && (
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
            </div>
          </div>

          <button
            onClick={handleDownload}
            disabled={!processedImage}
            className="w-full py-4 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-2xl font-bold text-lg shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all hidden lg:flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            Save Image
          </button>
        </div>
      </div>
    </main>
  );
}
