import Replicate from 'replicate';
import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer'; // Import Buffer

// Initialize Replicate client using the API token from environment variables
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || '',
});

// Configuration - Could also read these from env vars if needed server-side
const MODEL_OWNER = process.env.NEXT_PUBLIC_REPLICATE_MODEL_OWNER!;
const MODEL_NAME = process.env.NEXT_PUBLIC_REPLICATE_MODEL_NAME!;
const MODEL_VERSION = process.env.NEXT_PUBLIC_REPLICATE_MODEL_VERSION!;
const PROMPT = process.env.NEXT_PUBLIC_PROMPT!;

// --- Helper function to process ReadableStream ---
async function processStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    console.log("API Route: Processing stream...");
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
        }
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        combinedData.set(chunk, offset);
        offset += chunk.length;
    }
    console.log("API Route: Stream processing complete.");
    return Buffer.from(combinedData); // Convert Uint8Array to Buffer
}
// --- End Helper Function ---


if (!process.env.REPLICATE_API_TOKEN) {
  console.error("REPLICATE_API_TOKEN environment variable not set.");
}
if (!MODEL_VERSION || !MODEL_OWNER || !MODEL_NAME) {
    console.error("Replicate model details missing in environment variables.");
}
if (!PROMPT) {
    console.error("Prompt missing in environment variables.");
}

export async function POST(request: NextRequest) {
  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: 'Server configuration error: Missing API Token' }, { status: 500 });
  }
  if (!MODEL_VERSION || !MODEL_OWNER || !MODEL_NAME || !PROMPT) {
    return NextResponse.json({ error: 'Server configuration error: Missing Model/Prompt details' }, { status: 500 });
  }

  try {
    const { imageBase64 } = await request.json();

    if (!imageBase64 || !imageBase64.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid image data provided' }, { status: 400 });
    }

    console.log(`API Route: Received image data (length: ${imageBase64.length}), calling Replicate...`);

    // Run the Replicate model
    const output: unknown = await replicate.run(
      `${MODEL_OWNER}/${MODEL_NAME}:${MODEL_VERSION}`,
      {
        input: {
          image: imageBase64,
          text_prompt: PROMPT,
        },
      }
    );

    console.log("API Route: Replicate run finished. Checking output format...");

    let maskUrl: string | null = null;

    // --- NEW: Check if output is a ReadableStream ---
    // Note: Checking for getReader is a common way to detect streams
    if (output && typeof output === 'object' && 'getReader' in (output as object) && typeof (output as { getReader: () => unknown }).getReader === 'function') {
        console.log("API Route: Output is a ReadableStream. Processing...");
        const maskBuffer = await processStream(output as ReadableStream<Uint8Array>);
        console.log(`API Route: Stream processed into buffer (size: ${maskBuffer.length}). Converting to Base64 Data URL.`);
        // Assuming the model outputs a PNG mask, adjust if necessary
        maskUrl = `data:image/png;base64,${maskBuffer.toString('base64')}`;
    }
    // --- Fallback checks for older behavior (less likely for this model now) ---
    else if (typeof output === 'string' && output.startsWith && output.startsWith('http')) {
        console.log("API Route: Output is a direct URL string.");
        maskUrl = output;
    } else if (typeof output === 'object' && output !== null && 'url' in output && typeof output.url === 'string') {
        console.log("API Route: Output is an object with a URL property.");
        maskUrl = output.url;
    } else if (Array.isArray(output) && output.length > 0 && typeof output[0] === 'string' && output[0].startsWith('http')) {
        console.log("API Route: Output is an array of URLs.");
        maskUrl = output[0]; // Take the first one
    } else {
        console.error("API Route: Unexpected output format from Replicate:", output);
        return NextResponse.json({ error: 'Unexpected output format received from Replicate API' }, { status: 500 });
    }

    if (!maskUrl) {
      console.error("API Route: Mask URL could not be determined from Replicate output.");
      return NextResponse.json({ error: 'Failed to retrieve or generate mask URL' }, { status: 500 });
    }

    // Log only the start of the Data URL if it's very long
    const logUrl = maskUrl.startsWith('data:') ? `${maskUrl.substring(0, 100)}... (Data URL)` : maskUrl;
    console.log(`API Route: Returning mask URL: ${logUrl}`);

    return NextResponse.json({ maskUrl });

  } catch (error) {
    const err = error as { response?: { data?: { detail?: string }, status?: number }, message?: string };
    console.error('API Route Error:', error);
    // Provide more specific error info if possible
    const errorMessage = err.response?.data?.detail || err.message || 'An unexpected error occurred';
    const status = err.response?.status || 500;
    return NextResponse.json({ error: `Replicate API Error: ${errorMessage}` }, { status });
  }
}