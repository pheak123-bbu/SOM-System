import https from "node:https";

export interface TelegramApiResponse<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Executes a request to the Telegram Bot API over HTTPS with IPv4 forced.
 * 
 * In Docker / WSL2 environments, standard `fetch()` can hang or fail with
 * ETIMEDOUT / ENETUNREACH when trying IPv6 (AAAA) addresses published by Telegram.
 * This client forces IPv4 (`family: 4`) and enforces timeouts.
 */
export async function callTelegramApi<T = any>(
  botToken: string,
  endpoint: string,
  payload?: Record<string, any>,
  timeoutMs = 12000
): Promise<TelegramApiResponse<T>> {
  const cleanToken = botToken.replace(/^bot/i, "").trim();
  const url = `https://api.telegram.org/bot${cleanToken}/${endpoint}`;
  const data = payload ? JSON.stringify(payload) : null;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: payload ? "POST" : "GET",
        headers: {
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data!),
              }
            : {}),
        },
        family: 4, // Enforce IPv4 to bypass Docker WSL2 IPv6 unreachable issues
        timeout: timeoutMs,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed);
          } catch {
            reject(new Error(`Failed to parse Telegram API response: ${raw.slice(0, 200)}`));
          }
        });
      }
    );

    req.on("error", (err) => {
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Telegram API request to ${endpoint} timed out after ${timeoutMs}ms`));
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}
