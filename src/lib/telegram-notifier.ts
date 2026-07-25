/**
 * Telegram Upload-Benachrichtigungen (gesammelt)
 *
 * Kein Cronjob: Der Timer existiert nur dann, wenn tatsächlich Uploads
 * anstehen. Beim ersten Upload wird ein Fenster von TELEGRAM_BATCH_MINUTES
 * geöffnet, alle Uploads in diesem Fenster werden gesammelt und danach als
 * eine Nachricht verschickt. Anschließend schaltet sich der Timer wieder ab,
 * bis der nächste Upload kommt.
 */

import { env } from "@/lib/env";
import { withRetry } from "@/lib/retry";

export type UploadEvent = {
  username: string;
  filename: string;
  /** Endgültig belegter Speicher nach der AVIF-Konvertierung */
  size: number | null;
  /** Größe der hochgeladenen Datei vor der Konvertierung */
  originalSize?: number | null;
};

const TELEGRAM_API = "https://api.telegram.org";

/** Maximale Anzahl Dateinamen, die pro User gelistet werden */
const MAX_FILES_PER_USER = 8;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

function pluralBilder(count: number) {
  return count === 1 ? "1 Bild" : `${count} Bilder`;
}

class TelegramUploadNotifier {
  private pending: UploadEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private windowStartedAt: number | null = null;

  private get config() {
    const serverEnv = env.server();
    const chatIds = (serverEnv.TELEGRAM_CHAT_ID ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    return {
      enabled:
        serverEnv.TELEGRAM_NOTIFY_ENABLED === "true" &&
        Boolean(serverEnv.TELEGRAM_BOT_TOKEN) &&
        chatIds.length > 0,
      token: serverEnv.TELEGRAM_BOT_TOKEN ?? "",
      chatIds,
      windowMs: serverEnv.TELEGRAM_BATCH_MINUTES * 60 * 1000,
    };
  }

  /**
   * Upload registrieren. Startet das Sammel-Fenster, falls noch keins läuft.
   * Wirft nie – ein kaputter Bot darf keinen Upload kaputt machen.
   */
  record(event: UploadEvent) {
    try {
      const { enabled, windowMs } = this.config;
      if (!enabled) return;

      this.pending.push(event);

      if (this.timer) return;

      this.windowStartedAt = Date.now();
      this.timer = setTimeout(() => {
        void this.flush();
      }, windowMs);

      // Timer darf den Node-Prozess nicht am Leben halten
      this.timer.unref?.();
    } catch (error) {
      console.error("[Telegram] Upload konnte nicht registriert werden:", error);
    }
  }

  /**
   * Fenster abschließen: Nachricht bauen, verschicken, Timer abschalten.
   * Uploads, die währenddessen reinkommen, öffnen ein neues Fenster.
   */
  private async flush() {
    this.timer = null;
    this.windowStartedAt = null;

    const batch = this.pending;
    this.pending = [];

    if (batch.length === 0) return;

    try {
      await this.send(this.buildMessage(batch));
    } catch (error) {
      console.error("[Telegram] Report konnte nicht gesendet werden:", error);
    }
  }

  private buildMessage(batch: UploadEvent[]) {
    const byUser = new Map<string, UploadEvent[]>();
    for (const event of batch) {
      const list = byUser.get(event.username);
      if (list) {
        list.push(event);
      } else {
        byUser.set(event.username, [event]);
      }
    }

    const minutes = this.config.windowMs / 60_000;
    const totalSize = batch.reduce((sum, event) => sum + (event.size ?? 0), 0);
    const totalOriginal = batch.reduce(
      (sum, event) => sum + (event.originalSize ?? event.size ?? 0),
      0,
    );

    const lines: string[] = [
      `📸 <b>${pluralBilder(batch.length)}</b> in den letzten ${minutes} Min. fertig verarbeitet`,
    ];

    if (totalSize > 0) {
      // Nur wenn wirklich komprimiert wurde – AVIF-Uploads gehen unverändert durch
      const saved = totalOriginal - totalSize;
      const percent = totalOriginal > 0 ? Math.round((saved / totalOriginal) * 100) : 0;
      lines.push(
        saved > 0
          ? `💾 ${formatBytes(totalSize)} belegt (aus ${formatBytes(totalOriginal)}, −${percent}%)`
          : `💾 ${formatBytes(totalSize)} belegt`,
      );
    }

    lines.push("");

    const sortedUsers = [...byUser.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    );

    for (const [username, events] of sortedUsers) {
      const userSize = events.reduce((sum, event) => sum + (event.size ?? 0), 0);
      lines.push(
        `👤 <b>${escapeHtml(username)}</b> — ${pluralBilder(events.length)}` +
          (userSize > 0 ? ` (${formatBytes(userSize)})` : ""),
      );

      for (const event of events.slice(0, MAX_FILES_PER_USER)) {
        lines.push(`   • ${escapeHtml(event.filename)}`);
      }

      const rest = events.length - MAX_FILES_PER_USER;
      if (rest > 0) {
        lines.push(`   • … und ${rest} weitere`);
      }
    }

    // Telegram-Limit sind 4096 Zeichen
    const message = lines.join("\n");
    return message.length > 4000 ? `${message.slice(0, 3990)}\n…` : message;
  }

  private async send(text: string) {
    const { token, chatIds } = this.config;

    for (const chatId of chatIds) {
      await withRetry(
        async () => {
          const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            }),
          });

          if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`Telegram API ${response.status}: ${body.slice(0, 200)}`);
          }
        },
        {
          maxAttempts: 3,
          initialDelay: 2000,
          // Bei Telegram lohnt sich ein Retry auch bei HTTP-Fehlern
          shouldRetry: (error) => !/Telegram API 4(0[0-9]|1[0-9])/.test(error.message),
        },
      ).catch((error) => {
        console.error(`[Telegram] Senden an ${chatId} fehlgeschlagen:`, error);
      });
    }
  }

  getStatus() {
    return {
      active: this.timer !== null,
      pending: this.pending.length,
      windowStartedAt: this.windowStartedAt,
    };
  }
}

// Singleton-Instanz
export const telegramNotifier = new TelegramUploadNotifier();
