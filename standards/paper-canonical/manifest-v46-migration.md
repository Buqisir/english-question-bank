# Manifest v46 migration note

Manifest v46 is a scoped additive authority for Teacher-confirmed Reading Figure
Options. It keeps `canonicalAuthorityRef` at v36 and does not change any prior
manifest, profile, Reading v1 family, or Consumer Contract bytes.

The successor binds Reading v2 and profile/Consumer Contract successors whose
only Reading change is the v2 family reference. A v46 publication may be sealed
only through the exact Ticket 01 visual confirmation seam. This authority does
not authorize Screen, Print, or PDF layout work, production mutation, or any
paper-specific migration.
