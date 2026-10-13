import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
      <h1>360 Photobooth</h1>
      <Link href="/camera">
        Camera app<small>Open on the device that films</small>
      </Link>
      <Link href="/register">
        Registration app<small>Open on the device guests use</small>
      </Link>
    </main>
  );
}
