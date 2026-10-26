# Private chat photos: server stage

This commit adds photo APIs and storage only. It does not yet add upload buttons or render photos in the visitor/operator UI. Those must be connected in a separate commit. Until then the existing text chat is unchanged.

- POST /api/widget/photos uses siteKey and visitorToken, checks the allowed Origin and limits access to that visitor.
- POST /api/conversations/:id/photos requires an authenticated operator.
- Both endpoints take a UUID clientId and raw standard-base64 image data (not a data URL), capped at 1 MiB decoded. JPEG/PNG/WebP only; the server decodes and re-encodes as a static JPEG, strips source metadata, rotates and resizes to at most 1600 px.
- A photo and its message are saved atomically, with retry deduplication by conversation/clientId. Message bodies contain a photo marker referring to the message UUID. The frontend must render the marker as a protected thumbnail and hide ordinary text editing for photo messages.
- GET /api/photos/:id requires either operator Authorization plus X-Livechat-Conversation-Id, or X-Livechat-Site-Key plus X-Livechat-Visitor-Token and an allowed Origin. There are no public bearer URLs. Tokens must never be placed in image URLs.
- Images are bytea in lc_chat_photos, retained for 30 days. Cleanup runs at startup and every ten minutes; expired images cannot be fetched even before cleanup. The chat message remains after photo expiry.
- Default total photo quota is 200 MiB; PHOTO_STORAGE_MB may set 10–2048 MiB. Storage grows the existing PostgreSQL database and can affect its cost and backups. The quota counts image bytes, not all database/index/backup overhead. No external storage account or Railway volume is configured.
- Limits: six visitor upload requests/minute per IP and ten saved photos/hour per conversation; twelve operator requests/minute per IP and fifty saved photos/hour per operator.
- Visitor photo messages trigger the existing generic push notification with the conversation target. No image, filename or image contents are sent in push.

The Docker build, API authorization tests and real-device uploads have not been executed in the assistant environment. Verify them before connecting the UI.
