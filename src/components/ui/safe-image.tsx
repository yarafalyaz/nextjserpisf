import Image from "next/image"
import type { ImgHTMLAttributes, CSSProperties } from "react"

interface SafeImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> {
  src: string
  alt: string
  width: number
  height: number
  priority?: boolean
  /** Fill the width of a responsive container while keeping aspect ratio. */
  responsive?: boolean
}

function isInternalImageSource(src: string): boolean {
  return src.startsWith("/")
}

export function SafeImage({ src, alt, width, height, className, style, responsive = false, ...rest }: SafeImageProps) {
  const responsiveStyle: CSSProperties | undefined = responsive
    ? { width: "100%", height: "auto", ...style }
    : style
  if (isInternalImageSource(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        style={responsiveStyle}
        unoptimized
        priority={rest.priority}
        loading={rest.loading}
        decoding={rest.decoding}
      />
    )
  }

  // For external URLs not listed in remotePatterns, fall back to native img.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={width} height={height} className={className} style={responsiveStyle} {...rest} />
}
