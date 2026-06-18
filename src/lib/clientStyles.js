// ── Client Style Profiles (localStorage) ─────────────────────────
const KEY = 'alp_client_styles'

export const DEFAULT_STYLE = {
  id:          'default',
  name:        'Por defecto',
  clientName:  'Area Leader Pro',
  primaryColor: '#1e293b',
  accentColor:  '#3b82f6',
  secondaryColor: '#64748b',
  fontFamily:   'Segoe UI',
  logoText:     'ALP',
  footerText:   'Generado con Area Leader Pro',
  showCoverPage: true,
  showRiskSummary: true,
  showMilestones: true,
  showPlanner: true,
  createdAt:    new Date().toISOString(),
  isDefault:    true,
}

export function getClientStyles() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]')
    return saved.length ? saved : [DEFAULT_STYLE]
  } catch { return [DEFAULT_STYLE] }
}

export function saveClientStyle(style) {
  const styles = getClientStyles().filter(s => s.id !== 'default')
  const existing = styles.findIndex(s => s.id === style.id)
  if (existing >= 0) styles[existing] = style
  else styles.unshift(style)
  localStorage.setItem(KEY, JSON.stringify([DEFAULT_STYLE, ...styles]))
  return styles
}

export function deleteClientStyle(id) {
  const styles = getClientStyles().filter(s => s.id !== id && s.id !== 'default')
  localStorage.setItem(KEY, JSON.stringify([DEFAULT_STYLE, ...styles]))
  return [DEFAULT_STYLE, ...styles]
}

export function generateStyleId() {
  return 'style_' + Date.now()
}
