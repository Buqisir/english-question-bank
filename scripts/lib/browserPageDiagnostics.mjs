// Attach before navigation; successful marker waits remain silent.
export function capturePageDiagnostics(page) {
  const events = []
  let droppedEvents = 0
  const record = (event) => {
    if (events.length === 100) {
      events.shift()
      droppedEvents += 1
    }
    events.push({ at: new Date().toISOString(), ...event })
  }
  page.on('pageerror', (error) => record({
    type: 'pageerror',
    message: error.message,
    stack: error.stack,
  }))
  page.on('response', (response) => {
    if (response.status() >= 400) record({
      type: 'response',
      status: response.status(),
      url: response.url(),
    })
  })
  page.on('requestfailed', (request) => record({
    type: 'requestfailed',
    url: request.url(),
    failure: request.failure()?.errorText,
  }))
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) record({
      type: 'navigation',
      url: frame.url(),
    })
  })
  return {
    async waitForMarker(selector) {
      try {
        await page.locator(selector).waitFor()
      } catch (error) {
        if (error.name === 'TimeoutError') {
          console.error('BROWSER MARKER TIMEOUT ' + JSON.stringify({
            url: page.url(),
            selector,
            droppedEvents,
            events,
          }))
        }
        throw error
      }
    },
  }
}
