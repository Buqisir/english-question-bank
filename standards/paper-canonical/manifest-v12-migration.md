# Manifest v12 migration

Manifest v12 changes only the current output-authority closure. New canonical
publications bind `consumer-contract-v2`, Screen v12, and Print/PDF v13. The
live consumer registry therefore contains exactly the two supported output
classes and cannot resolve a generated-DOCX consumer identity.

Manifest v1-v11 remain immutable authority closures for reading existing
publications. That parse-only compatibility cannot seal new generated-DOCX
authority, generate OOXML, or expose an output route.

DOCX source admission is unchanged. Source validation, immutable capture,
embedded-media extraction, shape conversion through input-side LibreOffice,
and figure publication continue to belong to the import path.
