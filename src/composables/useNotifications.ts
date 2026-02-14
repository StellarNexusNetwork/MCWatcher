export function playAlertTone(enabled: boolean) {
  if (!enabled) {
    return
  }
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext
    }).webkitAudioContext

    if (!AudioContextCtor) {
      return
    }

    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, context.currentTime)

    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.25)
    oscillator.onended = () => {
      void context.close()
    }
  } catch {
    // no-op for unsupported browsers
  }
}

export async function ensureNotificationPermission(enabled: boolean) {
  if (!enabled || !('Notification' in window)) {
    return 'unsupported'
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }
  if (Notification.permission === 'denied') {
    return 'denied'
  }
  return Notification.requestPermission()
}

export async function notifySystem(title: string, body: string, enabled: boolean) {
  const permission = await ensureNotificationPermission(enabled)
  if (permission !== 'granted') {
    return
  }
  new Notification(title, { body })
}
