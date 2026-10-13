#!/bin/sh
# Quick HTTPS URL for a phone. The hostname changes every run.
# A passkey created here will not work on https://ghar-psi.vercel.app.
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Install once: brew install cloudflared" >&2
  exit 1
fi
exec cloudflared tunnel --url http://localhost:3000
