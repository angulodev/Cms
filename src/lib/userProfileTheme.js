// Utilidad de tema asociada al componente UserProfile.jsx (no usado actualmente
// en la app — UserPanel.jsx + lib/theme.js es el sistema de temas activo).
// Se mantiene separado para no romper imports existentes si algo lo referencia.

const THEMES = [
  { id: 'default', label: 'Default',    primary: '#1e293b', accent: '#3b82f6', surface: '#f7f9fb' },
  { id: 'ocean',   label: 'Océano',     primary: '#0f4c75', accent: '#0ea5e9', surface: '#f0f9ff' },
  { id: 'forest',  label: 'Bosque',     primary: '#14532d', accent: '#10b981', surface: '#f0fdf4' },
  { id: 'sunset',  label: 'Atardecer',  primary: '#7c2d12', accent: '#f97316', surface: '#fff7ed' },
  { id: 'grape',   label: 'Uva',        primary: '#3b0764', accent: '#8b5cf6', surface: '#faf5ff' },
  { id: 'slate',   label: 'Pizarra',    primary: '#0f172a', accent: '#64748b', surface: '#f8fafc' },
]

function applyTheme(theme) {
  const root = document.documentElement
  root.style.setProperty('--primary', theme.primary)
  root.style.setProperty('--accent',  theme.accent)
  root.style.setProperty('--surface', theme.surface)
  // Derive accent-bg from accent
  root.style.setProperty('--accent-bg', theme.accent + '18')
  localStorage.setItem('alp_theme', theme.id)
}

export function initTheme() {
  const saved = localStorage.getItem('alp_theme')
  if (saved) {
    const theme = THEMES.find(t => t.id === saved)
    if (theme) applyTheme(theme)
  }
}
