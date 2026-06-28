import { NextRequest, NextResponse } from 'next/server';
import { whatsappManager } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json();

    if (!action) {
      return NextResponse.json({ error: 'Action parameter is required.' }, { status: 400 });
    }

    switch (action) {
      case 'pause':
        whatsappManager.pauseJob();
        return NextResponse.json({ success: true, message: 'Campaign paused.' });
      case 'resume':
        if (whatsappManager.state !== 'READY') {
          return NextResponse.json(
            { error: 'WhatsApp client is not connected.' },
            { status: 400 }
          );
        }
        whatsappManager.resumeJob();
        return NextResponse.json({ success: true, message: 'Campaign resumed.' });
      case 'stop':
        whatsappManager.stopJob();
        return NextResponse.json({ success: true, message: 'Campaign stopped.' });
      case 'logout':
        await whatsappManager.logout();
        return NextResponse.json({ success: true, message: 'Logged out of WhatsApp successfully.' });
      case 'reconnect':
        await whatsappManager.destroy();
        // Fire initialization asynchronously
        whatsappManager.initialize();
        return NextResponse.json({ success: true, message: 'Reinitializing WhatsApp client.' });
      default:
        return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error controlling campaign:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to perform action.' },
      { status: 500 }
    );
  }
}
