import { NextResponse } from "next/server";

// Digital Asset Links for the Android app (android/). Served at
// /.well-known/assetlinks.json via a rewrite in next.config.ts. This verifies
// the Trusted Web Activity (no URL bar) and App Links, so claim links open in the app.
//
// ANDROID_SHA256_CERT_FINGERPRINTS: comma-separated SHA-256 signing-cert
// fingerprints (AA:BB:...). Include your debug key, your upload key, and the
// Play App Signing key from Play Console > App integrity.
export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME || "io.github.jmohak2004.ghar";
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);

  const statements = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];

  return NextResponse.json(statements, { headers: { "cache-control": "public, max-age=3600" } });
}
