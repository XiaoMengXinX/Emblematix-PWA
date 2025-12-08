import type { GainMapMetadata, HDRData } from '@/app/types';

/**
 * Dynamically import gainmap-js library.
 * This ensures the heavy library is only loaded when HDR features are actually used.
 */
async function loadGainMapJS() {
  try {
    const module = await import('@monogrid/gainmap-js');
    return module;
  } catch (error) {
    console.error('Failed to load gainmap-js:', error);
    throw new Error('HDR support is not available');
  }
}


/**
 * Extract HDR gain map and metadata from a JPEG file.
 * Returns standard SDR data if HDR extraction fails or is disabled.
 */
export async function extractHDRData(
  file: File,
  enabled: boolean
): Promise<HDRData> {
  if (!enabled) {
    return { hasGainMap: false };
  }

  try {
    const { extractGainmapFromJPEG } = await loadGainMapJS();
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    let sdr, gainMap, metadata;
    try {
      ({ sdr, gainMap, metadata } = await extractGainmapFromJPEG(uint8Array));
    } catch (e: any) {
      if (e.message?.includes('Gain map XMP metadata not found')) {
        // Not an HDR image, this is expected behavior for SDR images
        return { hasGainMap: false };
      }
      throw e; // Re-throw other errors
    }

    // Extract ICC profile from original image
    const icc = extractICCProfile(uint8Array);

    // Load SDR image to get dimensions
    const sdrBlob = new Blob([sdr.buffer as ArrayBuffer], { type: 'image/jpeg' });
    const sdrUrl = URL.createObjectURL(sdrBlob);
    const sdrImage = new Image();
    
    await new Promise((resolve, reject) => {
      sdrImage.onload = resolve;
      sdrImage.onerror = reject;
      sdrImage.src = sdrUrl;
    });
    
    URL.revokeObjectURL(sdrUrl);


    return {
      hasGainMap: true,
      metadata,
      gainMapData: gainMap,
      sdrImageData: sdr, // Store original SDR image data
      iccProfile: icc, // Store ICC profile
      width: sdrImage.width,
      height: sdrImage.height,
    };
  } catch (error) {
    console.error('HDR extraction failed:', error);
    return { hasGainMap: false };
  }
}

/**
 * Extract the raw ICC profile data from a JPEG file's APP2 segment.
 * Returns undefined if no ICC profile is found.
 */
function extractICCProfile(jpegData: Uint8Array): Uint8Array | undefined {
  const APP2_MARKER = 0xFFE2;
  const ICC_SIGNATURE = 'ICC_PROFILE\x00';
  
  let offset = 2; // Skip SOI marker (0xFFD8)
  
  while (offset < jpegData.length - 1) {
    if (jpegData[offset] !== 0xFF) break;
    
    const marker = (jpegData[offset] << 8) | jpegData[offset + 1];
    offset += 2;
    
    if (marker === 0xFFDA) break; // SOS marker, end of headers
    
    const segmentLength = (jpegData[offset] << 8) | jpegData[offset + 1];
    
    if (marker === APP2_MARKER) {
      // Check for ICC_PROFILE signature
      let signatureMatch = true;
      for (let i = 0; i < ICC_SIGNATURE.length; i++) {
        if (jpegData[offset + 2 + i] !== ICC_SIGNATURE.charCodeAt(i)) {
          signatureMatch = false;
          break;
        }
      }
      
      if (signatureMatch) {
        // Found ICC profile
        // Return the entire APP2 segment content (including signature and chunk info)
        return jpegData.slice(offset + 2, offset + segmentLength);
      }
    }
    
    offset += segmentLength;
  }
  
  return undefined;
}


/**
 * Insert an ICC profile into the JPEG data.
 * Constructs a valid APP2 marker segment and inserts it after the SOI or APP0 marker.
 */
export function insertICCProfile(jpegData: Uint8Array, iccProfile: Uint8Array): Uint8Array {
  if (!iccProfile) return jpegData;

  const SOI = 0xFFD8;
  const APP0 = 0xFFE0;
  
  // Construct APP2 marker segment
  // Marker: FF E2
  // Length: 2 bytes (payload + 2)
  // Payload: iccProfile
  const segmentLength = iccProfile.length + 2;
  const app2Segment = new Uint8Array(2 + segmentLength);
  
  app2Segment[0] = 0xFF;
  app2Segment[1] = 0xE2;
  app2Segment[2] = (segmentLength >> 8) & 0xFF;
  app2Segment[3] = segmentLength & 0xFF;
  app2Segment.set(iccProfile, 4);

  // Find insertion point (after SOI or after APP0)
  let insertionIndex = 2; // Default after SOI
  
  if (jpegData[0] === 0xFF && jpegData[1] === 0xD8) {
    // Check for APP0
    if (jpegData[2] === 0xFF && jpegData[3] === 0xE0) {
      const app0Length = (jpegData[4] << 8) | jpegData[5];
      insertionIndex = 4 + app0Length;
    }
  }

  // Create new array
  const result = new Uint8Array(jpegData.length + app2Segment.length);
  result.set(jpegData.subarray(0, insertionIndex), 0);
  result.set(app2Segment, insertionIndex);
  result.set(jpegData.subarray(insertionIndex), insertionIndex + app2Segment.length);

  return result;
}

