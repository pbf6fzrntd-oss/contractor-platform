/** Artwork for the app icon (a chat bubble), rendered to PNG by app/icon.tsx. */
export function AppIconImage({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#047857",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="white">
        <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      </svg>
    </div>
  );
}
