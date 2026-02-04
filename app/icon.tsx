import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#00ff88",
          textShadow: "0 0 8px #00ff88",
          borderRadius: 6,
        }}
      >
        E
      </div>
    ),
    { ...size }
  );
}
