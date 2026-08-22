# CheckMate backend MVP

Run `npm run server` to start the Express and Socket.IO mock API.

Development accounts all use password `1234`: `tenant1`, `tenant2`, and `operatorA`.

The API includes embedded funnel events, consent evidence hashing, NICE/PASS and affiliation-email mock adapters, transparent weighted matching, a 30 minute ephemeral chat session, contract confirmation, digital agreements, mediation tickets, and 30/90-day feedback labels that nudge matching weights. `db/schema.sql` contains the PostgreSQL production model.

## Embed widget

```html
<div id="checkmate-widget"></div>
<script src="https://your-checkmate-host/checkmate-widget.js"
  data-operator-id="operator-a" data-room-id="101" data-mount="checkmate-widget"></script>
```
