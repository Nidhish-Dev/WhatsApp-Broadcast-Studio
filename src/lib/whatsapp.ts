import { Client, LocalAuth } from 'whatsapp-web.js';
import QRCode from 'qrcode';

export type WhatsappState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'QR_READY'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'READY'
  | 'FAILURE';

export interface Contact {
  name: string;
  phone: string;
}

export interface LogEntry {
  timestamp: string;
  phone: string;
  name: string;
  status: 'success' | 'failed' | 'pending' | 'info';
  message?: string;
}

export interface SendJob {
  contacts: Contact[];
  template: string;
  currentIndex: number;
  status: 'idle' | 'sending' | 'paused' | 'completed' | 'stopped';
  logs: LogEntry[];
}

class WhatsappManager {
  public client: Client | null = null;
  public state: WhatsappState = 'DISCONNECTED';
  public qrCode: string = '';
  public errorMsg: string = '';
  public delayCountdown: { seconds: number; nextContactName: string } | null = null;
  
  public job: SendJob = {
    contacts: [],
    template: '',
    currentIndex: 0,
    status: 'idle',
    logs: []
  };

  private listeners: Set<(data: any) => void> = new Set();
  private isInitializing: boolean = false;

  constructor() {
    // Client is not initialized automatically to avoid running puppeteer on start if not needed.
  }

