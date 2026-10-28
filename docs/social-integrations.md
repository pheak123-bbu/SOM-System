# Social-channel integration status

The application currently has internal channel names and a `ChannelConnection` state record. Facebook Messenger, TikTok and Telegram are displayed as **Not connected** unless a future verified integration is implemented. The development simulator is not an integration and never sends a message to a platform.

No credentials are bundled. Optional environment-variable placeholders are documented in `.env.example`; setting a token alone must never be treated as verification or permission.

## Work required before connecting real accounts

- Facebook Messenger: register/configure a Meta app and Page, obtain required permissions and tokens, validate webhook signatures and verification challenges, and implement idempotent event ingestion under Meta's current platform requirements.
- TikTok: confirm account/app eligibility and current official API scopes. TikTok Shop order access is not equivalent to direct-message access. Do not claim personal inbox access without an official supported API permission.
- Telegram: implement the official Bot API for messages addressed to a configured bot. A bot cannot read all messages from a seller's personal account by default.
- Store tokens encrypted at rest, expose connection state only after credential/permission verification, rotate/revoke them safely, and add per-provider retries, event idempotency, webhook replay protection, audit events and integration tests.

The application should continue to support manual orders when a channel is disconnected or a webhook/worker is unavailable.