/**
 * Encode an Ultra HDR JPEG using the libultrahdr WASM library.
 * Uses `appendGainMap` to combine the SDR image and the gain map.
 * Injects the WASM library via a script tag if not already loaded.
 */
export async function encodeHDRJPEG(
  originalSdrData: Uint8Array,
  gainMapData: Uint8Array,
  metadata: GainMapMetadata,
  iccProfile: Uint8Array | undefined,
  enabled: boolean
): Promise<Uint8Array | null> {
  if (!enabled) return null;

  try {
    // Load libultrahdr WASM module using dynamic script injection
    // This is necessary because the module uses import.meta
    const loadWASM = async () => {
      // Check if already loaded
      if ((window as any).libultrahdrModule) {
        return (window as any).libultrahdrModule;
      }

      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `
          import libultrahdr from '/libultrahdr-esm.js';
          window.libultrahdrModule = await libultrahdr();
          window.dispatchEvent(new Event('libultrahdr-loaded'));
        `;
        
        const handleLoad = () => {
          resolve((window as any).libultrahdrModule);
        };
        
        const handleError = () => {
          reject(new Error('Failed to load libultrahdr WASM module'));
        };

        window.addEventListener('libultrahdr-loaded', handleLoad, { once: true });
        script.onerror = handleError;
        
        document.head.appendChild(script);
      });
    };

    const libraryInstance = await loadWASM();

    // Get image dimensions from SDR
    const sdrBlob = new Blob([originalSdrData.buffer as ArrayBuffer], { type: 'image/jpeg' });
    const sdrUrl = URL.createObjectURL(sdrBlob);
    const sdrImage = new Image();
    
    await new Promise((resolve, reject) => {
      sdrImage.onload = resolve;
      sdrImage.onerror = reject;
      sdrImage.src = sdrUrl;
    });
    
    URL.revokeObjectURL(sdrUrl);

    const width = sdrImage.width;
    const height = sdrImage.height;

    // Calculate gainMapMin and gainMapMax from metadata arrays
    const avgGainMapMin = Array.isArray(metadata.gainMapMin) 
      ? metadata.gainMapMin.reduce((a, b) => a + b, 0) / metadata.gainMapMin.length
      : metadata.gainMapMin;
    
    const avgGainMapMax = Array.isArray(metadata.gainMapMax)
      ? metadata.gainMapMax.reduce((a, b) => a + b, 0) / metadata.gainMapMax.length
      : metadata.gainMapMax;

    const avgGamma = Array.isArray(metadata.gamma)
      ? metadata.gamma.reduce((a, b) => a + b, 0) / metadata.gamma.length
      : metadata.gamma;

    const avgOffsetSdr = Array.isArray(metadata.offsetSdr)
      ? metadata.offsetSdr.reduce((a, b) => a + b, 0) / metadata.offsetSdr.length
      : metadata.offsetSdr;

    const avgOffsetHdr = Array.isArray(metadata.offsetHdr)
      ? metadata.offsetHdr.reduce((a, b) => a + b, 0) / metadata.offsetHdr.length
      : metadata.offsetHdr;

    // Call appendGainMap
    const result = libraryInstance.appendGainMap(
      width, height,
      originalSdrData, originalSdrData.length,
      gainMapData, gainMapData.length,
      avgGainMapMax, avgGainMapMin,
      avgGamma, avgOffsetSdr, avgOffsetHdr,
      metadata.hdrCapacityMin, metadata.hdrCapacityMax
    );

    // CRITICAL: Create independent copy to avoid WASM memory heap
    // The result is a view into WASM memory, but we only need the actual data
    let finalResult: Uint8Array;
    if (result instanceof Uint8Array) {
      // Create a new independent Uint8Array with only the actual data
      finalResult = new Uint8Array(result.length);
      finalResult.set(result);
    } else if (typeof result === 'object' && result.length) {
      // Might be a WASM memory view, convert to Uint8Array
      finalResult = new Uint8Array(result);
    } else {
      console.error('Unexpected result type from appendGainMap');
      return null;
    }

    return finalResult;
  } catch (error) {
    console.error('HDR encoding with appendGainMap failed:', error);
    return null;
  }
}