  public async initialize() {
    if (this.client || this.isInitializing) return;
    this.isInitializing = true;
    this.state = 'CONNECTING';
    this.errorMsg = '';
    this.broadcast();

    try {
      console.log('Initializing WhatsApp Client...');
      
      const isVercel = process.env.VERCEL === '1';
      const sessionPath = isVercel ? '/tmp/.wwebjs_auth' : './.wwebjs_auth';
      
      const puppeteerOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      };

      // Use local Google Chrome on macOS, but let Puppeteer resolve Chrome on Serverless Linux
      if (!isVercel) {
        puppeteerOptions.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      }

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'whatsapp-automation-session',
          dataPath: sessionPath
        }),
        puppeteer: puppeteerOptions
      });

      this.client.on('qr', async (qr) => {
        console.log('QR Code received');
        try {
          this.qrCode = await QRCode.toDataURL(qr);
          this.state = 'QR_READY';
          this.broadcast();
        } catch (err: any) {
          console.error('Error generating QR Code:', err);
        }
      });

      this.client.on('authenticated', () => {
        console.log('WhatsApp Client Authenticated');
        this.state = 'AUTHENTICATED';
        this.qrCode = '';
        this.broadcast();
      });

      this.client.on('auth_failure', (msg) => {
        console.error('WhatsApp Authentication Failure:', msg);
        this.state = 'FAILURE';
        this.errorMsg = msg;
        this.broadcast();
      });

      this.client.on('ready', () => {
        console.log('WhatsApp Client is Ready!');
        this.state = 'READY';
        this.qrCode = '';
        this.broadcast();
      });

      this.client.on('disconnected', (reason) => {
        console.log('WhatsApp Client Disconnected:', reason);
        this.state = 'DISCONNECTED';
        this.qrCode = '';
        this.broadcast();
      });

      await this.client.initialize();
    } catch (error: any) {
      console.error('Error initializing WhatsApp client:', error);
      this.state = 'FAILURE';
      this.errorMsg = error?.message || 'Failed to start browser';
      this.client = null;
      this.broadcast();
    } finally {
      this.isInitializing = false;
    }
  }

  public async destroy() {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (err) {
        console.error('Error destroying client:', err);
      }
      this.client = null;
    }
    this.state = 'DISCONNECTED';
    this.qrCode = '';
    this.delayCountdown = null;
    this.broadcast();
  }

  public async logout() {
    if (this.client) {
      try {
        await this.client.logout();
      } catch (err) {
        console.error('Error logging out:', err);
        await this.destroy();
      }
    }
    this.state = 'DISCONNECTED';
    this.qrCode = '';
    this.broadcast();
  }

  public addListener(listener: (data: any) => void) {
    this.listeners.add(listener);
    listener(this.getData());
  }

  public removeListener(listener: (data: any) => void) {
    this.listeners.delete(listener);
  }

  public broadcast() {
    const data = this.getData();
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        this.listeners.delete(listener);
      }
    });
  }

  public getData() {
    const successCount = this.job.logs.filter(l => l.status === 'success').length;
    const failedCount = this.job.logs.filter(l => l.status === 'failed').length;
    return {
      state: this.state,
      qrCode: this.qrCode,
      errorMsg: this.errorMsg,
      delayCountdown: this.delayCountdown,
      job: {
        status: this.job.status,
        currentIndex: this.job.currentIndex,
        totalContacts: this.job.contacts.length,
        contacts: this.job.contacts,
        template: this.job.template,
        successCount,
        failedCount,
        logs: this.job.logs.slice(-50)
      }
    };
  }

  private addLog(phone: string, name: string, status: LogEntry['status'], message?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      phone,
      name,
      status,
      message
    };
    this.job.logs.push(entry);
    console.log(`[Log] [${status.toUpperCase()}] ${name} (${phone}): ${message || ''}`);
  }

  public startJob(contacts: Contact[], template: string) {
    if (this.job.status === 'sending') {
      throw new Error('A campaign is already running');
    }
    this.job = {
      contacts,
      template,
      currentIndex: 0,
      status: 'sending',
      logs: []
    };
    this.addLog('', '', 'info', `Started new campaign to ${contacts.length} contacts`);
    this.broadcast();
    this.runSendingLoop();
  }

  public pauseJob() {
    if (this.job.status !== 'sending') return;
    this.job.status = 'paused';
    this.delayCountdown = null;
    this.addLog('', '', 'info', 'Campaign paused by user');
    this.broadcast();
  }

  public resumeJob() {
    if (this.job.status !== 'paused') return;
    this.job.status = 'sending';
    this.addLog('', '', 'info', 'Campaign resumed by user');
    this.broadcast();
    this.runSendingLoop();
  }

  public stopJob() {
    if (this.job.status === 'idle') return;
    this.job.status = 'stopped';
    this.delayCountdown = null;
    this.addLog('', '', 'info', 'Campaign stopped by user');
    this.broadcast();
  }

  private async runSendingLoop() {
    while (this.job.status === 'sending' && this.job.currentIndex < this.job.contacts.length) {
      const contact = this.job.contacts[this.job.currentIndex];
      
      if (this.state !== 'READY' || !this.client) {
        this.job.status = 'paused';
        this.addLog(contact.phone, contact.name, 'failed', 'Client disconnected during campaign');
        this.broadcast();
        break;
      }

      let rawPhone = contact.phone.replace(/\D/g, '');
      if (!rawPhone) {
        this.addLog(contact.phone, contact.name, 'failed', 'Invalid phone number format');
        this.job.currentIndex++;
        this.broadcast();
        continue;
      }

      // Prepend India's country code (+91) if number is exactly 10 digits
      if (rawPhone.length === 10) {
        rawPhone = '91' + rawPhone;
      }

      const whatsappId = `${rawPhone}@c.us`;

      this.addLog(contact.phone, contact.name, 'pending', 'Sending message...');
      this.broadcast();

      try {
        const msgContent = this.job.template.replace(/{name}/gi, contact.name);
        await this.client.sendMessage(whatsappId, msgContent);
        this.addLog(contact.phone, contact.name, 'success', 'Message sent successfully');
      } catch (err: any) {
        console.error(`Error sending message to ${contact.name}:`, err);
        this.addLog(contact.phone, contact.name, 'failed', err?.message || 'Error occurred while sending');
      }

      this.job.currentIndex++;
      this.broadcast();

      if (this.job.currentIndex >= this.job.contacts.length) {
        this.job.status = 'completed';
        this.addLog('', '', 'info', 'Campaign completed successfully!');
        this.broadcast();
        break;
      }

      if (this.job.status === 'sending') {
        const delaySeconds = Math.floor(Math.random() * (30 - 15 + 1)) + 15;
        const nextContact = this.job.contacts[this.job.currentIndex];
        
        for (let s = delaySeconds; s > 0; s--) {
          if (this.job.status !== 'sending') {
            this.delayCountdown = null;
            break;
          }
          this.delayCountdown = { seconds: s, nextContactName: nextContact.name };
          this.broadcast();
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        this.delayCountdown = null;
        this.broadcast();
      }
    }
  }
}

declare global {
  var whatsappManager: WhatsappManager | undefined;
}

export const whatsappManager = global.whatsappManager || new WhatsappManager();
if (process.env.NODE_ENV !== 'production') {
  global.whatsappManager = whatsappManager;
}
