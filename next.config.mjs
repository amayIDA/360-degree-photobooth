/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The browser only sees NEXT_PUBLIC_* variables, so also accept the plain names
  // (SUPABASE_URL, SUPABASE_ANON_KEY, BUCKET, CHANNEL) and expose them under the public names.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
    NEXT_PUBLIC_BUCKET: process.env.NEXT_PUBLIC_BUCKET ?? process.env.BUCKET ?? "videos",
    NEXT_PUBLIC_CHANNEL: process.env.NEXT_PUBLIC_CHANNEL ?? process.env.CHANNEL ?? "photobooth",
  },
};
export default nextConfig;
