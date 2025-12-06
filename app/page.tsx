"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Download, Settings, Image as ImageIcon } from "lucide-react";
import ExifReader from "exifreader";
import { ExifData, AppConfig } from "./types";
import clsx from "clsx";

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [exifData, setExifData] = useState<ExifData>({});
  const [config, setConfig] = useState<AppConfig>({
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
  });
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
        .join(" ");

      const photoInfoText = [
        config.showFNumber && exifData.fNumber && `f/${exifData.fNumber}`,
        config.showShutterSpeed && exifData.shutterSpeed && `${exifData.shutterSpeed}s`,
        config.showFocalLength && exifData.focalLength && `${exifData.focalLength}mm`,
        config.showISO && exifData.iso && `ISO${exifData.iso}`,
      ]
        .filter(Boolean)
        .join(" • ");

      const copyrightText =
        config.customCopyright ||
        (config.showCopyright && exifData.copyright ? `© ${exifData.copyright}` : "");
      
      const dateTimeText = config.showDateTime && exifData.dateTime ? exifData.dateTime.split(" ")[0].replace(/:/g, "/") : "";

      const bottomText = [config.location, copyrightText, dateTimeText].filter(Boolean).join("  ");

      const lines =
        config.watermarkType === "normal"
          ? [`${deviceText}  ${photoInfoText}`, bottomText]
          : [config.location, `${deviceText}  ${photoInfoText}  ${copyrightText}`];

      // Configure font
      const fontSize = Math.min(canvas.width, canvas.height) * (config.watermarkType === "normal" ? 0.03 : 0.02);
      ctx.font = `${fontSize}px sans-serif`;
      
      // Calculate positions
      const padding = fontSize * 2;
      let startY = canvas.height - padding;
      const lineHeight = fontSize * 1.5;
      
      if (config.randomization === "static") {
        ctx.fillStyle = config.alterBrightness === "dim" ? "rgba(0, 0, 0, 0.5)" : "rgba(255, 255, 255, 0.5)";
        
        if (config.watermarkType === "normal") {
          ctx.textAlign = "center";
          const startX = canvas.width / 2;
          lines.reverse().forEach((line, index) => {
            ctx.fillText(line, startX, startY - index * lineHeight);
          });
        } else {
          ctx.textAlign = "left";
          const startX = canvas.width * 0.02;
          lines.reverse().forEach((line, index) => {
            ctx.fillText(line, startX, startY - index * lineHeight);
          });
        }
      } else {
        // Randomize logic (Pixel manipulation)
        // First draw text on a temporary canvas to get the mask
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;

        tempCtx.font = `${fontSize}px sans-serif`;
        tempCtx.fillStyle = "black"; // Draw black text for mask

        if (config.watermarkType === "normal") {
          tempCtx.textAlign = "center";
          const startX = canvas.width / 2;
          lines.reverse().forEach((line, index) => {
            tempCtx.fillText(line, startX, startY - index * lineHeight);
          });
        } else {
          tempCtx.textAlign = "left";
          const startX = canvas.width * 0.02;
          lines.reverse().forEach((line, index) => {
            tempCtx.fillText(line, startX, startY - index * lineHeight);
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
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            
            let gain = 0;
            if (luminance > 128) {
               // Darken
               gain = -Math.floor(Math.random() * Math.min(r, g, b, 100));
            } else {
               // Brighten
               gain = Math.floor(Math.random() * Math.min(255 - r, 255 - g, 255 - b, 100));
            }

            data[i] = Math.min(255, Math.max(0, r + gain));
            data[i + 1] = Math.min(255, Math.max(0, g + gain));
            data[i + 2] = Math.min(255, Math.max(0, b + gain));
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
      }

      setProcessedImage(canvas.toDataURL("image/jpeg", 0.9));
    };
  }, [image, exifData, config]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    setImage(imageUrl);

    try {
      const tags = await ExifReader.load(file);
      const newExifData: ExifData = {
        manufacturer: tags["Make"]?.description,
        model: tags["Model"]?.description,
        fNumber: tags["FNumber"]?.description,
        shutterSpeed: tags["ExposureTime"]?.description,
        focalLength: tags["FocalLength"]?.description,
        iso: tags["ISOSpeedRatings"]?.description,
        dateTime: tags["DateTimeOriginal"]?.description,
        copyright: tags["Copyright"]?.description,
      };
      setExifData(newExifData);
    } catch (error) {
      console.error("Error reading EXIF data:", error);
    }
  };

  const handleDownload = () => {
    if (!processedImage) return;
    const link = document.createElement("a");
    link.download = `Emblematix_${Date.now()}.jpg`;
    link.href = processedImage;
    link.click();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-24 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Emblematix
        </p>
        <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
          <a
            className="pointer-events-none flex place-items-center gap-2 p-8 lg:pointer-events-auto lg:p-0"
            href="https://github.com/lz233/Emblematix"
            target="_blank"
            rel="noopener noreferrer"
          >
            By lz233
          </a>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row w-full max-w-6xl gap-8 mt-8 mb-8 flex-grow">
        {/* Image Preview Area */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 p-4 relative overflow-hidden">
          <canvas ref={canvasRef} className="hidden" />
          {processedImage ? (
            <img src={processedImage} alt="Preview" className="max-w-full max-h-[80vh] object-contain shadow-sm" />
          ) : (
            <div className="text-center p-8">
              <ImageIcon className="w-16 h-16 mx-auto mb-4 text-neutral-400" />
              <p className="text-lg font-medium text-neutral-500">No image selected</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium transition-colors flex items-center gap-2 mx-auto"
              >
                <Upload className="w-4 h-4" />
                Select Image
              </button>
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
        </div>

        {/* Configuration Panel */}
        <div className="w-full lg:w-96 flex flex-col gap-4">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configuration
            </h2>
            
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
                <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Location</label>
                <input
                  type="text"
                  value={config.location}
                  onChange={(e) => setConfig({ ...config, location: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-700 border border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  placeholder="e.g. Shanghai, China"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Copyright</label>
                <input
                  type="text"
                  value={config.customCopyright}
                  onChange={(e) => setConfig({ ...config, customCopyright: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-700 border border-transparent focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  placeholder="e.g. John Doe"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleDownload}
            disabled={!processedImage}
            className="w-full py-4 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-2xl font-bold text-lg shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            Save Image
          </button>
        </div>
      </div>
    </main>
  );
}
