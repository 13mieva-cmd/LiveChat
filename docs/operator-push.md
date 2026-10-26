# Operator Web Push

Push is sent only for newly saved visitor messages, never for drafts, edits or operator replies. Payloads contain the site name and a generic new-message notice, not message text or visitor details.

Startup creates lc_push_keys, lc_push_subscriptions and lc_push_jobs without changing existing chat tables. VAPID keys are generated once; the private key is AES-256-GCM encrypted using a key derived from JWT_SECRET. Keep JWT_SECRET stable and back up the database. It is never returned to the browser. Only the public VAPID key is exposed to authenticated operators.

Supported subscription endpoints are Apple Web Push, Google FCM and Mozilla Push. Subscriptions are bound to the authenticated operator. Logout removes the current subscription; disabling notifications also unsubscribes the browser.

The database queue retries transient failures up to eight times, drops expired jobs after 24 hours, and removes invalid subscriptions on HTTP 404/410. Push is best effort; a crash after successful delivery but before job deletion can duplicate a notification. Queue insertion failure is logged and does not block chat delivery.

On iOS 16.4 or later, add /assets/operator.html to the Home Screen, launch it there, log in and use Enable notifications in the dialog list. Use Test notification, then lock the device and send a visitor message from another device. Check notification permissions, Lock Screen alerts, Focus and sound settings. Device receipt and sound must be tested on a real phone.

No fetch handler or offline cache is installed. The service worker scope is /assets/. The SVG icon may fall back to a system-generated icon on iOS.

This change has not been build-tested or device-tested in the assistant environment. Verify Docker build and Railway deployment before using it in production.
