// Keep the retired entrypoint inert even when an Orb retains the old enable flag.
// This does not unregister a previously durable webhook; reconcile that separately.
export const description = 'Retired source-intake webhook. Start paper imports explicitly in Amp.'

export default async function sourceIntakeWakeupPlugin(amp) {
  amp.logger.log('Automatic source intake is retired; no webhook or worker was registered.')
}
