import { ImageResponse } from "next/og";
import { AppIconImage } from "@/components/app-icon-image";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<AppIconImage size={512} />, size);
}
