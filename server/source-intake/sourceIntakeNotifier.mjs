// Compatibility for retained source-ledger callers. Old URL/secret settings must
// never reactivate automatic intake; imports now start explicitly in Amp.
export function createSourceIntakeNotifier() {
  return {
    async notify() {
      return { state: 'skipped', reason: 'automatic_intake_retired' }
    },
  }
}
