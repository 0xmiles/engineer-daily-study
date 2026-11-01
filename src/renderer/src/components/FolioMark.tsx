/** The app mark, a focal point on forest green. Its colors stay fixed in both themes, like the app icon in build/. */
export function FolioMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="23" fill="#2F5D4A" />
      <circle cx="50" cy="50" r="25" fill="none" stroke="#F6F4EF" strokeWidth="6" />
      <circle cx="50" cy="50" r="9" fill="#F6F4EF" />
    </svg>
  )
}
