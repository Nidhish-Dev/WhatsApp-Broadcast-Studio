import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Read workbook (xlsx/csv are supported transparently by XLSX.read)
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert sheet to JSON array of objects
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    if (rawData.length === 0) {
      return NextResponse.json({ error: 'The uploaded file is empty' }, { status: 400 });
    }

    // Inspect the first row to determine column mappings for "name" and "phone"
    const firstRow = rawData[0];
    let nameKey = '';
    let phoneKey = '';

    // Find keys that match name and phone patterns
    for (const key of Object.keys(firstRow)) {
      const lowerKey = key.toLowerCase().trim();
      if (!nameKey && (lowerKey.includes('name') || lowerKey.includes('nama') || lowerKey.includes('contact') || lowerKey.includes('user'))) {
        nameKey = key;
      }
      if (!phoneKey && (lowerKey.includes('phone') || lowerKey.includes('tel') || lowerKey.includes('num') || lowerKey.includes('wa') || lowerKey.includes('mobile'))) {
        phoneKey = key;
      }
    }

    // Fallbacks if not detected by keywords: use first column for Name and second for Phone
    const keys = Object.keys(firstRow);
    if (!nameKey && keys.length > 0) nameKey = keys[0];
    if (!phoneKey && keys.length > 1) phoneKey = keys[1];

    if (!nameKey || !phoneKey) {
      return NextResponse.json({
        error: 'Could not map columns. Please ensure your file has columns for Name and Phone.'
      }, { status: 400 });
    }

    // Map and sanitize the contacts
    const contacts = rawData
      .map((row) => {
        const name = String(row[nameKey] || '').trim();
        let phone = String(row[phoneKey] || '').trim();

        // Remove any non-numeric characters except + (which could be the country code prefix)
        phone = phone.replace(/[^\d+]/g, '');

        return { name, phone };
      })
      .filter((contact) => contact.name && contact.phone);

    return NextResponse.json({
      success: true,
      contacts,
      mappedColumns: { name: nameKey, phone: phoneKey }
    });
  } catch (error: any) {
    console.error('Error parsing file:', error);
    return NextResponse.json({ error: error.message || 'Failed to parse file' }, { status: 500 });
  }
}
