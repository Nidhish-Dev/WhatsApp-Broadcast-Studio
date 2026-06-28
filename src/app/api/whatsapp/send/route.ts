import { NextRequest, NextResponse } from 'next/server';
import { whatsappManager } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  try {
    const { contacts, template } = await req.json();

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { error: 'Contacts list is required and must not be empty.' },
        { status: 400 }
      );
    }

    if (!template || typeof template !== 'string' || !template.trim()) {
      return NextResponse.json(
        { error: 'Message template is required.' },
        { status: 400 }
      );
    }

    if (whatsappManager.state !== 'READY') {
      return NextResponse.json(
        { error: 'WhatsApp client is not connected. Please scan the QR code first.' },
        { status: 400 }
      );
    }

    // Start the background campaign sending job
    whatsappManager.startJob(contacts, template);

    return NextResponse.json({
      success: true,
      message: 'Messaging campaign started in background.',
    });
  } catch (error: any) {
    console.error('Error starting messaging campaign:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to start messaging campaign.' },
      { status: 500 }
    );
  }
}
