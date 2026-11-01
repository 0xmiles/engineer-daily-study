// Colors are CSS variables defined in src/renderer/src/index.css, so one class covers both light and dark themes.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`
const tone = (name) => ({ DEFAULT: token(name), soft: token(`${name}-soft`) })

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        paper: token('paper'),
        sidebar: token('sidebar'),
        surface: token('surface'),
        sunken: token('sunken'),
        scrim: token('scrim'),
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: { DEFAULT: token('ink'), muted: token('ink-muted'), faint: token('ink-faint') },
        accent: { DEFAULT: token('accent'), soft: token('accent-soft'), ink: token('accent-ink'), on: token('accent-on') },
        good: tone('good'),
        warn: tone('warn'),
        bad: tone('bad'),
        info: tone('info'),
        plum: tone('plum'),
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
