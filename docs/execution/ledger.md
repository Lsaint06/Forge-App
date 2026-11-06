# FORGE execution ledger

Plan: docs/superpowers/plans/2026-10-14-forge.md. Brief: docs/PRODUCT_SPEC.txt.

The owner explicitly authorized autonomous implementation and ordinary architectural decisions. Existing cloud checkout is isolated; a feature branch is used, without a worktree.

- Foundation/core: complete; initial commit d0465f7; SQLite and domain/catalog tests passed.
- Mobile flows: implemented; native export passed, physical execution outstanding.
- Cloud: real auth/transport/RLS source plus tested local protocol; live credentials unavailable.
- Final review: fresh independent reviewer identified four important defects. Fixed sync generation invalidation, cross-workout child ownership, notification form overwrite and recovery callback/update path. Added RED→GREEN regressions where locally exercisable; live recovery remains external validation.

Ruling: Atomic JSON aggregates are used for cloud transport while workout/template relationships remain normalized locally. This prevents partial sync; cost: normalized remote analytics/schema expansion remains incomplete.
Ruling: Cloud synchronization is explicit/manual, with durable pending records and bounded retry. Cost: cross-device changes require the user to synchronize; background/incremental sync remains future work.
Ruling: Use maintained SVG rendering with accessible interactive selectors instead of a larger chart dependency. Cost: specialized chart interactions and large-history decimation require further work.
Ruling: Optional photos, barcode services, native distribution and remote push are omitted rather than simulated. Cost: these scope requirements remain unimplemented.

No review findings were dismissed as minor. Live Supabase, native permission/background behavior and physical iPhone verification are not claimed complete. See IMPLEMENTATION_STATUS.md.

- Additional UI regression: lifetime first-PR achievement no longer disappears when its source workout is outside the selected chart range. Test reproduced failure before fix.

- Additional measurement regression: percentage entries cannot exceed 100 and recognized Bodyweight values require canonical kg, preventing mislabeled dashboard mass. Test reproduced acceptance of invalid data before fix.
