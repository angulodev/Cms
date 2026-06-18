// ── Themes ──────────────────────────────────────────
export const THEMES = [
  {
    id: 'default',
    name: 'Océano',
    desc: 'Azul marino clásico',
    primary:  '#1e293b',
    accent:   '#3b82f6',
    success:  '#10b981',
    warning:  '#f59e0b',
    surface:  '#f7f9fb',
  },
  {
    id: 'slate',
    name: 'Pizarra',
    desc: 'Gris profesional',
    primary:  '#1e293b',
    accent:   '#6366f1',
    success:  '#10b981',
    warning:  '#f59e0b',
    surface:  '#f8fafc',
  },
  {
    id: 'emerald',
    name: 'Esmeralda',
    desc: 'Verde corporativo',
    primary:  '#064e3b',
    accent:   '#059669',
    success:  '#10b981',
    warning:  '#f59e0b',
    surface:  '#f0fdf4',
  },
  {
    id: 'rose',
    name: 'Rosa',
    desc: 'Moderno y vibrante',
    primary:  '#881337',
    accent:   '#e11d48',
    success:  '#10b981',
    warning:  '#f59e0b',
    surface:  '#fff1f2',
  },
  {
    id: 'dark',
    name: 'Oscuro',
    desc: 'Modo noche',
    primary:  '#f8fafc',
    accent:   '#60a5fa',
    success:  '#34d399',
    warning:  '#fbbf24',
    surface:  '#0f172a',
    dark: true,
  },
  {
    id: 'purple',
    name: 'Violeta',
    desc: 'Creativo y moderno',
    primary:  '#3b0764',
    accent:   '#9333ea',
    success:  '#10b981',
    warning:  '#f59e0b',
    surface:  '#faf5ff',
  },
]

export function applyTheme(theme) {
  const root = document.documentElement
  root.style.setProperty('--primary', theme.primary)
  root.style.setProperty('--accent',  theme.accent)
  root.style.setProperty('--success', theme.success)
  root.style.setProperty('--warning', theme.warning)
  root.style.setProperty('--surface', theme.surface)

  if (theme.dark) {
    root.style.setProperty('--surface-bright',  '#1e293b')
    root.style.setProperty('--border',          '#334155')
    root.style.setProperty('--text-primary',    '#f1f5f9')
    root.style.setProperty('--text-secondary',  '#94a3b8')
    root.style.setProperty('--text-muted',      '#64748b')
    root.style.setProperty('--accent-bg',       '#1e3a5f')
    root.style.setProperty('--success-bg',      '#064e3b')
    root.style.setProperty('--warning-bg',      '#451a03')
    root.style.setProperty('--error-bg',        '#450a0a')
    root.style.setProperty('--purple-bg',       '#2e1065')
    root.style.setProperty('--secondary',       '#94a3b8')
    // Override hardcoded whites/shadows for dark mode
    root.setAttribute('data-theme', 'dark')
  } else {
    root.removeAttribute('data-theme')
    root.style.setProperty('--surface-bright',  '#ffffff')
    root.style.setProperty('--border',          '#e2e8f0')
    root.style.setProperty('--text-primary',    '#1e293b')
    root.style.setProperty('--text-secondary',  '#64748b')
    root.style.setProperty('--text-muted',      '#94a3b8')
    root.style.setProperty('--accent-bg',       '#eff6ff')
    root.style.setProperty('--success-bg',      '#d1fae5')
    root.style.setProperty('--warning-bg',      '#fef3c7')
    root.style.setProperty('--error-bg',        '#fee2e2')
    root.style.setProperty('--purple-bg',       '#ede9fe')
  }
}
