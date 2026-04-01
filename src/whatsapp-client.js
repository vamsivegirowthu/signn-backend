import { makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';

import pino from 'pino';
import QRCode from 'qrcode';

export default class WhatsAppClient {
  constructor() {
    this.sock = null;

    this.onQR = null;
    this.onReady = null;
    this.onDisconnect = null;
  }

  async initialize() {

    // 🔥 prevent multiple connections

    const { state, saveCreds } = await useMultiFileAuthState('./wa-session');
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
    });

    this.sock.ev.on('connection.update', (update) => {
      console.log('connection.update:', JSON.stringify(update, null, 2));

      const { connection, qr, lastDisconnect } = update;

      // ✅ QR handling
      if (qr) {
        console.log("📡 QR GENERATED");

        QRCode.toDataURL(qr)
          .then((url) => {
            console.log("✅ QR READY");
           this.io.emit("qr_update", { qr });
          })
          .catch((err) => console.error(err));
      }

      // ✅ connected
      if (connection === 'open') {
        console.log("✅ WhatsApp Connected");
        this.onReady && this.onReady();
      }

      // ✅ disconnected
      if (connection === 'close') {
        console.log('❌ WhatsApp Disconnected');

        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

        console.log('🔁 Reconnecting:', shouldReconnect);

        // 🔥 reset socket before reconnect
        this.sock = null;

        if (shouldReconnect) {
          console.log("♻️ Reconnecting...");
          setTimeout(() => this.initialize(), 3000);
        }

        this.onDisconnect && this.onDisconnect(lastDisconnect);
      }
    });

    this.sock.ev.on('creds.update', saveCreds);
  }

  async sendMessage(number, message) {
    if (!this.sock || !this.sock.user) {
      throw new Error("WhatsApp not ready");
    }

    // 🔥 DEBUG LOG (very important)
    console.log("Sending message:", message, typeof message);

    // 🔥 FIX: ensure string + fallback
    const safeMessage = message ? String(message) : "Test message";

    return this.sock.sendMessage(number + "@s.whatsapp.net", {
  image: { url: "http://localhost:3000/signn-logo.png" },
  caption: safeMessage
  });
  }

  async logout() {
    if (this.sock) {
      await this.sock.logout();
    }
  }
}
