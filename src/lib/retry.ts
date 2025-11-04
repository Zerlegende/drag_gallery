/**
 * Retry Utility für serverless Services (Railway Cold Starts)
 * 
 * Wenn Services wie MinIO oder PostgreSQL im Serverless-Modus laufen,
 * können sie beim ersten Request "schlafen" und brauchen Zeit zum Aufwachen.
 * Diese Utility-Funktion versucht automatisch mehrmals, bevor ein Fehler geworfen wird.
 */

export interface RetryOptions {
  /**
   * Maximale Anzahl der Versuche (inklusive dem ersten Versuch)
   * @default 5
   */
  maxAttempts?: number;

  /**
   * Initiales Delay in Millisekunden vor dem ersten Retry
   * @default 1000 (1 Sekunde)
   */
  initialDelay?: number;

  /**
   * Multiplikator für exponential backoff
   * @default 1.5
   */
  backoffMultiplier?: number;

  /**
   * Maximales Delay zwischen Versuchen in Millisekunden
   * @default 10000 (10 Sekunden)
   */
  maxDelay?: number;

  /**
   * Callback der bei jedem Retry aufgerufen wird
   */
  onRetry?: (error: Error, attempt: number) => void;

  /**
   * Funktion die entscheidet ob ein Fehler einen Retry rechtfertigt
   * @default Prüft auf Netzwerk- und Verbindungsfehler
   */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Standard-Funktion die entscheidet ob ein Fehler einen Retry rechtfertigt
 */
function defaultShouldRetry(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Typische Cold Start / Verbindungsfehler
  const retryableErrors = [
    'econnrefused',      // Verbindung abgelehnt (Service noch nicht bereit)
    'econnreset',        // Verbindung zurückgesetzt
    'etimedout',         // Timeout
    'socket hang up',    // Socket closed
    'network error',     // Netzwerkfehler
    'connection terminated', // PostgreSQL: Verbindung beendet
    'connection lost',   // MySQL/PostgreSQL
    'connect econnrefused', // Node.js Connection Error
    'connection timeout', // Timeout beim Verbinden
    'nosuchbucket',      // MinIO: Bucket existiert noch nicht (Service startet)
    'service unavailable', // Service nicht verfügbar
    '503',               // HTTP 503 Service Unavailable
    'epipe',             // Broken pipe
  ];

  return retryableErrors.some(pattern => message.includes(pattern));
}

/**
 * Sleep Utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Führt eine asynchrone Operation mit automatischen Retries aus
 * 
 * @example
 * ```ts
 * const result = await withRetry(
 *   async () => await pool.query('SELECT * FROM users'),
 *   { maxAttempts: 5, initialDelay: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 5,
    initialDelay = 1000,
    backoffMultiplier = 1.5,
    maxDelay = 10000,
    onRetry,
    shouldRetry = defaultShouldRetry,
  } = options;

  let lastError: Error;
  let currentDelay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Letzter Versuch oder Fehler ist nicht retry-fähig
      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      // Callback für Logging
      if (onRetry) {
        onRetry(lastError, attempt);
      } else {
        // Default logging in development
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[Retry] Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. ` +
            `Retrying in ${currentDelay}ms...`
          );
        }
      }

      // Warten vor dem nächsten Versuch
      await sleep(currentDelay);

      // Exponential backoff für nächstes Delay
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Wrapper für Datenbankoperationen mit optimierten Retry-Einstellungen
 */
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return withRetry(operation, {
    maxAttempts: 5,
    initialDelay: 1000,
    backoffMultiplier: 1.5,
    maxDelay: 8000,
    ...options,
  });
}

/**
 * Wrapper für Storage-Operationen (MinIO/S3) mit optimierten Retry-Einstellungen
 */
export async function withStorageRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return withRetry(operation, {
    maxAttempts: 5,
    initialDelay: 1000,
    backoffMultiplier: 1.5,
    maxDelay: 8000,
    ...options,
  });
}
