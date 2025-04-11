// src/app/page.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';

// --- Configuration (Keep existing) ---
const MAX_IMAGE_DIMENSION = parseInt(process.env.NEXT_PUBLIC_MAX_IMAGE_DIMENSION || '1024');
const MASK_ANALYSIS_THRESHOLD = 127;
const DEMO_IMAGE_URL = '/test_car.jpg';

// --- Interfaces (Keep existing) ---
interface WheelData {
    id: string;
    name: string;
    imageUrl: string;
}
interface DetectedWheel {
    center: { x: number; y: number };
    diameter: number;
    originalBoundingBox: { x: number; y: number; width: number; height: number };
}

// --- Helper Function: Load Image (Keep existing) ---
const loadImage = (src: string): Promise<HTMLImageElement> => {
    // ... (loadImage logic remains the same) ...
    return new Promise((resolve, reject) => {
        const img = new window.Image(); img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = (err) => { console.error(`Failed to load image: ${src.substring(0, 50)}...`, err); reject(new Error(`Failed to load image: ${src.substring(0, 50)}... Error: ${err}`)); };
        img.src = src;
    });
};

export default function HomePage() {
    // --- State Variables ---
    const [mainImagePreviewUrl, setMainImagePreviewUrl] = useState<string | null>(null);
    const [resizedImageDataUrl, setResizedImageDataUrl] = useState<string | null>(null);
    const [outputImageUrl, setOutputImageUrl] = useState<string | null>(null);
    const [isLoadingDetection, setIsLoadingDetection] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [progressMessage, setProgressMessage] = useState<string>('');
    const [availableWheels, setAvailableWheels] = useState<WheelData[]>([]);
    const [wheelsLoading, setWheelsLoading] = useState<boolean>(true);
    const [wheelsError, setWheelsError] = useState<string | null>(null);
    // *** CHANGE: Use a single selected wheel state ***
    const [selectedWheel, setSelectedWheel] = useState<WheelData | null>(null);
    const [detectedWheels, setDetectedWheels] = useState<DetectedWheel[] | null>(null);
    const [isCompositing, setIsCompositing] = useState<boolean>(false);

    // --- Refs (Keep existing) ---
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Fetch Available Wheels ---
    useEffect(() => {
        const fetchWheels = async () => {
            setWheelsLoading(true);
            setWheelsError(null);
            try {
                const response = await fetch('/api/get-wheels');
                if (!response.ok) {
                    throw new Error(`Failed to fetch wheels: ${response.statusText}`);
                }
                const wheelsData: WheelData[] = await response.json();
                setAvailableWheels(wheelsData);

                // *** CHANGE: Set default for single selected wheel ***
                if (wheelsData.length > 0) {
                    // Set initial default only if no wheel is currently selected
                    if (!selectedWheel) {
                        setSelectedWheel(wheelsData[0]);
                    }
                } else {
                    console.warn("No wheels found in public/wheels directory.");
                    setSelectedWheel(null); // Ensure no wheel selected if none available
                }

            } catch (err) {
                const error = err as { message: string };
                console.error("Error fetching wheels:", error);
                setWheelsError(`Could not load wheels: ${error.message}`);
                setAvailableWheels([]);
                setSelectedWheel(null); // Ensure no wheel selected on error
            } finally {
                setWheelsLoading(false);
            }
        };
        // Only run fetchWheels once on mount OR if selectedWheel gets reset externally (unlikely here)
        if (!selectedWheel) {
             fetchWheels();
        }
    }, [selectedWheel]); // Re-run if selectedWheel becomes null

    // --- Image Handling Logic (Keep existing: handleFileChange, triggerFileInput, handleUseDemoImage, resetImageStates) ---
    const resetImageStates = () => {
        setOutputImageUrl(null); setError(null); setProgressMessage('');
        setResizedImageDataUrl(null); setDetectedWheels(null);
        // Do not reset selectedWheel here, keep the user's choice
    };
     const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
       const file = event.target.files?.[0];
       if (file) {
         resetImageStates();
         const reader = new FileReader();
         reader.onloadend = () => {
           setMainImagePreviewUrl(reader.result as string);
         };
         reader.readAsDataURL(file);
       }
        if (event.target) event.target.value = '';
    };
    const triggerFileInput = () => { fileInputRef.current?.click(); };
    const handleUseDemoImage = () => {
      resetImageStates();
      setMainImagePreviewUrl(DEMO_IMAGE_URL);
    };

    // --- Image Resizing (Keep existing) ---
    const resizeImage = useCallback(async (imageDataUrl: string): Promise<string> => {
        // ... (resizeImage logic remains the same) ...
        return new Promise((resolve, reject) => {
            const img = new window.Image(); img.onload = () => {
                const { width, height } = img;
                let newWidth = width;
                let newHeight = height;
                const MAX_DIM = MAX_IMAGE_DIMENSION;
                
                if (width > MAX_DIM || height > MAX_DIM) {
                    const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
                    newWidth = Math.round(width * ratio);
                    newHeight = Math.round(height * ratio);
                    console.log(`Resizing: ${width}x${height} -> ${newWidth}x${newHeight}`);
                } else {
                    console.log(`No resize needed: ${width}x${height}`);
                }
                const canvas = document.createElement('canvas'); canvas.width = newWidth; canvas.height = newHeight; const ctx = canvas.getContext('2d'); if (!ctx) return reject(new Error('Could not get canvas context'));
                ctx.drawImage(img, 0, 0, newWidth, newHeight); resolve(canvas.toDataURL('image/png'));
            }; img.onerror = (err) => reject(new Error(`Failed to load image ('${imageDataUrl.substring(0,50)}...') for resizing: ${err}`)); img.src = imageDataUrl;
        });
    }, []);

    // --- Mask Analysis (Keep existing) ---
    const analyzeMask = useCallback(async (maskUrl: string, targetWidth: number, targetHeight: number): Promise<DetectedWheel[]> => {
        // ... (analyzeMask logic remains the same) ...
        setProgressMessage('Analyzing segmentation mask...'); console.log("Analyzing mask:", maskUrl.substring(0, 50) + "...");
        try {
            const maskImg = await loadImage(maskUrl); console.log(`Mask loaded: ${maskImg.width}x${maskImg.height}`);
            const canvas = document.createElement('canvas'); canvas.width = targetWidth; canvas.height = targetHeight; const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error("No mask canvas context"); ctx.drawImage(maskImg, 0, 0, targetWidth, targetHeight);
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight); const data = imageData.data; const visited = new Array(targetWidth * targetHeight).fill(false); const blobs: { minX: number, minY: number, maxX: number, maxY: number, count: number }[] = [];
            // Blob detection ...
            for (let y = 0; y < targetHeight; y++) { for (let x = 0; x < targetWidth; x++) { const index = (y * targetWidth + x); if (visited[index]) continue; const pixelIndex = index * 4; const isMaskPixel = data[pixelIndex] > MASK_ANALYSIS_THRESHOLD && data[pixelIndex + 1] > MASK_ANALYSIS_THRESHOLD && data[pixelIndex + 2] > MASK_ANALYSIS_THRESHOLD; if (isMaskPixel) { const currentBlob = { minX: x, minY: y, maxX: x, maxY: y, count: 0 }; const queue = [{ x, y }]; visited[index] = true; while (queue.length > 0) { const { x: currentX, y: currentY } = queue.shift()!; currentBlob.minX = Math.min(currentBlob.minX, currentX); currentBlob.minY = Math.min(currentBlob.minY, currentY); currentBlob.maxX = Math.max(currentBlob.maxX, currentX); currentBlob.maxY = Math.max(currentBlob.maxY, currentY); currentBlob.count++; const neighbors = [{ x: currentX + 1, y: currentY }, { x: currentX - 1, y: currentY }, { x: currentX, y: currentY + 1 }, { x: currentX, y: currentY - 1 }]; for (const neighbor of neighbors) { const { x: nx, y: ny } = neighbor; if (nx >= 0 && nx < targetWidth && ny >= 0 && ny < targetHeight) { const neighborIndex = (ny * targetWidth + nx); if (!visited[neighborIndex]) { const neighborPixelIndex = neighborIndex * 4; const isNeighborMask = data[neighborPixelIndex] > MASK_ANALYSIS_THRESHOLD && data[neighborPixelIndex + 1] > MASK_ANALYSIS_THRESHOLD && data[neighborPixelIndex + 2] > MASK_ANALYSIS_THRESHOLD; if (isNeighborMask) { visited[neighborIndex] = true; queue.push(neighbor); } } } } } if (currentBlob.count > 50) blobs.push(currentBlob); } visited[index] = true; } }
            // End blob detection
            console.log(`Found ${blobs.length} blobs.`); if (blobs.length === 0) throw new Error("No wheels found in mask.");
            blobs.sort((a, b) => b.count - a.count); const topBlobs = blobs.slice(0, 2); topBlobs.sort((a, b) => (a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2);
            const detectedWheelsResult = topBlobs.map(blob => { const width = blob.maxX - blob.minX + 1; const height = blob.maxY - blob.minY + 1; const centerX = blob.minX + width / 2; const centerY = blob.minY + height / 2; const diameter = Math.round((width + height) / 2); if (diameter <= 0) return null; return { center: { x: Math.round(centerX), y: Math.round(centerY) }, diameter, originalBoundingBox: { x: blob.minX, y: blob.minY, width, height } }; }).filter(w => w !== null) as DetectedWheel[];
            if (detectedWheelsResult.length === 0) throw new Error("Could not extract valid wheel properties."); if (detectedWheelsResult.length === 1) console.warn("Only one wheel detected."); console.log("Detected wheels:", detectedWheelsResult); return detectedWheelsResult;
        } catch (error) {
            const err = error as { message: string };
            console.error("Error processing mask:", err);
            throw new Error(`Mask processing failed: ${err.message}`);
        }
    }, []);

    // --- Image Compositing ---
    // *** CHANGE: Function signature simplified (conceptually - same args passed in useEffect) ***
    const generateOutputImage = useCallback(async (
        baseImageDataUrl: string, wheelPositions: DetectedWheel[], wheelImageUrl: string
    ): Promise<string> => {
        console.log("Starting client-side image compositing...");
        setIsCompositing(true);
        try {
            // Load base image and the *single* selected wheel image
            const [mainImg, wheelImg] = await Promise.all([
                loadImage(baseImageDataUrl),
                loadImage(wheelImageUrl)
            ]);

            const canvas = canvasRef.current; if (!canvas) throw new Error("Output canvas not found");
            canvas.width = mainImg.naturalWidth; canvas.height = mainImg.naturalHeight;
            const ctx = canvas.getContext('2d'); if (!ctx) throw new Error("Could not get output canvas context");

            ctx.drawImage(mainImg, 0, 0, canvas.width, canvas.height);

            // Draw the *same* wheel image at each detected position
            for (const wheel of wheelPositions) {
                const { center, diameter } = wheel;
                if (diameter <= 0) continue;
                const radius = diameter / 2;
                const pasteX = Math.round(center.x - radius);
                const pasteY = Math.round(center.y - radius);
                ctx.drawImage(wheelImg, pasteX, pasteY, diameter, diameter);
            }
            console.log("Client-side compositing finished.");
            return canvas.toDataURL('image/png');
        } catch (error) {
            console.error("Error during compositing:", error);
            setError("Error creating the final image.");
            throw error;
        } finally {
            setIsCompositing(false);
        }
    }, [setError]); // setError dependency

    // --- useEffect to Trigger Compositing ---
    useEffect(() => {
        // *** CHANGE: Check for single selected wheel ***
        if (detectedWheels && resizedImageDataUrl && selectedWheel?.imageUrl) {
            if (detectedWheels.length === 0) {
                console.warn("Detection completed, but no wheels found to composite.");
                setError("Could not find wheels in the image to replace.");
                setOutputImageUrl(null);
                return;
            }
            (async () => {
                try {
                    // *** CHANGE: Pass selectedWheel.imageUrl for both wheel args ***
                    const finalImage = await generateOutputImage(
                        resizedImageDataUrl,
                        detectedWheels,
                        selectedWheel.imageUrl // Pass the same URL
                        // No second URL needed conceptually, but function expects it
                    );
                    setOutputImageUrl(finalImage);
                    setError(null);
                } catch {
                    setOutputImageUrl(null);
                }
            })();
        }
        // *** CHANGE: Depend on single selectedWheel ***
    }, [detectedWheels, selectedWheel, resizedImageDataUrl, generateOutputImage, setError]);

    // --- Submit for Detection Only (Keep existing) ---
    const handleDetectSubmit = async () => {
        // ... (handleDetectSubmit logic remains the same) ...
        if (!mainImagePreviewUrl) { setError('Please select or load a car image first.'); return; }
        setError(null); setIsLoadingDetection(true); setProgressMessage('Starting detection...');
        setOutputImageUrl(null); setDetectedWheels(null); setResizedImageDataUrl(null);
        try {
            setProgressMessage('Resizing image...');
            const resizedData = await resizeImage(mainImagePreviewUrl); setResizedImageDataUrl(resizedData);
            const tempImg = await loadImage(resizedData); const resizedWidth = tempImg.naturalWidth; const resizedHeight = tempImg.naturalHeight; console.log(`Resized to ${resizedWidth}x${resizedHeight}`);
            setProgressMessage('Detecting wheels via Replicate...');
            const response = await fetch('/api/detect-wheels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: resizedData }), });
            const result = await response.json(); if (!response.ok) throw new Error(result.error || `API failed: ${response.status}`); if (!result.maskUrl) throw new Error("API did not return mask URL.");
            console.log("Mask URL:", result.maskUrl.substring(0, 50) + "...");
            const wheelPositions = await analyzeMask(result.maskUrl, resizedWidth, resizedHeight); setDetectedWheels(wheelPositions);
            setProgressMessage('Detection complete! Select wheels below.');
        } catch (err) {
            const error = err as { message: string };
            console.error('Detection/Analysis error:', error);
            setError(`Error: ${error.message}`);
            setProgressMessage('');
            setDetectedWheels(null);
            setResizedImageDataUrl(null);
        } finally { setIsLoadingDetection(false); }
    };


    // --- JSX Rendering ---
    return (
        <div className="bg-gray-800 min-h-screen">
            <div className="container mx-auto px-4 py-12 md:py-16 max-w-5xl">
                <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center text-white">Car Wheel Swapper</h1>
                <div className="bg-gray-50 p-6 md:p-8 rounded-xl shadow-sm mb-12">
                    <p className="text-lg mb-6 text-center text-gray-700">
                        Upload or use the demo image, detect wheels, then choose a style below to apply to all wheels.
                    </p>
                    <div className="max-w-3xl mx-auto">

                        {/* Step 1: Image Upload Section (Keep existing structure) */}
                        <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
                             {/* ... (Upload/Demo buttons, Thumbnail, Detect Button - no changes) ... */}
                             <h2 className="text-xl font-semibold mb-4 text-gray-900">1. Choose Image</h2>
                             <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} className="hidden" />
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                 <button onClick={triggerFileInput} disabled={isLoadingDetection} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-lg text-gray-700 hover:text-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"> <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /> </svg> Upload Car Image </button>
                                 <button onClick={handleUseDemoImage} disabled={isLoadingDetection} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 border-2 border-dashed border-gray-300 hover:border-green-500 rounded-lg text-gray-700 hover:text-green-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"> <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> </svg> Use Demo Image </button>
                             </div>
                             <div className="flex flex-col md:flex-row gap-4 items-stretch mt-4">
                                 {mainImagePreviewUrl && ( <div className="md:w-1/4 flex-shrink-0"> <p className="text-sm text-gray-600 mb-1">Selected:</p> <div className="relative h-[80px] rounded-lg overflow-hidden border border-gray-200"> <Image key={mainImagePreviewUrl} src={mainImagePreviewUrl} alt="Selected car preview" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 150px" unoptimized={mainImagePreviewUrl.startsWith('/')} /> </div> </div> )}
                                 {mainImagePreviewUrl && !detectedWheels && ( <div className="flex-grow flex items-end"> <button onClick={handleDetectSubmit} disabled={isLoadingDetection} className={`w-full md:w-auto h-[50px] md:h-auto md:self-end py-2 px-6 rounded-lg font-medium text-white transition-colors flex items-center justify-center ${isLoadingDetection ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}> {isLoadingDetection ? ( <span className="flex items-center justify-center gap-2"> <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg> Detecting... </span> ) : 'Detect Wheels'} </button> </div> )}
                             </div>
                        </div>

                        {/* Step 2: Result Preview Section (Keep existing structure) */}
                        <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
                             {/* ... (Preview area, messages, canvas, download button - no changes) ... */}
                             <h2 className="text-xl font-semibold mb-4 text-gray-900"> 2. Preview </h2>
                             {(isLoadingDetection || progressMessage) && !error && !outputImageUrl && ( <p className="text-center text-blue-600 mb-4">{progressMessage}</p> )}
                             {error && ( <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert"> <strong className="font-bold">Error: </strong> <span className="block sm:inline">{error}</span> </div> )}
                             {isCompositing && !outputImageUrl && <p className="text-center text-gray-500 mb-4 italic">Updating preview...</p>}
                             <div className="relative h-[300px] md:h-[450px] bg-gray-100 rounded-lg overflow-hidden border border-gray-200 text-gray-500">
                                 {!mainImagePreviewUrl ? ( <div className="flex items-center justify-center h-full"><p className="text-center px-4">Choose an image above.</p></div>
                                 ) : !detectedWheels && !isLoadingDetection && !error ? ( <div className="relative flex items-center justify-center h-full"> <Image src={mainImagePreviewUrl} alt="Original car" fill className="object-contain opacity-50" sizes="(max-width: 768px) 100vw, 800px" /> <div className="relative z-10 p-4 bg-white/80 rounded shadow"><p className="mt-2 text-gray-600 font-medium">Click &quot;Detect Wheels&quot;</p></div> </div>
                                 ) : isLoadingDetection && !detectedWheels ? ( <div className="flex items-center justify-center h-full"><div className="text-center"> <svg className="animate-spin mx-auto h-10 w-10 text-blue-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg> Detecting wheels... </div></div>
                                 ) : outputImageUrl ? ( <div className="relative w-full h-full"><Image src={outputImageUrl} alt="Car with swapped wheels" fill className="object-contain" sizes="(max-width: 768px) 100vw, 800px" /></div>
                                 ) : detectedWheels && !outputImageUrl && !isCompositing && !error ? ( <div className="relative flex flex-col items-center justify-center h-full"> {resizedImageDataUrl && <Image src={resizedImageDataUrl} alt="Detected car" fill className="object-contain opacity-70" sizes="(max-width: 768px) 100vw, 800px" />} <p className="relative z-10 text-center px-4 p-2 bg-white/80 rounded shadow">Select replacement wheels below.</p> </div>
                                 ) : null}
                                 <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                             </div>
                             {outputImageUrl && !isCompositing && ( <div className="mt-4 text-center"> <a href={outputImageUrl} download="car_with_new_wheels.png" className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-5 rounded transition duration-150 ease-in-out"> Download Image </a> </div> )}
                        </div>

                        {/* Step 3: Wheel Selection Section *** UPDATED *** */}
                        {detectedWheels && !isLoadingDetection && !error && (
                            <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
                                <h2 className="text-xl font-semibold mb-4 text-gray-900">3. Select Wheel Style</h2>
                                <div className="space-y-4">
                                    {/* Wheel fetching status */}
                                    {wheelsLoading && <p className="text-sm text-gray-500 text-center py-4">Loading wheels...</p>}
                                    {wheelsError && <p className="text-sm text-red-500 text-center py-4">{wheelsError}</p>}
                                    {!wheelsLoading && !wheelsError && availableWheels.length === 0 && (
                                        <p className="text-sm text-orange-600 text-center py-4">No wheel images found.</p>
                                    )}

                                    {/* Wheel Grid Display */}
                                    {!wheelsLoading && !wheelsError && availableWheels.length > 0 && (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                            {availableWheels.map((wheel) => (
                                                <button
                                                    key={wheel.id}
                                                    onClick={() => setSelectedWheel(wheel)}
                                                    disabled={isCompositing || wheelsLoading}
                                                    className={`block border-2 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed group
                                                        ${selectedWheel?.id === wheel.id
                                                            ? 'border-indigo-600 ring-2 ring-indigo-500/50 shadow-md scale-105' // Highlight selected
                                                            : 'border-gray-200 hover:border-gray-400 hover:shadow' // Default and hover
                                                        }`}
                                                    title={wheel.name}
                                                >
                                                    <div className="relative aspect-square w-full bg-gray-50 flex items-center justify-center p-1">
                                                         <Image
                                                            src={wheel.imageUrl}
                                                            alt={wheel.name}
                                                            className="object-contain group-hover:scale-105 transition-transform duration-150"
                                                            fill
                                                            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                                                          />
                                                    </div>
                                                    {/* Optional: Display name below image */}
                                                    {/* <p className="text-xs text-center py-1 px-1 truncate bg-gray-50">{wheel.name}</p> */}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )} {/* End Step 3 Condition */}

                    </div> {/* End max-w-3xl */}
                </div> {/* End Main Content Card */}

                {/* Footer Section */}
                <div className="bg-gray-900 p-6 rounded-lg shadow-sm text-center text-gray-300">
                    <h2 className="text-xl font-semibold mb-3 text-white">Wheel Swapper AI Demo</h2>
                    <p className="text-sm">Powered by Replicate & Next.js</p>
                </div>
            </div> {/* End Container */}
        </div> /* End Outer div */
    );
}