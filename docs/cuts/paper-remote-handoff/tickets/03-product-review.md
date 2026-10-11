# 03 — Product-first Owner review and simple recheck

Status: local Amp handoff and synthetic desktop/mobile preview implemented;
native clipboard/thread navigation checked; authenticated remote paper acceptance
pending; not shipped
Spec: [paper-remote-handoff](../spec.md)

## Outcome

The Owner opens an authenticated remote link and sees Screen immediately, can
choose a PDF or listen, and clicks “去 Amp 聊这份卷”. The button copies the paper
identity, exact viewed version and preview link, then opens its associated Amp
thread. The Owner pastes and chats. Recheck and confirmation also happen in Amp.

## Scope

Reuse the product PaperBrowse/PaperSurface and existing Review approval routes.
Keep current four product names. Do not introduce a renderer, web import UI,
dashboard, reports portal, chat approval authority or publication button.
There is no website feedback form, Send action, checklist or confirmation button.
The handoff names the exact viewed revision/publication, not a newer Candidate,
and does not invent a question or PDF page. No message is sent automatically.
Use the paper's explicit discussion-thread binding, never infer a worker from a
publication audit or an arbitrary current thread. Unbound papers offer copy only.
Clipboard denial offers manual text; blocked tabs offer an explicit thread link.

Avoid making source-heavy projection/rasterization part of routine reads.
Serve the frozen PDF bytes; preserve private session checks and response binding.
Server gates remain authoritative even when not shown as a checklist. Confirmation
in Amp is not permission to spoof an Owner session or remove scoped-publication
authorization. The technical approval route still needs an authorized implementation;
do not claim that sending a comment completes it.

## Acceptance

- Real authenticated desktop and phone-sized Screen; four exact PDF choices,
  audio range playback and existing print share the version identity.
- No source reports/receipt lists on the normal product page and no localhost
  dependency for the Owner's other device.
- Old or stale review cannot approve a new version; member/anonymous access
  cannot see private materials or approve; approval never publishes.
- Discussion followed by an explicitly started repair names the changed
  question/page. No mandatory issue-administration detour.
- Capture and inspect desktop/mobile button states, exact-version clipboard
  content, matching thread navigation, unbound, denied-copy and blocked-tab paths.

## Local evidence and limitations

Both the earlier form and its one-textarea replacement were rejected by the
Owner. The current UI is the Amp handoff button beside the product controls.
Discussion binding is explicitly associated by an authorized operator using
compare-and-set, never inferred from an upload audit header. Revision uploads cannot
silently reassign the thread. Existing papers need explicit association before
remote delivery; no real paper was bound by this implementation.

Finalization saves bundle/renderer-bound Screen data; ordinary reads do not
rebuild source projections. Frozen PDF/edition Print reads verify existing bytes.
File hashes use bounded buffers, including audio/source integrity checks. Reads
still perform integrity I/O; this is not a latency benchmark or eliminated I/O.

Earlier screenshots are historical, not evidence for the simplified UI. Synthetic
preview does not prove actual authentication, audio range requests, PDF bytes,
public promotion or production entry availability. Regression cases are written
but remain unrun before Ship. QA Ready: no for the remote Owner; only the local
synthetic preview exists.

The button frontend build passed. The earlier textarea screenshots and successful
send are historical evidence only, not verification of the current handoff.
Current desktop (1280px), phone (390px), denied-copy, blocked-popup and unbound
screenshots were inspected. Synthetic failure injection verified exact revision
text, copy-only behavior and the explicit continuation link. The readonly fallback
now grows with its content, with a viewport-height cap. Four PDF selections each
pointed to the viewed preview revision. This checked links, not PDF responses.

Initial native attempts stopped at the browser-control boundary. After the Owner
selected an authenticated browser profile, a real button click called native
clipboard.writeText with the viewed paper/revision/link and resolved successfully.
Its new tab reached the exact associated Amp thread, showing the authenticated
conversation with window.opener null. No message was sent. The success-state
screenshot was inspected; this proves the local synthetic handoff, not live paper
association or remotely accessible product custody.

Unused additions from the rejected form were removed: screenshot storage/read,
the freeform feedback endpoint and combined issue-closing approval. Existing
structured issues and approval gates remain; discussion never supplies authority.
