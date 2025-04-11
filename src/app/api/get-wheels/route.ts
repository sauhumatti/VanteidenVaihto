import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

interface WheelData {
  id: string;
  name: string;
  imageUrl: string;
}

function generateWheelName(filename: string): string {
    const nameWithoutExtension = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    return nameWithoutExtension
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

export async function GET() {
  const wheelsDirectory = path.join(process.cwd(), 'public', 'wheels');
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];

  try {
    console.log(`API Route (get-wheels): Reading directory: ${wheelsDirectory}`);
    const filenames = await fs.readdir(wheelsDirectory);

    const wheelFiles = filenames.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return allowedExtensions.includes(ext);
    });

    const wheelsData: WheelData[] = wheelFiles.map(filename => {
      return {
        id: filename,
        name: generateWheelName(filename),
        imageUrl: `/wheels/${filename}`,
      };
    });

    console.log(`API Route (get-wheels): Found ${wheelsData.length} wheels.`);
    return NextResponse.json(wheelsData);

  } catch (error) {
    const err = error as { code?: string, message?: string };
    if (err.code === 'ENOENT') {
        console.warn(`API Route (get-wheels): Wheels directory not found at ${wheelsDirectory}. Returning empty list.`);
        return NextResponse.json([]); 
    }
    console.error(`API Route (get-wheels): Error reading wheels directory:`, err.message || 'Unknown error');
    return NextResponse.json({ error: 'Failed to list available wheels.' }, { status: 500 });
  }
}