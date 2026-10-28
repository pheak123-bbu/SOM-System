# AI order-detection workflow

## Safety boundary

AI identifies possible intent; it does not establish customer consent. `PURCHASE_INTENT` and `PURCHASE_CONFIRMED` are distinct classifications. Every provider response is required to set `requiresSellerReview: true`, validated with Zod, and rejected if it cites a message ID outside its input context. Only catalogue-backed product/variant names are resolved to database IDs. AI prices and totals are never persisted as order prices.

An eligible customer message is stored together with a `DetectionJob` before queue publication. The simulator returns a warning and marks the persisted job failed if Redis is unavailable, so a seller can retry it later. BullMQ retries transient worker errors with exponential backoff. Processing matches suggestions to a job idempotently. Non-purchase classifications finish without generating order suggestions.

The seller can mark an item as not an order, duplicate, dismiss it, or explicitly match extracted products/variants and create a **draft** through the shared order service. A draft is not automatically confirmed. Normal order constraints and server-side pricing still apply.

## Development simulation

The authenticated endpoint `POST /api/simulator/messages` only works when `NODE_ENV` is not `production`. It stores customer-originated and seller-originated messages in the internal conversation model. The conversations UI labels the simulator and does not send outbound messages. Simulated user input is not a real social-platform integration.

Example:

```json
{
  "customerId": "customer-record-id",
  "channel": "FACEBOOK",
  "externalConversationId": "demo-thread-1",
  "externalMessageId": "demo-message-1",
  "senderType": "CUSTOMER",
  "body": "ខ្ញុំចង់បានមួយ។ តើអាចដឹកទៅទួលគោកបានទេ?"
}
```

Customer messages are persisted before an AI job is published. The seller can continue to manage orders even when Redis or Ollama is unavailable.

## Configure Ollama

Set server-only `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://ollama:11434`, and a model name in `AI_MODEL`. The Compose `ai` profile is optional. Model selection is intentionally deployment-specific. Test a model against representative labelled Khmer, English and mixed-language messages before relying on suggestions. No accuracy, recall, or false-positive rate is currently claimed.

## Next evaluation work

Create a consent-reviewed and labelled dataset that covers price-only questions, comparisons, acknowledgements, details-missing intent, contextual yes/no confirmations, modifications, cancellations and ambiguous Khmer-English messages. Track false positives, false negatives, missing-field accuracy and evidence-reference correctness by language before deployment. Do not use raw private customer inboxes as a test dataset without consent and suitable data controls.
