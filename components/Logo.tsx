import Image from "next/image";

/** "2026 Proud of you" logo. Dark artwork on a transparent background, so use it on light surfaces. */
export default function Logo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image src="/logo.png" alt="2026 Proud of you" width={911} height={154} priority={priority} className={`logo ${className}`} />
  );
}
